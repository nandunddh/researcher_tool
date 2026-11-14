"""Client individual workspace regression tests.
Temporary storage only; cloud connections disabled.
"""
import contextlib
import io
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
import license_manager as lm

class _FakeRequest:
    def __init__(self, payload=None, user=None):
        self._payload = payload or {}
        self._user = user
        self.headers = {}
        self.cookies = {}

    async def json(self):
        return self._payload


class ClientWorkspaceTests(unittest.TestCase):
    def setUp(self):
        import asyncio
        self.async_run = asyncio.run
        self.temp = tempfile.TemporaryDirectory(dir=ROOT / "tests")
        self.addCleanup(self.temp.cleanup)
        self.cloud = patch.dict(lm.PG_CONFIG, {"host": ""})
        self.cloud.start()
        self.addCleanup(self.cloud.stop)
        self.output = contextlib.redirect_stdout(io.StringIO())
        self.output.__enter__()
        self.addCleanup(self.output.__exit__, None, None, None)

        base = Path(self.temp.name)
        self.manager = lm.LicenseManager(base / "licenses.json", base / "sessions.json")
        import app as web_app
        self.web_app = web_app
        self.engine_patch = patch.object(web_app, "license_engine", self.manager)
        self.engine_patch.start()
        self.addCleanup(self.engine_patch.stop)

        self.client_a = self.manager.create_account(
            name="Dr. Individual A",
            email="clienta@research.test",
            account_type="single",
            tier="pro",
            daily_limit=500,
        )
        self.user_a = {
            "client_email": "clienta@research.test",
            "client_name": "Dr. Individual A",
            "license_key": self.client_a["license_key"],
            "is_admin": False,
            "is_member": False,
        }

        self.org_user = {
            "client_email": "org@org.test",
            "client_name": "Org Owner",
            "license_key": "some-org-key",
            "is_admin": False,
            "is_member": False,
        }

    def _req(self, user):
        return _FakeRequest(user=user)

    def test_client_overview_returns_scoped_metrics(self):
        with patch.object(self.web_app, "_get_current_user_from_request", return_value=self.user_a):
            res = self.async_run(self.web_app.client_overview(self._req(self.user_a)))
            self.assertEqual(res["client_name"], "Dr. Individual A")
            self.assertEqual(res["license_key"], self.client_a["license_key"])
            self.assertEqual(res["daily_limit"], 500)
            self.assertNotIn("password_hash", res)
            self.assertNotIn("password", res)

    def test_organization_and_anonymous_denied_from_client_api(self):
        from fastapi import HTTPException
        # Anonymous
        with patch.object(self.web_app, "_get_current_user_from_request", return_value=None):
            with self.assertRaises(HTTPException) as ctx:
                self.async_run(self.web_app.client_overview(self._req(None)))
            self.assertEqual(ctx.exception.status_code, 401)

        # Member
        member_user = {"is_admin": False, "is_member": True, "license_key": self.client_a["license_key"]}
        with patch.object(self.web_app, "_get_current_user_from_request", return_value=member_user):
            with self.assertRaises(HTTPException) as ctx:
                self.async_run(self.web_app.client_overview(self._req(member_user)))
            self.assertEqual(ctx.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()
