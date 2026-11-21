import os
from types import SimpleNamespace
import asyncio
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException

ROOT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT_DIR / "backend"))

import app as web_app
from license_manager import LicenseManager


class _FakeRequest:
    def __init__(self, payload: dict):
        self._payload = payload

    async def json(self):
        return self._payload


class ForgotPasswordTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.temp_path = Path(self.temp_dir.name)
        self.mgr = LicenseManager(
            db_path=self.temp_path / "licenses.json",
            sessions_path=self.temp_path / "sessions.json",
        )
        self.client_acc = self.mgr.create_account(
            name="Dr. Jane Doe",
            email="jane@university.edu",
            account_type="org",
            org_name="BioLab",
            tier="pro",
            seat_limit=5,
            password="OldPassword1!",
        )
        ok, _, self.member = self.mgr.add_org_member(
            parent_key=self.client_acc["license_key"],
            name="Lab Assistant",
            email="assistant@university.edu",
            role="editor",
            password="MemberOld1!",
        )
        self.assertTrue(ok)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_unknown_and_root_emails_rejected(self):
        ok, msg, code = self.mgr.check_password_reset_email("missing@example.com")
        self.assertFalse(ok)
        self.assertEqual(code, 404)
        self.assertIn("No account found", msg)

        for root_id in ("root@sciprospect.internal", "admin", "SCIP-PRO-ROOT-MASTER"):
            ok, _, code = self.mgr.check_password_reset_email(root_id)
            self.assertFalse(ok)
            self.assertIn(code, (400, 403))

    def test_primary_account_reset_updates_password_and_revokes_session(self):
        ok, user, _ = self.mgr.authenticate("jane@university.edu", "OldPassword1!")
        self.assertTrue(ok)
        old_token = self.mgr.issue_session(user)
        self.assertIsNotNone(self.mgr.get_session(old_token))

        ok, _, code = self.mgr.check_password_reset_email("JANE@university.edu")
        self.assertTrue(ok)
        self.assertEqual(code, 200)

        # Short password rejected
        ok, msg, code = self.mgr.reset_password_by_email("jane@university.edu", "123")
        self.assertFalse(ok)
        self.assertEqual(code, 400)
        self.assertIn("6 characters", msg)

        # Valid reset succeeds
        ok, _, code = self.mgr.reset_password_by_email("jane@university.edu", "NewSecret99!")
        self.assertTrue(ok)
        self.assertEqual(code, 200)

        # Old session is invalidated and old password fails
        self.assertIsNone(self.mgr.get_session(old_token))
        ok_old, _, _ = self.mgr.authenticate("jane@university.edu", "OldPassword1!")
        self.assertFalse(ok_old)

        # New password logs in cleanly
        ok_new, _, _ = self.mgr.authenticate("jane@university.edu", "NewSecret99!")
        self.assertTrue(ok_new)

    def test_subaccount_member_reset_updates_password(self):
        ok, _, code = self.mgr.reset_password_by_email("assistant@university.edu", "UpdatedMember9!")
        self.assertTrue(ok)
        self.assertEqual(code, 200)

        ok_old, _, _ = self.mgr.authenticate("assistant@university.edu", "MemberOld1!")
        self.assertFalse(ok_old)
        ok_new, _, _ = self.mgr.authenticate("assistant@university.edu", "UpdatedMember9!")
        self.assertTrue(ok_new)

    def test_stopped_account_cannot_reset_password(self):
        self.mgr.stop_account(self.client_acc["license_key"])
        ok, msg, code = self.mgr.check_password_reset_email("jane@university.edu")
        self.assertFalse(ok)
        self.assertEqual(code, 403)
        self.assertIn("suspended", msg.lower())

        ok_mem, _, code_mem = self.mgr.reset_password_by_email("assistant@university.edu", "ValidPass123!")
        self.assertFalse(ok_mem)
        self.assertEqual(code_mem, 403)

    def test_reset_by_emailed_code_only(self):
        sent = []
        fake_reset = SimpleNamespace(send_code=sent.append, use_code=lambda email, code: email if code == "123456" else None)
        with patch.object(web_app, "license_engine", self.mgr), patch.dict(sys.modules, {"password_reset": fake_reset}):
            known = asyncio.run(web_app.api_auth_forgot_request(_FakeRequest({"email": "jane@university.edu"})))
            unknown = asyncio.run(web_app.api_auth_forgot_request(_FakeRequest({"email": "nope@university.edu"})))
            # Only the echoed email may differ, so accounts can't be discovered.
            self.assertEqual(known["message"].replace("jane@university.edu", "X"),
                             unknown["message"].replace("nope@university.edu", "X"))
            self.assertEqual(known["status"], unknown["status"])
            self.assertEqual(sent, ["jane@university.edu"], "code sent only to real accounts")

            for body, fragment in (({"email": "jane@university.edu", "code": "000000", "new_password": "LongEnough1!"}, "expired"),
                                 ({"email": "jane@university.edu", "code": "123456", "new_password": "short"}, "8 characters")):
                with self.assertRaises(HTTPException) as err:
                    asyncio.run(web_app.api_auth_forgot_confirm(_FakeRequest(body)))
                self.assertIn(fragment, err.exception.detail)
            done = asyncio.run(web_app.api_auth_forgot_confirm(_FakeRequest({"email": "jane@university.edu", "code": "123456", "new_password": "EndpointPass1!"})))
            self.assertEqual(done["status"], "ok")
        self.assertTrue(self.mgr.authenticate("jane@university.edu", "EndpointPass1!")[0])
        self.assertFalse(hasattr(web_app, "api_auth_forgot_reset"), "email-only reset endpoint must stay removed")



@unittest.skipUnless(os.environ.get("SCIPROSPECT_DB_SCHEMA", "").startswith("test_"), "Database test: set SCIPROSPECT_DB_SCHEMA=test_<name> (never the live data).")
class ResetCodeDbTests(unittest.TestCase):
    def test_code_single_use_and_five_wrong_tries_kill_it(self):
        import password_reset as pr
        email = "codecheck@university.edu"
        code = pr.create_code(email)
        self.assertIsNone(pr.use_code(email, "x"))
        self.assertEqual(pr.use_code(email, code), email)
        self.assertIsNone(pr.use_code(email, code), "single use")
        code = pr.create_code(email)
        for _ in range(pr.MAX_ATTEMPTS):
            self.assertIsNone(pr.use_code(email, "wrong!"))
        self.assertIsNone(pr.use_code(email, code), "dead after 5 wrong tries")


if __name__ == "__main__":
    unittest.main()

