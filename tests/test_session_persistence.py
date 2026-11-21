import json
import os
import tempfile
import time
import unittest
from pathlib import Path
import sys

# Ensure web directory is in path
ROOT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT_DIR / "backend"))

from license_manager import LicenseManager, hash_password
from stores import session_key

class SessionPersistenceTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.temp_path = Path(self.temp_dir.name)
        self.db_path = self.temp_path / "licenses.json"
        self.sessions_path = self.temp_path / "sessions.json"
        self.mgr = LicenseManager(db_path=self.db_path, sessions_path=self.sessions_path)

        # Create a test account
        self.account = self.mgr.create_account(
            name="Dr. Jane Doe",
            email="jane.doe@university.edu",
            account_type="single",
            tier="pro",
            scistudio_access=True
        )
        self.license_key = self.account["license_key"]

        # Set account password and root password
        db = self.mgr._load_db()
        db["_metadata"]["root_password_hash"] = hash_password("admin2026")
        db["licenses"][self.license_key]["password_hash"] = hash_password("ValidPassword123!")
        self.mgr._save_db(db)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_01_login_and_session_persistence_on_disk(self):
        """Test login issues session, persists it to disk, and contains NO password."""
        ok, user_info, msg = self.mgr.authenticate("jane.doe@university.edu", "ValidPassword123!")
        self.assertTrue(ok)
        self.assertEqual(user_info["client_email"], "jane.doe@university.edu")

        token = self.mgr.issue_session(user_info)
        self.assertTrue(bool(token))

        # The session is stored, keyed by a hash of the token (never the raw token)
        stored = self.mgr.session_store.load_all()
        self.assertNotIn(token, stored)
        self.assertNotIn(token, json.dumps(stored))
        self.assertIn(session_key(token), stored)
        saved_session = stored[session_key(token)]

        # 7-day duration validation: expires_at must be approx now + 7 days (86400 * 7)
        now = time.time()
        self.assertAlmostEqual(saved_session["expires_at"] - saved_session["created_at"], 86400 * 7, delta=5)
        self.assertGreater(saved_session["expires_at"], now + (86400 * 6.9))

        # Security check: MUST NOT contain passwords or hashes in sessions
        session_str = json.dumps(saved_session)
        self.assertNotIn("ValidPassword123!", session_str)
        self.assertNotIn("password_hash", session_str)

    def test_02_server_restart_preserves_session(self):
        """Simulate a server restart: a new LicenseManager instance must load existing sessions."""
        ok, user_info, _ = self.mgr.authenticate("jane.doe@university.edu", "ValidPassword123!")
        token = self.mgr.issue_session(user_info)

        # Verify initial session retrieval
        user, err = self.mgr.get_session_info(token)
        self.assertIsNotNone(user)
        self.assertIsNone(err)
        self.assertEqual(user["client_email"], "jane.doe@university.edu")

        # --- SIMULATE SERVER RESTART ---
        # Instantiate a completely brand-new LicenseManager reading the same storage path
        restarted_mgr = LicenseManager(db_path=self.db_path, sessions_path=self.sessions_path)

        # Verify that the session is still valid without re-login
        restarted_user, restarted_err = restarted_mgr.get_session_info(token)
        self.assertIsNotNone(restarted_user, "Session must survive server restart")
        self.assertIsNone(restarted_err)
        self.assertEqual(restarted_user["client_name"], "Dr. Jane Doe")
        self.assertEqual(restarted_user["client_email"], "jane.doe@university.edu")
        self.assertEqual(restarted_user["tier"], "pro")

    def test_03_session_expiry_prunes_and_rejects(self):
        """Expired session (> 7 days) must be rejected and pruned from server disk."""
        ok, user_info, _ = self.mgr.authenticate("jane.doe@university.edu", "ValidPassword123!")
        token = self.mgr.issue_session(user_info)

        # Manually backdate the stored session's expires_at to simulate expiry
        stored = self.mgr.session_store.load_all()
        stored[session_key(token)]["expires_at"] = time.time() - 100
        self.mgr.session_store.save_all(stored)

        # Re-load or check with manager
        restarted_mgr = LicenseManager(db_path=self.db_path, sessions_path=self.sessions_path)
        user, err = restarted_mgr.get_session_info(token)
        self.assertIsNone(user)
        self.assertEqual(err, "Session expired")

        # Verify the session was pruned from storage
        self.assertNotIn(session_key(token), restarted_mgr.session_store.load_all())

    def test_04_sign_out_revocation(self):
        """Sign-out must revoke the session token and remove it from server storage."""
        ok, user_info, _ = self.mgr.authenticate("jane.doe@university.edu", "ValidPassword123!")
        token = self.mgr.issue_session(user_info)

        # Verify active
        self.assertIsNotNone(self.mgr.get_session(token))

        # Perform sign-out / revoke
        revoked = self.mgr.revoke_session(token)
        self.assertTrue(revoked)

        # Verify session is gone from memory and disk
        user, err = self.mgr.get_session_info(token)
        self.assertIsNone(user)
        self.assertEqual(err, "Not authenticated")

        # Ensure it is gone after restart too
        restarted_mgr = LicenseManager(db_path=self.db_path, sessions_path=self.sessions_path)
        self.assertIsNone(restarted_mgr.get_session(token))

    def test_05_suspended_account_revokes_and_blocks(self):
        """Suspended account must revoke all its active sessions and block access immediately."""
        ok, user_info, _ = self.mgr.authenticate("jane.doe@university.edu", "ValidPassword123!")
        token = self.mgr.issue_session(user_info)

        # Verify session is currently active
        self.assertIsNotNone(self.mgr.get_session(token))

        # Admin suspends / stops the account
        stop_ok, stop_msg = self.mgr.stop_account(self.license_key)
        self.assertTrue(stop_ok)
        self.assertIn("suspended", stop_msg.lower())

        # Attempt to access session with token
        user, err = self.mgr.get_session_info(token)
        self.assertIsNone(user, "Suspended account must not have access")
        self.assertIn("SUSPENDED", err)

        # Verify sessions are wiped from storage
        self.assertNotIn(session_key(token), self.mgr.session_store.load_all())

        # Even across a server restart, access remains blocked
        restarted_mgr = LicenseManager(db_path=self.db_path, sessions_path=self.sessions_path)
        r_user, r_err = restarted_mgr.get_session_info(token)
        self.assertIsNone(r_user)

    def test_06_root_admin_session_survives_restart(self):
        """Root administrator session must survive server restarts."""
        ok, admin_info, _ = self.mgr.authenticate("admin", "admin2026")
        self.assertTrue(ok)
        self.assertTrue(admin_info["is_admin"])

        token = self.mgr.issue_session(admin_info)

        # Restart server
        restarted_mgr = LicenseManager(db_path=self.db_path, sessions_path=self.sessions_path)
        user, err = restarted_mgr.get_session_info(token)
        self.assertIsNotNone(user)
        self.assertTrue(user["is_admin"])
        self.assertEqual(user["client_name"], "Root Administrator")


@unittest.skipUnless(os.environ.get("SCIPROSPECT_LIVE_TESTS") == "1", "Live-server test: set SCIPROSPECT_LIVE_TESTS=1 to run against a local server and its database.")
class LiveServerSessionPersistenceTests(unittest.TestCase):
    """End-to-end integration tests against running local server on http://127.0.0.1:8000."""
    BASE_URL = "http://127.0.0.1:8000"

    def setUp(self):
        import urllib.request
        import http.cookiejar
        self.cookie_jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.cookie_jar))

    def test_live_login_and_cookie_duration(self):
        """Verify login sets a session cookie, /me works, and logout revokes it."""
        import urllib.request
        login_data = json.dumps({"identifier": "admin", "password": "admin2026"}).encode("utf-8")
        req = urllib.request.Request(
            f"{self.BASE_URL}/api/auth/login",
            data=login_data,
            headers={"Content-Type": "application/json"}
        )
        resp = self.opener.open(req)
        self.assertEqual(resp.status, 200)
        data = json.loads(resp.read().decode("utf-8"))
        self.assertTrue(data.get("authenticated"))
        token = data.get("token")
        self.assertTrue(bool(token))

        # Check scip_token cookie was stored
        scip_cookie = next((c for c in self.cookie_jar if c.name == "scip_token"), None)
        self.assertIsNotNone(scip_cookie, "scip_token cookie must be set by server")

        # Verify /api/auth/me with cookie succeeds
        me_req = urllib.request.Request(f"{self.BASE_URL}/api/auth/me")
        me_resp = self.opener.open(me_req)
        self.assertEqual(me_resp.status, 200)
        me_data = json.loads(me_resp.read().decode("utf-8"))
        self.assertTrue(me_data.get("authenticated"))
        self.assertEqual(me_data["user"]["client_name"], "Root Administrator")

        # Verify logout revokes session and deletes cookie
        logout_req = urllib.request.Request(
            f"{self.BASE_URL}/api/auth/logout",
            data=b"{}",
            headers={"Content-Type": "application/json"}
        )
        logout_resp = self.opener.open(logout_req)
        self.assertEqual(logout_resp.status, 200)

        # Subsequent /api/auth/me must return 401
        try:
            self.opener.open(me_req)
            self.fail("Expected 401 after logout")
        except urllib.error.HTTPError as e:
            self.assertEqual(e.code, 401)


if __name__ == "__main__":
    unittest.main()
