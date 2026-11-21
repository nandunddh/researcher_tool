import io
import json
import re
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from react_export import export_zip


class ReactExportTests(unittest.TestCase):
    def test_owner_can_export_draft_pages_as_standalone_react_html(self):
        photo = "a" * 32 + ".png"
        site = {"site_id": "site_1234abcd", "name": "Research", "slug": "research", "status": "draft",
                "user_email": "PRIVATE-OWNER", "pages": [
                    {"id": "home", "slug": "/", "is_home": True, "schema_json": [
                        {"id": "nav", "type": "navbar", "data": {"brand_name": "Research", "links": [
                            {"label": "Sessions", "url": "/sites/research/sessions"}]}}]},
                    {"id": "sessions", "name": "Sessions", "slug": "/sessions", "schema_json": [
                        {"id": "hero", "type": "hero", "data": {"headline": "Conference sessions",
                         "hero_image": "/api/builder/media/site_1234abcd/" + photo}},
                        {"id": "reg", "type": "registration", "data": {"discount_codes": ["PRIVATE-CODE"]}}]}]}
        with tempfile.TemporaryDirectory() as folder:
            media = Path(folder)
            (media / photo).write_bytes(b"sample image")
            data, filename = export_zip(site, media)
        self.assertEqual(filename, "research_website.zip")
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            home = archive.read("index.html").decode().split('<script type="application/json"')[0]
            other = archive.read("sessions.html").decode().split('<script type="application/json"')[0]
            self.assertIn('href="sessions.html"', home)
            self.assertIn("Conference sessions", other)
            self.assertIn('src="./media/' + photo + '"', other)
            self.assertEqual(archive.read("media/" + photo), b"sample image")
            css = archive.read("style.css")
            self.assertIn(b"--accent", css)
            navbar_class = re.search(r'<header class="([^"]+)"', home).group(1)
            self.assertIn(("." + navbar_class).encode(), css)
            self.assertEqual(len(json.loads(archive.read("site_config.json"))["pages"]), 2)
            self.assertTrue(archive.read("site.js"))
            for file in archive.namelist():
                self.assertNotIn(b"PRIVATE-", archive.read(file))
