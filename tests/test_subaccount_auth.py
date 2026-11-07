import json
import os
import tempfile
import time
import unittest
from pathlib import Path
import sys
import urllib.request
import urllib.error
import http.cookiejar

ROOT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT_DIR / "web"))

from license_manager import LicenseManager, hash_password
import app
from app import app as fastapi_app

class SubaccountAuthTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.temp_path = Path(self.temp_dir.name)
        self.db_path = self.temp_path / "licenses.json"
        self.sessions_path = self.temp_path / "sessions.json"
        self.mgr = LicenseManager(db_path=self.db_path, sessions_path=self.sessions_path)

        # 1. Create Organization Account (Owner)
        self.org = self.mgr.create_account(
            name="Dr. Isaac Kleiner",
            email="kleiner@blackmesa.org",
            account_type="org",
            org_name="Black Mesa Research",
            tier="pro",
            seat_limit=5,
            scistudio_access=True,
            password="OwnerPassword123!"
        )
        self.org_key = self.org["license_key"]

        # 2. Add Subaccount Member 1 (Gordon Freeman - Editor)
        ok1, _, self.mem1 = self.mgr.add_org_member(
            parent_key=self.org_key,
            name="Dr. Gordon Freeman",
            email="gordon@blackmesa.org",
            role="editor",
            scistudio_access=True,
            password="GordonPassword123!"
        )
        self.assertTrue(ok1)

        # 3. Add Subaccount Member 2 (Barney Calhoun - Viewer)
        ok2, _, self.mem2 = self.mgr.add_org_member(
            parent_key=self.org_key,
            name="Barney Calhoun",
            email="barney@blackmesa.org",
            role="viewer",
            scistudio_access=False,
            password="BarneyPassword123!"
        )
        self.assertTrue(ok2)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_01_owner_login(self):
        """Owner logs in with account email and password, receives owner session."""
        ok, user, msg = self.mgr.authenticate("kleiner@blackmesa.org", "OwnerPassword123!")
        self.assertTrue(ok)
        self.assertFalse(user.get("is_member"))
        self.assertEqual(user["client_email"], "kleiner@blackmesa.org")
        self.assertEqual(user["license_key"], self.org_key)
        self.assertTrue(user["scistudio_access"])

        token = self.mgr.issue_session(user)
        session_user, err = self.mgr.get_session_info(token)
        self.assertIsNotNone(session_user)
        self.assertIsNone(err)
        self.assertFalse(session_user.get("is_member"))

    def test_02_subaccount_member_login(self):
        """Subaccount member logs in with individual email and password, receives member session with parent info."""
        ok, user, msg = self.mgr.authenticate("gordon@blackmesa.org", "GordonPassword123!")
        self.assertTrue(ok)
        self.assertTrue(user.get("is_member"))
        self.assertEqual(user["member_id"], self.mem1["member_id"])
        self.assertEqual(user["role"], "editor")
        self.assertEqual(user["client_name"], "Dr. Gordon Freeman")
        self.assertEqual(user["client_email"], "gordon@blackmesa.org")
        self.assertEqual(user["parent_license_key"], self.org_key)
        self.assertEqual(user["license_key"], self.org_key)
        self.assertEqual(user["org_name"], "Black Mesa Research")
        self.assertEqual(user["tier"], "pro")
        self.assertFalse(user["is_admin"])

        # Test session issuance and retrieval
        token = self.mgr.issue_session(user)
        session_user, err = self.mgr.get_session_info(token)
        self.assertIsNotNone(session_user)
        self.assertIsNone(err)
        self.assertTrue(session_user.get("is_member"))
        self.assertEqual(session_user["member_id"], self.mem1["member_id"])
        self.assertEqual(session_user["role"], "editor")
        self.assertEqual(session_user["parent_license_key"], self.org_key)

    def test_03_wrong_passwords_and_unset_passwords(self):
        """Authentication rejects wrong passwords for both owner and subaccount members."""
        # Wrong password for owner
        ok, _, msg = self.mgr.authenticate("kleiner@blackmesa.org", "WrongPassword")
        self.assertFalse(ok)
        self.assertIn("Incorrect password", msg)

        # Wrong password for subaccount member
        ok, _, msg = self.mgr.authenticate("gordon@blackmesa.org", "WrongPassword")
        self.assertFalse(ok)
        self.assertIn("Incorrect password", msg)

        # Non-existent user
        ok, _, msg = self.mgr.authenticate("nobody@blackmesa.org", "AnyPassword")
        self.assertFalse(ok)
        self.assertIn("No account found", msg)

        # Member without password set
        self.mgr.add_org_member(
            parent_key=self.org_key,
            name="No Pwd Member",
            email="nopwd@blackmesa.org",
            role="editor",
            password=None
        )
        ok, _, msg = self.mgr.authenticate("nopwd@blackmesa.org", "SomePassword")
        self.assertFalse(ok)
        self.assertIn("Password not set", msg)

    def test_04_parent_suspension_blocks_member_login_and_active_session(self):
        """Suspending parent organization blocks new member logins and revokes active member sessions."""
        # Member logs in while parent is active
        ok, user, _ = self.mgr.authenticate("gordon@blackmesa.org", "GordonPassword123!")
        self.assertTrue(ok)
        token = self.mgr.issue_session(user)
        self.assertIsNotNone(self.mgr.get_session(token))

        # Admin suspends parent organization
        stop_ok, _ = self.mgr.stop_account(self.org_key)
        self.assertTrue(stop_ok)

        # 1. Existing active member session must be immediately blocked
        session_user, err = self.mgr.get_session_info(token)
        self.assertIsNone(session_user)
        self.assertIn("SUSPENDED", err)

        # 2. Subsequent member login attempt must be rejected
        login_ok, _, login_msg = self.mgr.authenticate("gordon@blackmesa.org", "GordonPassword123!")
        self.assertFalse(login_ok)
        self.assertIn("SUSPENDED", login_msg)

    def test_05_session_restart_preserves_subaccount_session(self):
        """Simulate server restart: fresh LicenseManager restores subaccount session with full member attributes."""
        ok, user, _ = self.mgr.authenticate("gordon@blackmesa.org", "GordonPassword123!")
        token = self.mgr.issue_session(user)

        # Simulate restart
        restarted_mgr = LicenseManager(db_path=self.db_path, sessions_path=self.sessions_path)
        restarted_user, err = restarted_mgr.get_session_info(token)

        self.assertIsNotNone(restarted_user)
        self.assertIsNone(err)
        self.assertTrue(restarted_user.get("is_member"))
        self.assertEqual(restarted_user["member_id"], self.mem1["member_id"])
        self.assertEqual(restarted_user["role"], "editor")
        self.assertEqual(restarted_user["client_email"], "gordon@blackmesa.org")
        self.assertEqual(restarted_user["parent_license_key"], self.org_key)
        self.assertEqual(restarted_user["org_name"], "Black Mesa Research")

    def test_06_blocked_member_access_to_conference_and_website_endpoints(self):
        """End-to-end HTTP API check: Subaccounts are blocked (HTTP 403) from conference and website endpoints."""
        BASE_URL = "http://127.0.0.1:8000"

        # 1. Member Gordon Freeman logs in via HTTP
        mem_opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        mem_login_data = json.dumps({"identifier": "gordon@blackmesa.org", "password": "GordonPassword123!"}).encode("utf-8")
        
        # We need the running server's license_engine to know about these accounts
        # We add them to license_engine in web/app.py for the live server test
        app.license_engine.db_path.parent.mkdir(parents=True, exist_ok=True)
        live_db = app.license_engine._load_db()
        live_db["licenses"][self.org_key] = self.mgr.get_account(self.org_key)
        app.license_engine._save_db(live_db)

        # Test Gordon login
        req = urllib.request.Request(
            f"{BASE_URL}/api/auth/login",
            data=mem_login_data,
            headers={"Content-Type": "application/json"}
        )
        resp = mem_opener.open(req)
        self.assertEqual(resp.status, 200)
        data = json.loads(resp.read().decode("utf-8"))
        self.assertTrue(data["authenticated"])
        self.assertTrue(data["user"]["is_member"])
        self.assertEqual(data["user"]["role"], "editor")

        # 2. Member tries to list conferences -> MUST RETURN 403
        try:
            mem_opener.open(f"{BASE_URL}/api/builder/conferences")
            self.fail("Expected 403 Forbidden for subaccount conference list")
        except urllib.error.HTTPError as e:
            self.assertEqual(e.code, 403)

        # 3. Member tries to create a conference -> MUST RETURN 403
        try:
            conf_data = json.dumps({"name": "Gordon Conf"}).encode("utf-8")
            req_c = urllib.request.Request(
                f"{BASE_URL}/api/builder/conferences",
                data=conf_data,
                headers={"Content-Type": "application/json"}
            )
            mem_opener.open(req_c)
            self.fail("Expected 403 Forbidden for subaccount create conference")
        except urllib.error.HTTPError as e:
            self.assertEqual(e.code, 403)

        # 4. Member tries to list websites -> MUST RETURN 403
        try:
            mem_opener.open(f"{BASE_URL}/api/builder/sites")
            self.fail("Expected 403 Forbidden for subaccount website list")
        except urllib.error.HTTPError as e:
            self.assertEqual(e.code, 403)

        # 5. Member tries to create a website -> MUST RETURN 403
        try:
            site_data = json.dumps({"name": "Gordon Site", "slug": "gordon-site"}).encode("utf-8")
            req_s = urllib.request.Request(
                f"{BASE_URL}/api/builder/sites",
                data=site_data,
                headers={"Content-Type": "application/json"}
            )
            mem_opener.open(req_s)
            self.fail("Expected 403 Forbidden for subaccount create site")
        except urllib.error.HTTPError as e:
            self.assertEqual(e.code, 403)

        # 6. Organization Owner logs in and verifies full conference & website access is preserved
        owner_opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        owner_login_data = json.dumps({"identifier": "kleiner@blackmesa.org", "password": "OwnerPassword123!"}).encode("utf-8")
        owner_req = urllib.request.Request(
            f"{BASE_URL}/api/auth/login",
            data=owner_login_data,
            headers={"Content-Type": "application/json"}
        )
        owner_resp = owner_opener.open(owner_req)
        self.assertEqual(owner_resp.status, 200)

        # Owner listing conferences succeeds (200 OK)
        owner_conf_resp = owner_opener.open(f"{BASE_URL}/api/builder/conferences")
        self.assertEqual(owner_conf_resp.status, 200)

        # Owner listing websites succeeds (200 OK)
        owner_sites_resp = owner_opener.open(f"{BASE_URL}/api/builder/sites")
        self.assertEqual(owner_sites_resp.status, 200)

        # Clean up added test account from live db
        live_db = app.license_engine._load_db()
        live_db["licenses"].pop(self.org_key, None)
        app.license_engine._save_db(live_db)

if __name__ == "__main__":
    unittest.main()
