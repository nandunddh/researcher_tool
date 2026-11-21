import os
import unittest
import io
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from backend.builder_manager import WebsiteBuilderEngine


@unittest.skipUnless(os.environ.get("SCIPROSPECT_DB_SCHEMA", "").startswith("test_"), "Database test: set SCIPROSPECT_DB_SCHEMA=test_<name> to run against an isolated test schema (never the live data).")
class TestBuilderMultiPageAndSeo(unittest.TestCase):
    def setUp(self):
        self.engine = WebsiteBuilderEngine()

    def test_multipage_zip_export(self):
        site = self.engine.create_site(
            user_email="tester@example.org",
            name="MultiPage Conference",
            template_id="blank"
        )
        site_id = site["site_id"]

        # Add multi-page structure
        site_update = {
            "pages": [
                {
                    "id": "p_home",
                    "name": "Home",
                    "slug": "/",
                    "is_home": True,
                    "schema_json": [{"id": "h1", "type": "hero", "data": {"headline": "Home Page Hero"}}]
                },
                {
                    "id": "p_about",
                    "name": "About Us",
                    "slug": "/about",
                    "is_home": False,
                    "schema_json": [{"id": "a1", "type": "about", "data": {"section_title": "About Our Mission"}}]
                }
            ]
        }
        updated = self.engine.update_site(site_id, site_update)
        self.assertIsNotNone(updated)

        zip_bytes, msg = self.engine.export_site_zip(site_id)
        self.assertIsNotNone(zip_bytes)
        self.assertTrue(msg.endswith(".zip"))

        with zipfile.ZipFile(io.BytesIO(zip_bytes), "r") as zf:
            file_names = zf.namelist()
            self.assertIn("index.html", file_names)
            self.assertIn("about.html", file_names)
            self.assertIn("style.css", file_names)
            self.assertIn("site_config.json", file_names)

            home_content = zf.read("index.html").decode("utf-8")
            about_content = zf.read("about.html").decode("utf-8")
            self.assertIn("Home Page Hero", home_content)
            self.assertIn("About Our Mission", about_content)


if __name__ == "__main__":
    unittest.main()
