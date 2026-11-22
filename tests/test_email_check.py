import asyncio
import csv
import io
import json
import os
import sys
import unittest
import uuid
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "backend"), str(ROOT / "backend/collector_sources")]
import dns.exception
import dns.resolver
from fastapi import FastAPI, HTTPException
import collector_archive as archive
from collector_routes import collector_router
from email_check import EmailChecker, check


class FixtureResolver:
    def __init__(self, **answers):
        self.answers = answers
        self.calls = []

    def resolve(self, domain, kind, *, lifetime, search):
        assert lifetime == 3 and search is False
        self.calls.append((domain, kind))
        result = self.answers[kind]
        if isinstance(result, Exception):
            raise result
        return [SimpleNamespace(exchange=result)] if kind == "MX" else [result]


def collector_api():
    def auth(request):
        identity = request.headers.get("X-Test-Identity")
        if not identity:
            raise HTTPException(401)
        return {"client_email": identity, "is_member": identity == "member"}

    app = FastAPI()
    app.include_router(collector_router(auth, None))
    async def post(identity, body):
        messages = []
        async def receive():
            return {"type": "http.request", "body": json.dumps(body or {}).encode()}
        async def send(message):
            messages.append(message)
        scope = {"type": "http", "method": "POST", "path": "/api/collector/contacts/check",
                 "query_string": b"", "headers": [(b"x-test-identity", identity.encode()),
                                                   (b"content-type", b"application/json")]}
        await app(scope, receive, send)
        return messages[0]["status"], json.loads(messages[-1]["body"])
    return lambda identity, body=None: asyncio.run(post(identity, body))


class EmailCheckTests(unittest.TestCase):
    def test_format_disposable_and_cache(self):
        resolver = FixtureResolver(MX="mail.lab.test.")
        checker = EmailChecker(resolver)
        for address in ["a..b@lab.test", "name@-lab.test", "name@localhost", "bad@@lab.test", ""]:
            self.assertEqual(checker.check(address)["delivery_status"], "invalid_format")
        result = checker.check("INFO@sub.MAILINATOR.com")
        self.assertEqual(result["delivery_status"], "disposable")
        self.assertTrue(result["checks"]["role"])
        self.assertFalse(resolver.calls)
        for address, status in [("Li+lab@Lab.test", "deliverable_domain"), ("OFFICE@lab.TEST", "role")]:
            result = checker.check(address)
            self.assertEqual(result["delivery_status"], status)
            self.assertTrue(result["checks"]["mail_server"])
            self.assertIsNotNone(datetime.fromisoformat(result["checked_at"]).tzinfo)
        self.assertEqual(resolver.calls, [("lab.test", "MX")])

    def test_dns_outcomes(self):
        no_answer = dns.resolver.NoAnswer()
        for answers, status in [
            ({"MX": no_answer, "A": "192.0.2.1"}, "deliverable_domain"),
            ({"MX": no_answer, "A": no_answer}, "no_mail_server"),
            ({"MX": "."}, "no_mail_server"),
            ({"MX": dns.resolver.NXDOMAIN()}, "no_domain"),
            ({"MX": dns.exception.Timeout()}, "unknown"),
            ({"MX": no_answer, "A": dns.exception.Timeout()}, "unknown"),
        ]:
            with self.subTest(status=status, answers=answers):
                resolver = FixtureResolver(**answers)
                self.assertEqual(check("person@lab.test", resolver)["delivery_status"], status)
                self.assertEqual([kind for _, kind in resolver.calls], list(answers))

    def test_recheck_auth_and_rate_limit(self):
        post = collector_api()
        with patch.object(archive, "recheck_contacts", return_value={"checked": 0}) as run:
            for identity, code in [("", 401), ("member", 403)]:
                self.assertEqual(post(identity)[0], code)
            run.assert_not_called()
            with patch("collector_routes.FormRateLimit.allow", return_value=False):
                self.assertEqual(post("a@lab.test")[0], 429)
            post("a@lab.test", {"owner": "other", "after": "cursor"})
            run.assert_called_once_with("owner:a@lab.test", "cursor")

    @unittest.skipUnless(os.getenv("SCIPROSPECT_DB_SCHEMA", "").startswith("test_") and os.getenv("SCIPROSPECT_DB_HOST"),
                         "requires an isolated PostgreSQL test schema")
    def test_saved_rechecked_filtered_and_exported(self):
        identity = uuid.uuid4().hex + "@fixture.test"
        owner = "owner:" + identity
        other = owner + ".other"
        def seed(key):
            run = archive.create(key, "fixture", 2, 10, "2025-01-01", "2025-02-01")
            writer = archive.Archive(key, run)
            for address in ["a@lab.test", "office@lab.test"]:
                writer.save({"email": address})
            return run
        with patch("email_check.default_resolver", return_value=FixtureResolver(MX=dns.exception.Timeout())):
            run = seed(owner)
            other_run = seed(other)
        self.assertEqual(len(archive.results(owner, run, delivery_status="unknown")), 2)
        resolver = FixtureResolver(MX="mail.lab.test.")
        post = collector_api()
        with patch("email_check.default_resolver", return_value=resolver):
            first = archive.recheck_contacts(owner, batch_size=1)
            self.assertEqual(first, {"checked": 1, "next_after": "a@lab.test"})
            self.assertEqual(post(identity, {"after": first["next_after"]}), (200, {"checked": 1, "next_after": None}))
        filtered = archive.results(owner, run, limit=1, delivery_status="role")
        self.assertEqual(filtered[0]["professional_email"], "office@lab.test")
        self.assertTrue(filtered[0]["checks"]["role"])
        self.assertEqual(len(archive.results(other, other_run, delivery_status="unknown")), 2)
        exported = csv.DictReader(io.StringIO(archive.csv_export(owner, run).decode("utf-8-sig")))
        self.assertEqual([r["delivery_status"] for r in exported], ["deliverable_domain", "role"])


class LeadsExplorerTests(unittest.TestCase):
    """Search, sort and page size for the Leads Explorer."""
    def get(self, query):
        app = FastAPI()
        app.include_router(collector_router(lambda request: {"client_email": "a@lab.test"}, None))
        messages = []

        async def receive():
            return {"type": "http.request", "body": b""}

        async def send(message):
            messages.append(message)
        scope = {"type": "http", "method": "GET", "path": "/api/collector/runs/7f8b0c6e-2c4a-4d1e-9b1a-0f5e6d7c8b9a/results",
                 "query_string": query.encode(), "headers": []}
        asyncio.run(app(scope, receive, send))
        return messages[0]["status"]

    def test_search_sort_and_page_size_reach_the_archive(self):
        with patch.object(archive, "results", return_value=[]) as found:
            self.assertEqual(self.get("q=lab_50%25&sort=affiliation&order=desc&limit=251"), 200)
        args = found.call_args.args
        self.assertEqual(args[5:], ("lab_50%", "affiliation", "desc"))
        self.assertEqual(args[2], 251)

    def test_bad_sort_or_size_is_refused(self):
        with patch.object(archive, "results", return_value=[]) as found:
            for query in ("sort=drop%20table", "order=up", "limit=1000"):
                self.assertIn(self.get(query), (400, 422))
            found.assert_not_called()

    @unittest.skipUnless(os.getenv("SCIPROSPECT_DB_SCHEMA", "").startswith("test_") and os.getenv("SCIPROSPECT_DB_HOST"),
                         "requires an isolated PostgreSQL test schema")
    def test_search_is_literal_and_sort_orders_rows(self):
        owner = "owner:" + uuid.uuid4().hex + "@fixture.test"
        run = archive.create(owner, "fixture", 3, 10, "2025-01-01", "2025-02-01")
        writer = archive.Archive(owner, run)
        with patch("email_check.default_resolver", return_value=FixtureResolver(MX=dns.exception.Timeout())):
            for name, address in (("Ada", "ada@lab.test"), ("Zed", "zed@lab.test"), ("50% Bob", "bob@lab.test")):
                writer.save({"email": address, "researcher_name": name})
        self.assertEqual([r["professional_email"] for r in archive.results(owner, run, q="50%")], ["bob@lab.test"], "% is literal")
        names = [r["researcher_name"] for r in archive.results(owner, run, sort="name", order="desc")]
        self.assertEqual(names, sorted(names, reverse=True))


class DailyLimitTests(unittest.TestCase):
    """Collections respect the license's contacts-per-day limit."""
    def call(self, method, path, body=None, limit=100, admin=False):
        recorded = []
        licenses = SimpleNamespace(validate_license=lambda key: {"valid": True, "daily_limit": limit}, record_usage=lambda k, n: recorded.append((k, n)))
        app = FastAPI()
        app.include_router(collector_router(lambda request: {"client_email": "a@lab.test", "license_key": "KEY", "is_admin": admin}, licenses))
        messages = []

        async def receive():
            return {"type": "http.request", "body": json.dumps(body or {}).encode()}

        async def send(message):
            messages.append(message)
        scope = {"type": "http", "method": method, "path": path, "query_string": b"", "headers": [(b"content-type", b"application/json")]}
        asyncio.run(app(scope, receive, send))
        return messages[0]["status"], json.loads(messages[-1]["body"] or b"{}"), recorded

    def start(self, target, used_today, **kw):
        body = {"topic": "cell biology", "target": target, "min_score": 50, "from_date": "2026-01-01", "to_date": "2026-11-01"}
        with patch.object(archive, "stats", return_value={"total": 0, "today": used_today, "datasets": 0}), \
                patch.object(archive, "create", return_value="run-1") as create, patch.object(archive, "execute"), \
                patch.object(archive, "history", return_value=[{"id": "run-1", "collected": target}]):
            status, data, recorded = self.call("POST", "/api/collector/runs", body, **kw)
        return status, data, create, recorded

    def test_limit_blocks_and_explains(self):
        status, data, create, _ = self.start(50, 80)
        self.assertEqual((status, create.called), (400, False))
        self.assertIn("20 more contacts today", data["detail"])
        status, data, create, _ = self.start(10, 100)
        self.assertEqual(status, 429)
        self.assertIn("today's limit of 100", data["detail"])

    def test_within_limit_runs_and_counts_usage(self):
        status, _, create, recorded = self.start(20, 80)
        self.assertEqual(status, 202)
        self.assertEqual(recorded, [("KEY", 20)], "usage recorded on the license after the run")

    def test_unlimited_for_pro_and_root(self):
        self.assertEqual(self.start(5000, 9999, limit=-1)[0], 202)
        self.assertEqual(self.start(5000, 9999, admin=True)[0], 202)

    def test_stats_show_what_is_left(self):
        with patch.object(archive, "stats", return_value={"total": 5, "today": 30, "datasets": 1}):
            status, data, _ = self.call("GET", "/api/collector/stats")
        self.assertEqual((status, data["daily_limit"], data["remaining_today"]), (200, 100, 70))


class AllContactsTests(DailyLimitTests):
    def test_all_contacts_route_passes_search_and_sort(self):
        with patch.object(archive, "all_contacts", return_value=[{"professional_email": "a@lab.test"}]) as found:
            status, data, _ = self.call("GET", "/api/collector/contacts")
        self.assertEqual((status, len(data)), (200, 1))
        self.assertEqual(found.call_args.args[0], "owner:a@lab.test", "only this workspace's contacts")

    def test_export_is_a_csv(self):
        with patch.object(archive, "all_contacts_csv", return_value=b"email\r\na@lab.test\r\n"):
            app = FastAPI()
            app.include_router(collector_router(lambda request: {"client_email": "a@lab.test"}, None))
            messages = []

            async def receive():
                return {"type": "http.request", "body": b""}

            async def send(message):
                messages.append(message)
            asyncio.run(app({"type": "http", "method": "GET", "path": "/api/collector/contacts/export", "query_string": b"", "headers": []}, receive, send))
        headers = dict(messages[0]["headers"])
        self.assertEqual(messages[0]["status"], 200)
        self.assertIn(b"all-contacts.csv", headers[b"content-disposition"])


class ManageDatasetsTests(DailyLimitTests):
    RUN = "/api/collector/runs/7f8b0c6e-2c4a-4d1e-9b1a-0f5e6d7c8b9a"

    def test_delete_and_rename(self):
        with patch.object(archive, "delete_run") as delete:
            self.assertEqual(self.call("DELETE", self.RUN)[0], 204)
        self.assertEqual(delete.call_args.args[0], "owner:a@lab.test")
        with patch.object(archive, "delete_run", side_effect=ValueError("Stop the collection before deleting it.")):
            status, data, _ = self.call("DELETE", self.RUN)
        self.assertEqual((status, data["detail"]), (409, "Stop the collection before deleting it."))
        with patch.object(archive, "delete_run", side_effect=KeyError("x")):
            self.assertEqual(self.call("DELETE", self.RUN)[0], 404, "someone else's collection")
        with patch.object(archive, "rename_run") as rename:
            self.assertEqual(self.call("PATCH", self.RUN, {"topic": "  Neuro 2027 "})[0], 200)
        self.assertEqual(rename.call_args.args[2], "Neuro 2027")
        self.assertIn(self.call("PATCH", self.RUN, {"topic": ""})[0], (400, 422))
