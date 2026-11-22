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
from license_manager import LicenseManager


class TeamAccessTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.mgr = LicenseManager(db_path=Path(self.tmp.name) / "l.json", sessions_path=Path(self.tmp.name) / "s.json")
        self.org = self.mgr.create_account(name="Jane", email="jane@uni.edu", account_type="org", org_name="Lab", tier="pro", seat_limit=5, password="Password1!")
        self.other = self.mgr.create_account(name="Bob", email="bob@other.edu", account_type="org", org_name="Other", tier="pro", seat_limit=5, password="Password1!")
        for role in ("admin", "editor", "viewer"):
            self.mgr.add_org_member(parent_key=self.org["license_key"], name=role, email=f"{role}@uni.edu", role=role, password="Password1!")
        sites = {"site_0000000a": {"site_id": "site_0000000a", "user_email": "jane@uni.edu"}, "site_0000000b": {"site_id": "site_0000000b", "user_email": "bob@other.edu"}}
        self.engine = SimpleNamespace(get_site=sites.get)

    def tearDown(self):
        self.tmp.cleanup()

    def member(self, role):
        ok, user, _ = self.mgr.authenticate(f"{role}@uni.edu", "Password1!")
        self.assertTrue(ok)
        return user

    def check(self, role, need, site="site_0000000a"):
        with patch.object(web_app, "license_engine", self.mgr), patch.object(web_app, "builder_engine", self.engine):
            return web_app._require_owned_site(site, self.member(role), need)

    def denied(self, role, need, site="site_0000000a"):
        with self.assertRaises(HTTPException) as err:
            self.check(role, need, site)
        return err.exception

    def test_roles_on_the_organization_websites(self):
        for role in ("viewer", "editor", "admin"):
            self.assertTrue(self.check(role, "view"))
        self.assertTrue(self.check("editor", "edit"))
        self.assertIn("Viewers", self.denied("viewer", "edit").detail)
        self.assertTrue(self.check("admin", "manage"))
        self.assertEqual(self.denied("editor", "manage").status_code, 403, "only admins publish / delete / see submissions")

    def test_never_another_organizations_website(self):
        self.assertEqual(self.denied("admin", "view", "site_0000000b").status_code, 404)

    def test_scistudio_switch_still_applies(self):
        self.mgr.toggle_member_scistudio(self.org["license_key"], self.member("editor")["member_id"], False)
        self.assertIn("turned off", self.denied("editor", "view").detail)

    def test_members_work_in_the_owners_workspace(self):
        with patch.object(web_app, "license_engine", self.mgr):
            self.assertEqual(web_app._workspace_email(self.member("editor")), "jane@uni.edu")
            web_app._require_scistudio_access(self.member("viewer"))  # no longer blanket-blocked


if __name__ == "__main__":
    unittest.main()
