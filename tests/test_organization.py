"""Organization dashboard and team management regression tests.
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
    def __init__(self, payload=None, user=None, headers=None, cookies=None):
        self._payload = payload or {}
        self._user = user
        self.headers = headers or {}
        self.cookies = cookies or {}

    async def json(self):
        return self._payload


class OrganizationWorkflowTests(unittest.TestCase):
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

        # Create Organization Account A
        self.org_a = self.manager.create_account(
            name="Org A Owner",
            email="owner_a@orga.test",
            account_type="org",
            org_name="Institute Alpha",
            seat_limit=2,
            tier="pro",
        )
        self.key_a = self.org_a["license_key"]
        self.user_a = {
            "client_email": "owner_a@orga.test",
            "client_name": "Org A Owner",
            "license_key": self.key_a,
            "is_admin": False,
            "is_member": False,
        }

        # Create Organization Account B
        self.org_b = self.manager.create_account(
            name="Org B Owner",
            email="owner_b@orgb.test",
            account_type="org",
            org_name="Institute Beta",
            seat_limit=5,
            tier="trial",
        )
        self.key_b = self.org_b["license_key"]
        self.user_b = {
            "client_email": "owner_b@orgb.test",
            "client_name": "Org B Owner",
            "license_key": self.key_b,
            "is_admin": False,
            "is_member": False,
        }

        # Create Solo Client User
        self.solo_client = self.manager.create_account(
            name="Solo Researcher",
            email="solo@solo.test",
            account_type="single",
            seat_limit=1,
        )
        self.user_solo = {
            "client_email": "solo@solo.test",
            "client_name": "Solo Researcher",
            "license_key": self.solo_client["license_key"],
            "is_admin": False,
            "is_member": False,
        }

    def _req(self, user, payload=None):
        return _FakeRequest(payload=payload, user=user)

    def test_organization_overview_returns_scoped_data(self):
        with patch.object(self.web_app, "_get_current_user_from_request", return_value=self.user_a):
            res = self.async_run(self.web_app.organization_overview(self._req(self.user_a)))
            self.assertEqual(res["org_name"], "Institute Alpha")
            self.assertEqual(res["license_key"], self.key_a)
            self.assertEqual(res["seat_limit"], 2)
            self.assertEqual(len(res["members"]), 0)
            self.assertNotIn("password_hash", res)

    def test_solo_client_and_member_denied_from_organization_api(self):
        from fastapi import HTTPException
        # Solo client
        with patch.object(self.web_app, "_get_current_user_from_request", return_value=self.user_solo):
            with self.assertRaises(HTTPException) as ctx:
                self.async_run(self.web_app.organization_overview(self._req(self.user_solo)))
            self.assertEqual(ctx.exception.status_code, 403)

        # Team member
        member_user = {"is_admin": False, "is_member": True, "license_key": self.key_a}
        with patch.object(self.web_app, "_get_current_user_from_request", return_value=member_user):
            with self.assertRaises(HTTPException) as ctx:
                self.async_run(self.web_app.organization_overview(self._req(member_user)))
            self.assertEqual(ctx.exception.status_code, 403)

    def test_organization_member_lifecycle_and_seat_limits(self):
        from fastapi import HTTPException
        with patch.object(self.web_app, "_get_current_user_from_request", return_value=self.user_a):
            # 1. Add member 1
            res1 = self.async_run(self.web_app.organization_team_add(self._req(self.user_a, {
                "name": "Member One",
                "email": "m1@orga.test",
                "role": "editor",
                "studio": True,
            })))
            self.assertEqual(res1["status"], "ok")
            m1_id = res1["member"]["member_id"]
            self.assertNotIn("password_hash", res1["member"])

            # 2. Add member 2 (hits seat limit 2/2)
            res2 = self.async_run(self.web_app.organization_team_add(self._req(self.user_a, {
                "name": "Member Two",
                "email": "m2@orga.test",
                "role": "viewer",
            })))
            self.assertEqual(res2["status"], "ok")

            # 3. Add member 3 (breaches limit -> 400)
            with self.assertRaises(HTTPException) as ctx:
                self.async_run(self.web_app.organization_team_add(self._req(self.user_a, {
                    "name": "Member Three",
                    "email": "m3@orga.test",
                })))
            self.assertEqual(ctx.exception.status_code, 400)
            self.assertIn("limit reached", ctx.exception.detail.lower())

            # 4. Duplicate email rejected -> 400
            with self.assertRaises(HTTPException) as ctx:
                self.async_run(self.web_app.organization_team_add(self._req(self.user_a, {
                    "name": "Duplicate Member",
                    "email": "m1@orga.test",
                })))
            self.assertEqual(ctx.exception.status_code, 400)

            # 5. Toggle SciStudio
            tog = self.async_run(self.web_app.organization_team_toggle_studio(self._req(self.user_a, {
                "member_id": m1_id,
                "enabled": False,
            })))
            self.assertEqual(tog["status"], "ok")
            self.assertFalse(tog["member"]["scistudio_access"])

            # 6. Remove member 1
            rem = self.async_run(self.web_app.organization_team_remove(self._req(self.user_a, {
                "member_id": m1_id,
            })))
            self.assertEqual(rem["status"], "ok")
            acc = self.manager.get_account(self.key_a)
            self.assertEqual(len(acc["members"]), 1)

    def test_cross_organization_tampering_impossible(self):
        # Even if Org A attempts to remove a member belonging to Org B,
        # Org A's request is scoped to key_a, so Org B's member cannot be removed
        ok, _, member_b = self.manager.add_org_member(self.key_b, "Beta Member", "beta@orgb.test")
        self.assertTrue(ok)
        mb_id = member_b["member_id"]

        from fastapi import HTTPException
        with patch.object(self.web_app, "_get_current_user_from_request", return_value=self.user_a):
            with self.assertRaises(HTTPException) as ctx:
                self.async_run(self.web_app.organization_team_remove(self._req(self.user_a, {
                    "member_id": mb_id,
                })))
            self.assertEqual(ctx.exception.status_code, 400)

        # Verify Org B's member is untouched
        self.assertEqual(len(self.manager.get_account(self.key_b)["members"]), 1)


if __name__ == "__main__":
    unittest.main()
