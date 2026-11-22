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
        route_paths = [r.path for r in app.routes if hasattr(r, "path")]  # included routers (collector) have no single path
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
        route_paths = [r.path for r in app.routes if hasattr(r, "path")]  # included routers (collector) have no single path
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
        route_paths = [r.path for r in app.routes if hasattr(r, "path")]  # included routers (collector) have no single path
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

    def test_collector_shell_keeps_collection_and_export_views(self):
        html = (Path(__file__).resolve().parents[1] / "backend/static/index.html").read_text(encoding="utf-8")
        for tab in ("pipeline", "nih", "explorer", "datasets"):
            self.assertIn(f'id="view-{tab}"', html)
        self.assertIn('href="/scistudio"', html)
        self.assertNotIn('id="view-builder"', html)
