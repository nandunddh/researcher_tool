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

    def test_fastapi_endpoints_and_ui_markup(self):
        with patch.object(web_app, "license_engine", self.mgr):
            res_check = asyncio.run(web_app.api_auth_forgot_check(_FakeRequest({"email": "jane@university.edu"})))
            self.assertEqual(res_check["status"], "ok")
            self.assertTrue(res_check["exists"])

            res_reset = asyncio.run(
                web_app.api_auth_forgot_reset(
                    _FakeRequest({"email": "jane@university.edu", "new_password": "EndpointPass1!"})
                )
            )
            self.assertEqual(res_reset["status"], "ok")

            with self.assertRaises(HTTPException) as err:
                asyncio.run(web_app.api_auth_forgot_check(_FakeRequest({"email": "nope@university.edu"})))
            self.assertEqual(err.exception.status_code, 404)

        ok_new, _, _ = self.mgr.authenticate("jane@university.edu", "EndpointPass1!")
        self.assertTrue(ok_new)

        html = (ROOT_DIR / "backend" / "static" / "index.html").read_text(encoding="utf-8")
        self.assertIn('id="btn-open-forgot-pwd"', html)
        self.assertIn('id="auth-view-forgot"', html)
        self.assertIn('id="forgot-step-email"', html)
        self.assertIn('id="forgot-step-password"', html)
        self.assertIn('id="auth-success-box"', html)


if __name__ == "__main__":
    unittest.main()

