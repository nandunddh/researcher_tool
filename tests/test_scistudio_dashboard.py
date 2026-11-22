"""The backend serves APIs only. Every page (website, workspace, collector, SciStudio) is the Next.js app;
the old built-in UI (backend/static) and the desktop pipeline routes were retired."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app import app  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]


class BackendIsApiOnlyTests(unittest.TestCase):
    def paths(self):
        return {r.path for r in app.routes if hasattr(r, "path")}

    def test_old_ui_pages_are_gone(self):
        for old in ("/dashboard", "/scistudio", "/nih", "/explorer", "/datasets", "/admin", "/root-dashboard", "/workspace",
                    "/builder", "/websitebuilder", "/{namespace}/{page}", "/scistudio/{site_id}/edit"):
            self.assertNotIn(old, self.paths(), old)
        self.assertFalse((ROOT / "backend/static").exists(), "old built-in UI removed")

    def test_old_desktop_pipeline_apis_are_gone(self):
        for old in ("/api/pipeline/start", "/api/pipeline/stream", "/api/leads", "/api/datasets", "/api/update/check", "/api/license/activate"):
            self.assertNotIn(old, self.paths(), old)

    def test_web_app_apis_remain(self):
        for kept in ("/api/auth/login", "/api/auth/me", "/api/builder/sites", "/api/organization/overview", "/api/admin/overview",
                     "/api/billing", "/api/public/plans"):
            self.assertIn(kept, self.paths(), kept)
        # Newer FastAPI keeps an included router nested (original_router) instead of flattening its routes.
        nested = {r.path for inc in app.routes if hasattr(inc, "original_router") for r in inc.original_router.routes}
        self.assertIn("/api/collector/stats", self.paths() | nested, "web collector routes")


if __name__ == "__main__":
    unittest.main()
