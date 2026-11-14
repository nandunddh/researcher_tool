import unittest
import io
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from backend.builder_manager import WebsiteBuilderEngine, compile_website_html


class TestBuilderMultiPageAndSeo(unittest.TestCase):
    def setUp(self):
        self.engine = WebsiteBuilderEngine()

    def test_seo_meta_tags_compilation(self):
        site_data = {
            "name": "Global Genomics Summit 2026",
            "meta_title": "Genomics Summit 2026 · Official Portal",
            "meta_description": "Join international researchers in Cambridge for clinical genomics.",
            "meta_keywords": "genomics, genetics, oncology, bioinformatics",
            "og_image": "https://example.com/banner.jpg",
            "meta_author": "SciProspect Editorial",
            "canonical_url": "https://example.com/genomics2026",
            "ga_tracking_id": "G-TEST123456",
            "custom_head_code": '<link rel="author" href="https://example.com/author">',
            "custom_body_code": '<script>console.log("analytics ping");</script>',
            "schema_json": [
                {
                    "id": "nav_1",
                    "type": "navbar",
                    "data": {"brand_name": "Genomics Summit", "layout_variant": "business"}
                }
            ]
        }
        html, css = compile_website_html(site_data)

        self.assertIn("<title>Genomics Summit 2026 · Official Portal</title>", html)
        self.assertIn('name="description" content="Join international researchers in Cambridge for clinical genomics."', html)
        self.assertIn('name="keywords" content="genomics, genetics, oncology, bioinformatics"', html)
        self.assertIn('property="og:image" content="https://example.com/banner.jpg"', html)
        self.assertIn('name="author" content="SciProspect Editorial"', html)
        self.assertIn('rel="canonical" href="https://example.com/genomics2026"', html)
        self.assertIn("https://www.googletagmanager.com/gtag/js?id=G-TEST123456", html)
        self.assertIn("gtag('config', 'G-TEST123456');", html)
        self.assertIn('<link rel="author" href="https://example.com/author">', html)
        self.assertIn('<script>console.log("analytics ping");</script>', html)

    def test_multipage_site_compilation_and_resolution(self):
        site_data = {
            "name": "BioTech World",
            "pages": [
                {
                    "id": "page_home",
                    "name": "Home",
                    "slug": "/",
                    "is_home": True,
                    "meta_title": "Home · BioTech World",
                    "schema_json": [
                        {"id": "hero_1", "type": "hero", "data": {"headline": "Welcome to BioTech"}}
                    ]
                },
                {
                    "id": "page_speakers",
                    "name": "Keynote Speakers",
                    "slug": "/speakers",
                    "is_home": False,
                    "meta_title": "Speakers · BioTech World",
                    "schema_json": [
                        {"id": "speakers_1", "type": "speakers", "data": {"section_title": "Faculty Speakers"}}
                    ]
                }
            ]
        }

        # 1. Compile home page by default
        home_html, _ = compile_website_html(site_data)
        self.assertIn("<title>Home · BioTech World</title>", home_html)
        self.assertIn("Welcome to BioTech", home_html)

        # 2. Compile speakers sub-page by ID
        spk_html, _ = compile_website_html(site_data, page_id="page_speakers")
        self.assertIn("<title>Speakers · BioTech World</title>", spk_html)
        self.assertIn("Faculty Speakers", spk_html)

        # 3. Compile speakers sub-page by slug
        spk_slug_html, _ = compile_website_html(site_data, page_id="speakers")
        self.assertIn("<title>Speakers · BioTech World</title>", spk_slug_html)
        self.assertIn("Faculty Speakers", spk_slug_html)

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
