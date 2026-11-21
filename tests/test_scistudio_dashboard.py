import asyncio
import re
import sys
import unittest
from pathlib import Path

from fastapi import HTTPException
from types import SimpleNamespace

# Add backend directory to path for direct imports
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from app import (
    app,
    redirect_legacy_builder_routes,
    role_workspace_page,
    root_dashboard,
    scistudio_site_edit_page,
    scistudio_site_preview_page,
    serve_spa_page,
    workspace_home,
)


class TestSciStudioDashboardRedesign(unittest.TestCase):
    def test_routes_scistudio_primary(self):
        """Verify /scistudio is registered in FastAPI routes and serves index.html."""
        route_paths = [r.path for r in app.routes]
        self.assertIn("/scistudio", route_paths)

        # Call serve_spa_page directly
        # /scistudio now redirects to the React app; pages not yet in React still get index.html
        from types import SimpleNamespace
        resp = asyncio.run(serve_spa_page(SimpleNamespace(url=SimpleNamespace(path="/explorer"))))
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(Path(resp.path).exists())
        self.assertEqual(Path(resp.path).name, "index.html")

    def test_routes_legacy_redirects(self):
        """Verify /websitebuilder and /builder redirect to /scistudio via HTTP 307."""
        route_paths = [r.path for r in app.routes]
        self.assertIn("/websitebuilder", route_paths)
        self.assertIn("/builder", route_paths)

        resp = asyncio.run(redirect_legacy_builder_routes())
        self.assertEqual(resp.status_code, 307)
        self.assertEqual(resp.headers.get("location"), "/scistudio")

    def test_unauthenticated_workspace_routes_redirect_to_login(self):
        """Browser requests to /organization/dashboard etc. redirect to / when logged out instead of raw 401 JSON."""
        html_req = SimpleNamespace(cookies={}, headers={"accept": "text/html,application/xhtml+xml"})
        for coro in (
            role_workspace_page("organization", "dashboard", html_req),
            role_workspace_page("client", "dashboard", html_req),
            role_workspace_page("root", "dashboard", html_req),
            workspace_home(html_req),
            root_dashboard(html_req),
        ):
            resp = asyncio.run(coro)
            self.assertEqual(resp.status_code, 307)
            self.assertEqual(resp.headers.get("location"), "/")

        api_req = SimpleNamespace(cookies={}, headers={"accept": "application/json"})
        with self.assertRaises(HTTPException) as err:
            asyncio.run(role_workspace_page("organization", "dashboard", api_req))
        self.assertEqual(err.exception.status_code, 401)

    def test_scistudio_clean_edit_and_preview_routes(self):
        """Verify /{namespace}/scistudio/{site_id}/edit and preview routes exist and guard unauthenticated access."""
        route_paths = [r.path for r in app.routes]
        self.assertIn("/scistudio/{site_id}/edit", route_paths)
        self.assertIn("/{namespace}/scistudio/{site_id}/edit", route_paths)
        self.assertIn("/scistudio/{site_id}/preview", route_paths)
        self.assertIn("/{namespace}/scistudio/{site_id}/preview", route_paths)

        # Unauthenticated browser navigations redirect to /
        html_req = SimpleNamespace(cookies={}, headers={"accept": "text/html,application/xhtml+xml"})
        for coro in (
            scistudio_site_edit_page("site_demo", html_req, "organization"),
            scistudio_site_preview_page("site_demo", html_req, "organization"),
            scistudio_site_edit_page("site_demo", html_req, None),
            scistudio_site_preview_page("site_demo", html_req, None),
        ):
            resp = asyncio.run(coro)
            self.assertEqual(resp.status_code, 307)
            self.assertEqual(resp.headers.get("location"), "/")

    def test_dashboard_markup_elements(self):
        """Verify index.html contains the polished SciStudio header, conference workspace bar, toolbar, search, and single-plus button."""
        html_path = Path(__file__).resolve().parents[1] / "backend" / "static" / "index.html"
        html = html_path.read_text(encoding="utf-8")

        # Workspace dashboard view
        self.assertIn('id="builder-dashboard-view"', html)
        self.assertIn('class="scistudio-dashboard-view"', html)

        # Conference workspace controls
        self.assertIn('id="conference-workspace-bar"', html)
        self.assertIn('id="conference-workspace-select"', html)
        self.assertIn('id="btn-open-create-conf-modal"', html)

        # Create button must not have duplicate plus sign
        btn_match = re.search(r'<button[^>]*id="btn-open-create-site-modal"[^>]*>(.*?)</button>', html, re.DOTALL)
        self.assertTrue(btn_match, "Create site button not found")
        btn_content = btn_match.group(1)
        self.assertNotIn("+ +", btn_content)
        self.assertNotIn("+ Create", btn_content)

        # Search toolbar elements
        self.assertIn('id="builder-search-sites"', html)
        self.assertIn('id="btn-clear-search"', html)
        self.assertIn('id="stat-total-sites"', html)
        self.assertIn('id="builder-sites-grid"', html)

        # Approved collector view still intact
        self.assertIn('id="view-pipeline"', html)
        self.assertIn('id="view-nih"', html)
        self.assertIn('id="view-explorer"', html)
        self.assertIn('id="view-datasets"', html)
        self.assertIn('class="app-status-bar"', html)
        self.assertIn('class="status-bar-copyright"', html)
        self.assertIn('SciProspect & SciStudio', html)

    def test_stylesheet_contrast_and_card_actions(self):
        """Verify index.css contains high-contrast styling and required card classes."""
        css_path = Path(__file__).resolve().parents[1] / "backend" / "static" / "index.css"
        css = css_path.read_text(encoding="utf-8")

        # Essential SciStudio classes
        self.assertIn('.scistudio-dashboard-view', css)
        self.assertNotIn('body.scistudio-workspace .app-sidebar,body.scistudio-workspace .app-status-bar {display:none !important;}', css)
        self.assertIn('body.scistudio-workspace:not(.studio-fullscreen-mode) .app-status-bar', css)
        self.assertIn('.builder-site-card', css)
        self.assertIn('.site-slug-pill-wrap', css)
        self.assertIn('.site-status-badge', css)
        self.assertIn('.btn-card-action.edit', css)
        self.assertIn('.btn-card-action.view', css)
        self.assertIn('.btn-card-action.export', css)
        self.assertIn('.btn-card-action.delete', css)

        # High contrast colors for titles and slug links (not default unstyled blue)
        self.assertIn('.builder-site-title', css)
        self.assertIn('#f8fafc', css)  # crisp white/slate title
        self.assertIn('.site-slug-pill', css)

        # Mobile responsiveness
        self.assertIn('@media (max-width: 768px)', css)

    def test_js_card_and_routing_integrity(self):
        """Verify app.js handles /scistudio route mapping and renders card actions."""
        js_path = Path(__file__).resolve().parents[1] / "backend" / "static" / "app.js"
        js = js_path.read_text(encoding="utf-8")

        # Route mapping
        self.assertIn('builder: "/scistudio"', js)
        self.assertIn('p.includes("scistudio")', js)

        # Action buttons in renderBuilderSites
        self.assertIn('btn-card-action edit', js)
        self.assertIn('btn-card-action view', js)
        self.assertIn('btn-card-action export', js)
        self.assertIn('btn-card-action delete', js)

        # Status badge
        self.assertIn('site-status-badge', js)

        # Search filter and clear search
        self.assertIn('btn-clear-search', js)


if __name__ == "__main__":
    unittest.main()
