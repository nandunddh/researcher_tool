"""Custom domains: name validation, the DNS records we ask for, DNS verification, the plan gate and the routes."""
import asyncio
import os
import sys
import unittest
import uuid
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import dns.exception
import dns.resolver
from fastapi import HTTPException

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

import app as web_app  # noqa: E402
import custom_domains as domains  # noqa: E402
import plans  # noqa: E402

OWN = "sciprospect.example-host.org"
IP = "203.0.113.9"


class FakeResolver:
    """Answers from a table of (name, type) -> list of values; anything else does not exist."""
    def __init__(self, table=None, error=None):
        self.table, self.error = table or {}, error

    def resolve(self, name, kind, lifetime, search):
        assert search is False and lifetime
        if self.error:
            raise self.error
        if (name, kind) not in self.table:
            raise dns.resolver.NXDOMAIN()
        values = self.table[(name, kind)]
        if kind == "TXT":
            return [SimpleNamespace(strings=[part.encode() for part in (v if isinstance(v, list) else [v])]) for v in values]
        if kind == "CNAME":
            return [SimpleNamespace(target=v + ".") for v in values]
        return values


class NormalizeTests(unittest.TestCase):
    def test_accepts_and_cleans_real_names(self):
        for raw, expected in (("Events.Uni.EDU.", "events.uni.edu"), ("  www.my-site.org ", "www.my-site.org"),
                              ("bücher.de", "xn--bcher-kva.de"), ("a.b.c.example.io", "a.b.c.example.io")):
            self.assertEqual(domains.normalize(raw, OWN), expected)

    def test_rejects_what_is_not_a_domain_name(self):
        bad = ["", "  ", "x", "http://x.org", "x.org/page", "x.org:8080", "user@x.org", "x .org", "x.org?a=1", "10.0.0.1", "2001:db8::1",
               "-x.org", "x-.org", "x..org", "x.o", "x.123", "a" * 64 + ".org", ("a" * 60 + ".") * 5 + "org", "intranet.local", "x.internal",
               "site.test", "localhost"]
        for raw in bad:
            with self.assertRaises(ValueError, msg=raw):
                domains.normalize(raw, OWN)

    def test_our_own_addresses_cannot_be_claimed(self):
        for raw in (OWN, "www." + OWN, "a.b." + OWN.upper()):
            with self.assertRaises(ValueError) as ctx:
                domains.normalize(raw, OWN)
            self.assertIn("SciProspect", str(ctx.exception))
        self.assertEqual(domains.normalize("notsciprospect.example-host.org", OWN), "notsciprospect.example-host.org")

    def test_own_host_and_ip_come_from_the_environment(self):
        with patch.dict(os.environ, {"SCIPROSPECT_APP_URL": "https://Sciprospect.Example-Host.org/", "SCIPROSPECT_SERVER_IP": f" {IP} "}):
            self.assertEqual((domains.own_host(), domains.server_ip()), (OWN, IP))
        with patch.dict(os.environ, {"SCIPROSPECT_APP_URL": "", "SCIPROSPECT_SERVER_IP": ""}):
            self.assertEqual((domains.own_host(), domains.server_ip()), ("", ""))


class RecordsAndDnsTests(unittest.TestCase):
    def test_records_list_the_proof_and_the_route(self):
        recs = domains.records("events.uni.edu", "tok123", OWN, "")
        self.assertEqual([(r["type"], r["name"], r["value"]) for r in recs],
                         [("TXT", "_sciprospect-verify.events.uni.edu", "tok123"), ("CNAME", "events.uni.edu", OWN)])
        with_ip = domains.records("uni.edu", "tok123", OWN, IP)
        self.assertEqual([r["type"] for r in with_ip], ["TXT", "CNAME", "A"])
        self.assertEqual(with_ip[-1]["value"], IP)
        self.assertEqual([r["type"] for r in domains.records("uni.edu", "t", "", "")], ["TXT"], "nothing configured to point at")

    def check(self, table=None, error=None, ip=""):
        return domains.check_dns("events.uni.edu", "tok123", FakeResolver(table, error), OWN, ip)

    def test_ownership_needs_the_exact_token(self):
        txt = "_sciprospect-verify.events.uni.edu"
        self.assertEqual(self.check({(txt, "TXT"): ["tok123"]}), {"verified": True, "pointing": False})
        self.assertTrue(self.check({(txt, "TXT"): ["other", " tok123 "]})["verified"], "extra records and padding are fine")
        self.assertTrue(self.check({(txt, "TXT"): [["tok", "123"]]})["verified"], "long values arrive as several strings")
        for wrong in ({(txt, "TXT"): ["tok1234"]}, {(txt, "TXT"): ["TOK123"]}, {("events.uni.edu", "TXT"): ["tok123"]}, {}):
            self.assertFalse(self.check(wrong)["verified"])

    def test_pointing_by_cname_or_by_address(self):
        self.assertTrue(self.check({("events.uni.edu", "CNAME"): [OWN.upper().lower()]})["pointing"])
        self.assertFalse(self.check({("events.uni.edu", "CNAME"): ["elsewhere.net"]})["pointing"])
        self.assertTrue(self.check({("events.uni.edu", "A"): [IP]}, ip=IP)["pointing"])
        self.assertFalse(self.check({("events.uni.edu", "A"): ["198.51.100.1"]}, ip=IP)["pointing"])
        self.assertFalse(self.check({("events.uni.edu", "A"): [IP]}, ip="")["pointing"], "an address only counts when we have one configured")

    def test_dns_trouble_means_not_yet_never_an_error(self):
        for error in (dns.resolver.NXDOMAIN(), dns.resolver.NoAnswer(), dns.resolver.NoNameservers(), dns.exception.Timeout()):
            self.assertEqual(self.check(error=error), {"verified": False, "pointing": False})


class PlanGateTests(unittest.TestCase):
    def test_custom_domain_is_a_plan_feature(self):
        self.assertIsNone(plans.feature_message({"limits": {"custom_domain": True}}, "custom_domain"))
        self.assertIsNone(plans.feature_message(None, "custom_domain"), "root has no plan limits")
        for limits in ({"custom_domain": False}, {}, {"custom_domain": "yes"}):
            self.assertIn("Billing", plans.feature_message({"limits": limits}, "custom_domain"))


def run(coro):
    return asyncio.run(coro)


class Req:
    def __init__(self, payload=None):
        self._payload = payload or {}

    async def json(self):
        return self._payload


PRO = {"limits": {"custom_domain": True}}
BASIC = {"limits": {"custom_domain": False}}
SITE = "site_0000000a"


class RouteTests(unittest.TestCase):
    def routes(self, plan, owned=None):
        owned = owned or MagicMock()
        return patch.multiple(web_app, _require_authenticated_user=lambda request: {"license_key": "K"}, _require_scistudio_access=lambda user: None,
                              _require_owned_site=owned, _user_plan=lambda user: plan)

    def test_setting_a_domain_needs_manage_rights_and_a_plan_that_includes_it(self):
        owned = MagicMock()
        with self.routes(PRO, owned), patch.object(domains, "claim") as claim, patch.object(domains, "get", return_value=None):
            out = run(web_app.builder_domain_set(SITE, Req({"hostname": "Events.Uni.edu"})))
        claim.assert_called_once_with(SITE, "events.uni.edu")
        self.assertEqual(owned.call_args.args[2], "manage")
        self.assertTrue(out["allowed"])

    def test_basic_plan_is_refused_without_claiming_anything(self):
        with self.routes(BASIC), patch.object(domains, "claim") as claim:
            with self.assertRaises(HTTPException) as ctx:
                run(web_app.builder_domain_set(SITE, Req({"hostname": "events.uni.edu"})))
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertIn("Pro and Ultra", ctx.exception.detail)
        claim.assert_not_called()

    def test_bad_names_are_a_400_with_a_helpful_message(self):
        for body in ({"hostname": "http://x.org"}, {"hostname": ""}, {}, []):
            with self.routes(PRO), patch.object(domains, "claim") as claim:
                with self.assertRaises(HTTPException) as ctx:
                    run(web_app.builder_domain_set(SITE, Req(body)))
            self.assertEqual(ctx.exception.status_code, 400)
            claim.assert_not_called()

    def test_view_shows_the_records_and_the_plan_message(self):
        stored = {"site_id": SITE, "hostname": "events.uni.edu", "token": "tok", "verified": False}
        with self.routes(BASIC), patch.object(domains, "get", return_value=stored):
            view = run(web_app.builder_domain(SITE, Req()))
        self.assertFalse(view["allowed"])
        self.assertIn("Billing", view["message"])
        self.assertEqual(view["domain"]["hostname"], "events.uni.edu")
        self.assertEqual(view["domain"]["records"][0]["value"], "tok")
        self.assertNotIn("token", view["domain"], "only the TXT record carries it")
        with self.routes(PRO), patch.object(domains, "get", return_value=None):
            self.assertIsNone(run(web_app.builder_domain(SITE, Req()))["domain"])

    def test_verify_reports_progress_and_conflicts(self):
        stored = {"site_id": SITE, "hostname": "events.uni.edu", "token": "tok", "verified": True}
        with self.routes(PRO), patch.object(domains, "get", return_value=stored), \
             patch.object(domains, "verify", return_value={**stored, "pointing": True}):
            view = run(web_app.builder_domain_verify(SITE, Req()))
        self.assertEqual((view["domain"]["verified"], view["domain"]["pointing"]), (True, True))
        for result, status in ((None, 404), (ValueError("Another website has already verified this domain."), 409)):
            with self.routes(PRO), patch.object(domains, "verify", side_effect=result if isinstance(result, Exception) else None, return_value=result):
                with self.assertRaises(HTTPException) as ctx:
                    run(web_app.builder_domain_verify(SITE, Req()))
            self.assertEqual(ctx.exception.status_code, status)

    def test_removing_needs_manage_rights(self):
        owned = MagicMock()
        with self.routes(PRO, owned), patch.object(domains, "release") as release:
            self.assertEqual(run(web_app.builder_domain_remove(SITE, Req())), {"status": "ok"})
        release.assert_called_once_with(SITE)
        self.assertEqual(owned.call_args.args[2], "manage")


@unittest.skipUnless(os.environ.get("SCIPROSPECT_DB_SCHEMA", "").startswith("test_") and os.environ.get("SCIPROSPECT_DB_HOST"),
                     "requires an isolated PostgreSQL test schema")
class DomainStorageTests(unittest.TestCase):
    """Run only against a test schema: claiming, replacing, verifying and the one-verified-owner rule."""
    def site(self):
        import db
        site_id = "site_" + uuid.uuid4().hex[:8]
        with db.transaction() as cur:
            cur.execute("INSERT INTO websites (site_id, owner_email, slug, document) VALUES (%s, %s, %s, '{}')", (site_id, "o@x.org", site_id))
        return site_id

    def verified_resolver(self, hostname, token):
        return lambda: FakeResolver({(f"_sciprospect-verify.{hostname}", "TXT"): [token]})

    def test_claim_replace_verify_and_release(self):
        site = self.site()
        first = domains.claim(site, "a.uni.edu")
        self.assertFalse(first["verified"])
        self.assertEqual(domains.verify(site, lambda: FakeResolver())["verified"], False)
        self.assertTrue(domains.verify(site, self.verified_resolver("a.uni.edu", first["token"]))["verified"])
        second = domains.claim(site, "b.uni.edu")
        self.assertFalse(second["verified"], "a new name has to be proven again")
        self.assertNotEqual(first["token"], second["token"])
        self.assertTrue(domains.release(site))
        self.assertIsNone(domains.get(site))
        self.assertIsNone(domains.verify(site, lambda: FakeResolver()))

    def test_one_website_verifies_a_name_and_a_claim_does_not_block_the_owner(self):
        squatter, owner = self.site(), self.site()
        host = f"{uuid.uuid4().hex[:10]}.uni.edu"
        bad = domains.claim(squatter, host)
        good = domains.claim(owner, host)  # claiming first gives nothing
        self.assertTrue(domains.verify(owner, self.verified_resolver(host, good["token"]))["verified"])
        with self.assertRaises(ValueError):
            domains.verify(squatter, self.verified_resolver(host, bad["token"]))


if __name__ == "__main__":
    unittest.main()
