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
sys.path[:0] = [str(ROOT / "backend"), str(ROOT / "app/main")]
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
