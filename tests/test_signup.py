import asyncio
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

ROOT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT_DIR / "backend"))

import app as web_app
import signup
from license_manager import LicenseManager, hash_password

GOOD = {"name": "Ada", "email": "Ada@Uni.edu", "password": "Password1!", "account_type": "org", "org_name": "Lab", "plan_id": "pro", "accept_terms": True}


class _Req:
    def __init__(self, payload):
        self._payload, self.client, self.url, self.headers, self.cookies = payload, None, SimpleNamespace(scheme="http"), {}, {}

    async def json(self):
        return self._payload


class SignupRulesTests(unittest.TestCase):
    def test_clean(self):
        details, problem = signup.clean(GOOD)
        self.assertIsNone(problem)
        self.assertEqual(details["email"], "ada@uni.edu")
        self.assertTrue(details["password_hash"].startswith("pbkdf2_sha256$"), "only the hash is kept")
        self.assertNotIn("password", details)
        for change, fragment in (({"name": ""}, "name"), ({"email": "x"}, "valid email"), ({"password": "short"}, "8 characters"),
                                 ({"org_name": ""}, "organization"), ({"accept_terms": False}, "terms")):
            self.assertIn(fragment, signup.clean({**GOOD, **change})[1])
        self.assertEqual(signup.clean({**GOOD, "account_type": "single", "org_name": "ignored"})[0]["org_name"], "")


class SignupFlowTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.mgr = LicenseManager(db_path=Path(self.tmp.name) / "l.json", sessions_path=Path(self.tmp.name) / "s.json")
        web_app._signup_limit = web_app.FormRateLimit(limit=100, seconds=900)
        web_app._reset_confirm_limit = web_app.FormRateLimit(limit=100, seconds=900)

    def tearDown(self):
        self.tmp.cleanup()

    def test_code_creates_free_account_and_signs_in(self):
        started = []
        details = {"name": "Ada", "email": "ada@uni.edu", "account_type": "org", "org_name": "Lab", "plan_id": "pro", "password_hash": hash_password("Password1!")}
        fake = SimpleNamespace(clean=signup.clean, start=started.append,
                               verify=lambda email, code: (details, None) if code == "123456" else (None, "That code is not right."))
        with patch.object(web_app, "license_engine", self.mgr), patch.dict(sys.modules, {"signup": fake}):
            asyncio.run(web_app.api_signup_start(_Req(GOOD)))
            self.assertEqual(len(started), 1)
            with self.assertRaises(HTTPException):
                asyncio.run(web_app.api_signup_verify(_Req({"email": "ada@uni.edu", "code": "000000", "password": "Password1!"})))
            res = asyncio.run(web_app.api_signup_verify(_Req({"email": "ada@uni.edu", "code": "123456", "password": "Password1!"})))
            self.assertIn("scip_token=", res.headers.get("set-cookie", ""))
            account = self.mgr.account_for_email("ada@uni.edu")
            self.assertEqual((account["plan_id"], account["account_type"], account["org_name"]), ("free", "org", "Lab"), "paid plans start after checkout")
            with self.assertRaises(HTTPException) as err:
                asyncio.run(web_app.api_signup_start(_Req(GOOD)))
            self.assertEqual(err.exception.status_code, 409, "existing email")


if __name__ == "__main__":
    unittest.main()
