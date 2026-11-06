import unittest
import urllib.request
import urllib.parse
import json
import http.cookiejar
import re
from pathlib import Path

BASE_URL = "http://127.0.0.1:8000"

class StartupFlowTests(unittest.TestCase):
    def setUp(self):
        self.cookie_jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.cookie_jar))

    def test_01_initial_html_payload_no_splash_and_no_login_flash(self):
        """Verify initial served HTML has no splash screen and auth overlay is hidden by default."""
        req = urllib.request.Request(f"{BASE_URL}/")
        with urllib.request.urlopen(req) as resp:
            self.assertEqual(resp.status, 200)
            html = resp.read().decode("utf-8")

        # 1. App splash screen must NOT exist in the DOM
        self.assertNotIn("id=\"app-splash\"", html, "Splash screen #app-splash must be completely removed from DOM")
        self.assertNotIn("app-splash-screen", html, "Splash screen class must be completely removed from DOM")

        # 2. Auth gate overlay must be display: none by default so it never flashes on reload
        self.assertIn("id=\"auth-gate-overlay\"", html)
        match_overlay = re.search(r'<div[^>]*id="auth-gate-overlay"[^>]*>', html)
        self.assertIsNotNone(match_overlay)
        self.assertIn('style="display: none;"', match_overlay.group(0), "Auth gate overlay must start with display: none")

        # 3. App shell must be initially hidden until session check finishes
        match_shell = re.search(r'<div[^>]*id="app-shell"[^>]*>', html)
        self.assertIsNotNone(match_shell)
        self.assertIn('style="display: none !important;"', match_shell.group(0), "App shell must start with display: none !important")

        # 4. Cache busters should be v=9.0
        self.assertIn('index.css?v=9.0', html, "index.css should have ?v=9.0 cache buster")
        self.assertIn('app.js?v=9.0', html, "app.js should have ?v=9.0 cache buster")

    def test_02_css_suppression_of_splash(self):
        """Verify CSS contains no splash keyframes or active splash rules, and auth overlay defaults to hidden."""
        css_path = Path(__file__).resolve().parents[1] / "web" / "static" / "index.css"
        css_content = css_path.read_text(encoding="utf-8")

        self.assertNotIn(".app-splash-screen", css_content, "CSS must not contain .app-splash-screen rules")
        self.assertNotIn("splashPulse", css_content, "CSS must not contain splashPulse animation")
        
        # Verify .auth-gate-overlay has display: none;
        self.assertIn(".auth-gate-overlay {", css_content)
        overlay_rule = re.search(r"\.auth-gate-overlay\s*\{[^}]*\}", css_content)
        self.assertIsNotNone(overlay_rule)
        self.assertIn("display: none;", overlay_rule.group(0))

    def test_03_js_startup_flow_logic(self):
        """Verify JS has removed splash logic, contains clean anti-tamper, and session checking."""
        js_path = Path(__file__).resolve().parents[1] / "web" / "static" / "app.js"
        js_content = js_path.read_text(encoding="utf-8")

        # No initSplashScreen
        self.assertNotIn("initSplashScreen", js_content, "JS must not contain initSplashScreen")
        self.assertNotIn("splash-progress-bar", js_content, "JS must not reference splash-progress-bar")

        # Anti-tamper must only check after initial auth check completes
        self.assertIn("isInitialAuthCheckComplete", js_content)
        self.assertIn("if (!isSessionAuthenticated && isInitialAuthCheckComplete)", js_content)

        # Tab state persistence in sessionStorage
        self.assertIn("sessionStorage.setItem(\"scip_active_tab\"", js_content)
        self.assertIn("sessionStorage.getItem(\"scip_active_tab\")", js_content)

    def test_04_unauthenticated_session_check(self):
        """Verify unauthenticated request to /api/auth/me returns 401."""
        req = urllib.request.Request(f"{BASE_URL}/api/auth/me")
        try:
            self.opener.open(req)
            self.fail("Expected HTTP 401 for unauthenticated /api/auth/me")
        except urllib.error.HTTPError as e:
            self.assertEqual(e.code, 401, "Unauthenticated session must return 401")
            data = json.loads(e.read().decode("utf-8"))
            self.assertIn("detail", data)

    def test_05_signed_in_refresh_and_session_check(self):
        """Verify signed-in flow: login sets cookie, /api/auth/me returns 200 with user profile, logout works."""
        login_data = json.dumps({"identifier": "admin", "password": "admin2026"}).encode("utf-8")
        login_req = urllib.request.Request(
            f"{BASE_URL}/api/auth/login",
            data=login_data,
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        login_resp = self.opener.open(login_req)
        self.assertEqual(login_resp.status, 200)
        login_json = json.loads(login_resp.read().decode("utf-8"))
        self.assertTrue(login_json.get("authenticated"))
        token = login_json.get("token")
        self.assertTrue(bool(token))

        # Check /api/auth/me with opener that carries the scip_token cookie (simulating browser page refresh)
        me_req = urllib.request.Request(f"{BASE_URL}/api/auth/me")
        me_resp = self.opener.open(me_req)
        self.assertEqual(me_resp.status, 200)
        me_json = json.loads(me_resp.read().decode("utf-8"))
        self.assertTrue(me_json.get("authenticated"))
        self.assertEqual(me_json["user"]["client_name"], "Root Administrator")
        self.assertTrue(me_json["user"]["is_admin"])

        # Also verify with Authorization: Bearer header
        bearer_req = urllib.request.Request(f"{BASE_URL}/api/auth/me")
        bearer_req.add_header("Authorization", f"Bearer {token}")
        with urllib.request.urlopen(bearer_req) as bearer_resp:
            self.assertEqual(bearer_resp.status, 200)
            bearer_json = json.loads(bearer_resp.read().decode("utf-8"))
            self.assertTrue(bearer_json.get("authenticated"))

        # Sign out via POST /api/auth/logout
        logout_req = urllib.request.Request(f"{BASE_URL}/api/auth/logout", data=b"{}", headers={"Content-Type": "application/json"}, method="POST")
        logout_resp = self.opener.open(logout_req)
        self.assertEqual(logout_resp.status, 200)

        # Subsequent refresh should return 401
        try:
            self.opener.open(me_req)
            self.fail("Expected 401 after logout")
        except urllib.error.HTTPError as e:
            self.assertEqual(e.code, 401)

    def test_06_spa_route_endpoints_retain_page(self):
        """Verify SPA routes (/dashboard, /websitebuilder, /nih, /explorer, /datasets) all serve the app with 200."""
        routes = ["/dashboard", "/websitebuilder", "/nih", "/explorer", "/datasets"]
        for route in routes:
            req = urllib.request.Request(f"{BASE_URL}{route}")
            with urllib.request.urlopen(req) as resp:
                self.assertEqual(resp.status, 200, f"Route {route} must return 200")
                html = resp.read().decode("utf-8")
                self.assertIn("id=\"app-shell\"", html)

    def test_07_dashboard_design_integrity(self):
        """Verify dashboard design elements remain intact."""
        req = urllib.request.Request(f"{BASE_URL}/")
        with urllib.request.urlopen(req) as resp:
            html = resp.read().decode("utf-8")

        # Verify metrics cards exist
        self.assertIn("stat-central-leads", html)
        self.assertIn("stat-today-leads", html)
        self.assertIn("stat-pool-leads", html)

        # Verify search topic input and run button
        self.assertIn("unified-keyword", html)
        self.assertIn("btn-run-unified", html)

        # Verify views exist for all tabs
        for view_id in ["view-pipeline", "view-nih", "view-explorer", "view-datasets", "view-builder"]:
            self.assertIn(f"id=\"{view_id}\"", html)

if __name__ == "__main__":
    unittest.main()
