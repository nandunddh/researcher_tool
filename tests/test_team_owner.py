"""Solo accounts with a plan that includes team members can invite and remove them, up to the plan's seat count."""
import asyncio
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


class _Req:
    def __init__(self, payload=None):
        self._payload = payload or {}

    async def json(self):
        return self._payload


class TeamOwnerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.mgr = LicenseManager(db_path=Path(self.tmp.name) / "l.json", sessions_path=Path(self.tmp.name) / "s.json")
        self.solo = self.mgr.create_account(name="Ada", email="ada@lab.org", tier="pro", account_type="single", password="Password1!")
        self.mgr.set_plan(self.solo["license_key"], "basic", 1)  # Basic: 2 users = the owner + 1 member
        self.org = self.mgr.create_account(name="Org", email="org@lab.org", tier="pro", account_type="org", org_name="Lab", seat_limit=5, password="Password1!")

    def tearDown(self):
        self.tmp.cleanup()

    def as_user(self, user):
        return patch.multiple(web_app, license_engine=self.mgr, _get_current_user_from_request=lambda request: user)

    def owner(self, account):
        return {"license_key": account["license_key"], "client_email": account["client_email"], "is_member": False}

    def add(self, account, email, name="Teammate"):
        with self.as_user(self.owner(account)):
            return asyncio.run(web_app.organization_team_add(_Req({"name": name, "email": email, "role": "editor", "password": "Password1!"})))

    def test_solo_owner_adds_and_removes_within_the_plan(self):
        res = self.add(self.solo, "mem@lab.org")
        self.assertEqual(res["member"]["email"], "mem@lab.org")
        with self.assertRaises(HTTPException) as err:  # Basic has one member seat
            self.add(self.solo, "second@lab.org")
        self.assertEqual(err.exception.status_code, 400)
        self.assertIn("seat limit reached", err.exception.detail.lower())
        with self.as_user(self.owner(self.solo)):
            asyncio.run(web_app.organization_team_remove(_Req({"member_id": res["member"]["member_id"]})))
        self.assertEqual(self.add(self.solo, "second@lab.org")["status"], "ok")

    def test_organizations_still_work_and_members_cannot_manage_the_team(self):
        self.assertEqual(self.add(self.org, "mem@lab.org")["status"], "ok")
        member = {"license_key": self.solo["license_key"], "is_member": True, "client_email": "mem@lab.org"}
        for call in (web_app.organization_team_add, web_app.organization_team_remove, web_app.organization_team_toggle_studio):
            with self.as_user(member), self.assertRaises(HTTPException) as err:
                asyncio.run(call(_Req({"name": "x", "email": "x@lab.org", "member_id": "m"})))
            self.assertEqual(err.exception.status_code, 403)

    def test_trial_owner_has_no_seats(self):
        trial = self.mgr.create_account(name="T", email="t@lab.org", tier="trial", account_type="single", password="Password1!")
        self.mgr.set_plan(trial["license_key"], "trial", 0)
        with self.assertRaises(HTTPException) as err:
            self.add(trial, "mem@lab.org")
        self.assertIn("seat limit reached", err.exception.detail.lower())

    def test_team_member_is_held_to_the_owners_plan(self):
        seen = []
        member = {"license_key": self.solo["license_key"], "is_member": True, "is_admin": False}
        with patch.object(web_app, "license_engine", self.mgr),              patch.object(web_app, "_plan_of_account", lambda account: seen.append(account["license_key"]) or {"id": "basic"}):
            self.assertEqual(web_app._user_plan(member), {"id": "basic"})
        self.assertEqual(seen, [self.solo["license_key"]])

    def test_data_storage_message_follows_the_plan(self):
        plan = {"limits": {"data_storage_mb": 100}}
        for used, expect_blocked in ((90.0, False), (100.0, False), (100.1, True)):
            with patch.object(web_app, "license_engine", self.mgr), patch.object(web_app, "_plan_of_account", lambda account: plan),                  patch("plans.data_storage_mb", lambda email: used):
                message = web_app._data_storage_message(self.solo["license_key"])
            self.assertEqual(bool(message), expect_blocked, used)
        with patch.object(web_app, "license_engine", self.mgr), patch.object(web_app, "_plan_of_account", lambda account: None):
            self.assertIsNone(web_app._data_storage_message(self.solo["license_key"]), "root and unplanned accounts have no limit")

    def test_client_overview_lists_members_and_seats(self):
        self.add(self.solo, "mem@lab.org")
        with self.as_user(self.owner(self.solo)), patch.object(web_app.conference_engine, "list_conferences", return_value=[]):
            overview = asyncio.run(web_app.client_overview(_Req()))
        self.assertEqual(overview["seat_limit"], 1)
        self.assertEqual([m["email"] for m in overview["members"]], ["mem@lab.org"])
        self.assertNotIn("password_hash", overview["members"][0])


if __name__ == "__main__":
    unittest.main()
