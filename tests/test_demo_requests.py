"""Book a demo: the form's checks, the public route (rate limit, emails, saving) and root's list."""
import asyncio
import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

import app as web_app  # noqa: E402


async def _inline(fn, *args):
    """Runs the background-thread helper inline, because these tests replace threading.Thread."""
    return fn(*args)
import demo_requests  # noqa: E402


class _Req:
    def __init__(self, payload, host="10.0.0.1"):
        self._payload, self.headers, self.client = payload, {}, SimpleNamespace(host=host)

    async def json(self):
        return self._payload


GOOD = {"name": "  Ada   Lovelace ", "email": "Ada@Lab.ORG", "organization": "Analytical Society", "interest": "studio",
        "message": "  We run a 300-person conference.\nCan we see registration?  ", "times": ["Mon 10:00", " Tue  14:00 ", "Wed"]}


class CleanTests(unittest.TestCase):
    def test_good_requests_are_tidied(self):
        values, problem = demo_requests.clean(GOOD)
        self.assertIsNone(problem)
        self.assertEqual(values, {"name": "Ada Lovelace", "email": "ada@lab.org", "organization": "Analytical Society", "interest": "studio",
                                  "message": "We run a 300-person conference.\nCan we see registration?", "times": "Mon 10:00 | Tue 14:00"})

    def test_problems_are_explained_and_spam_is_refused(self):
        for change, fragment in (({"name": " "}, "name"), ({"email": "nope"}, "valid email"), ({"_hp": "bot"}, "could not be sent")):
            self.assertIn(fragment, demo_requests.clean({**GOOD, **change})[1])
        self.assertIn("fill in", demo_requests.clean([])[1])
        values, _ = demo_requests.clean({**GOOD, "interest": "hack", "times": "Mon", "message": 5, "name": "x" * 500})
        self.assertEqual((values["interest"], values["times"], values["message"], len(values["name"])), ("both", "", "", 120))

    def test_status_must_be_known(self):
        with self.assertRaises(ValueError):
            demo_requests.set_status(1, "deleted")


class RouteTests(unittest.TestCase):
    def test_each_address_gets_five_tries_a_day(self):
        self.assertEqual((self.real_limit.limit, self.real_limit.seconds), (5, 86400))
        for _ in range(5):  # setUp swapped in a fresh copy of the real limit
            self.send(GOOD)
        with self.assertRaises(HTTPException) as ctx:
            self.send(GOOD)
        self.assertEqual(ctx.exception.status_code, 429)
        self.assertIn("5 demo requests a day", ctx.exception.detail)
        self.assertTrue(web_app._demo_limit.allow("10.0.0.2"), "another address is not affected")

    def setUp(self):
        self.real_limit = web_app._demo_limit
        web_app._demo_limit = web_app.FormRateLimit(limit=self.real_limit.limit, seconds=self.real_limit.seconds)
        self.addCleanup(setattr, web_app, "_demo_limit", self.real_limit)

    def send(self, payload, team="", contact=""):
        sent, saved = [], []
        threads = []

        class Thread:
            def __init__(self, target, daemon, args):
                threads.append(args)

            def start(self):
                pass

        with patch.object(demo_requests, "save", side_effect=lambda v: saved.append(v) or 42), \
             patch.object(web_app.threading, "Thread", Thread), patch.dict(os.environ, {"SCIPROSPECT_DEMO_EMAIL": team, "SCIPROSPECT_CONTACT_EMAIL": contact, "SCIPROSPECT_TURNSTILE_SECRET_KEY": ""}), \
             patch.object(web_app, "run_in_threadpool", _inline):
            out = asyncio.run(web_app.public_demo_request(_Req(payload)))
        return out, saved, threads

    def test_a_request_is_saved_confirmed_and_sent_to_the_team(self):
        out, saved, mails = self.send(GOOD, team="sales@sciprospect.example")
        self.assertEqual(out["status"], "ok")
        self.assertEqual(saved[0]["email"], "ada@lab.org")
        self.assertEqual([m[0] for m in mails], ["sales@sciprospect.example", "ada@lab.org"])
        self.assertIn("Demo request #42", mails[0][1])
        self.assertIn("Event websites (SciStudio)", mails[0][2])
        self.assertNotIn("<script", mails[0][3])

    def test_without_a_team_address_only_the_visitor_gets_a_confirmation(self):
        _, _, mails = self.send(GOOD)
        self.assertEqual([m[0] for m in mails], ["ada@lab.org"])

    def test_the_contact_address_hears_about_requests_when_no_team_address_is_set(self):
        _, _, mails = self.send(GOOD, contact="hello@sciprospect.example")
        self.assertEqual([m[0] for m in mails], ["hello@sciprospect.example", "ada@lab.org"])
        _, _, mails = self.send(GOOD, team="sales@sciprospect.example", contact="hello@sciprospect.example")
        self.assertEqual(mails[0][0], "sales@sciprospect.example")

    def test_both_mails_get_the_shared_sign_off_once(self):
        _, _, mails = self.send(GOOD, team="t@x.org")
        for mail in mails:
            self.assertEqual(mail[4:], ())  # default sign=True: send_mail adds the signature
            self.assertNotIn("SciProspect team", mail[2])  # so the body must not carry its own

    def test_names_are_escaped_in_the_team_email(self):
        _, _, mails = self.send({**GOOD, "name": "<script>alert(1)</script>"}, team="t@x.org")
        self.assertIn("&lt;script&gt;", mails[0][3])

    def test_bad_requests_and_floods_are_refused(self):
        with self.assertRaises(HTTPException) as ctx:
            self.send({**GOOD, "email": "x"})
        self.assertEqual(ctx.exception.status_code, 400)
        web_app._demo_limit = web_app.FormRateLimit(limit=1, seconds=900)
        self.send(GOOD)
        with self.assertRaises(HTTPException) as ctx:
            self.send(GOOD)
        self.assertEqual(ctx.exception.status_code, 429)

    def test_only_root_reads_and_updates_requests(self):
        member = {"is_admin": False}
        with patch.object(web_app, "_require_authenticated_user", lambda request: member):
            for call in (lambda: web_app.admin_demo_requests(_Req({})), lambda: web_app.admin_demo_request_status(1, _Req({"status": "done"}))):
                with self.assertRaises(HTTPException) as ctx:
                    asyncio.run(call())
                self.assertEqual(ctx.exception.status_code, 403)
        root = {"is_admin": True}
        with patch.object(web_app, "_require_authenticated_user", lambda request: root), patch.object(demo_requests, "set_status", return_value=False):
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(web_app.admin_demo_request_status(9, _Req({"status": "done"})))
            self.assertEqual(ctx.exception.status_code, 404)
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(web_app.admin_demo_request_status(9, _Req({"status": "gone"})))
            self.assertEqual(ctx.exception.status_code, 400)


if __name__ == "__main__":
    unittest.main()
