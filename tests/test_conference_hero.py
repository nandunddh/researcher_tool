"""
Unit and Integration Tests for SciStudio Conference Program Hero Layout.
Verifies:
1. Backward compatibility: existing websites without layout_variant compile to split hero.
2. Conference Program compilation: layout_variant='conference_program' renders heading/intro
   on one side and date, location, format, registration button on the other side.
3. Content preservation: switching between split and conference_program preserves all fields.
4. ZIP export: bundled standalone ZIP archive contains the compiled Conference Program layout.
5. Live public serving: published site at /sites/{slug} returns the conference program hero.
6. Responsive CSS: media queries correctly stack program content and card on mobile.
"""

import sys
import os
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "web"))

import unittest
import json
import io
import zipfile
import asyncio
from app import serve_public_website
from builder_manager import (
    compile_website_html,
    builder_engine,
    get_websites_dir
)


class TestConferenceHeroLayout(unittest.TestCase):

    def setUp(self):
        self.split_hero_data = {
            "id": "comp_hero_1",
            "type": "hero",
            "title": "Hero Header",
            "data": {
                "layout_variant": "split",
                "eyebrow": "🌟 SCIENTIFIC CONGRESS 2026",
                "headline": "Global Perspectives in Genomics",
                "subheadline": "Bridging fundamental laboratory science and clinical translation.",
                "primary_btn_text": "Register Today",
                "primary_btn_url": "#pricing",
                "secondary_btn_text": "View Speakers",
                "secondary_btn_url": "#speakers",
                "hero_image": "https://images.unsplash.com/photo-1532094349884-543bc11b234d?auto=format&fit=crop&w=1200&q=80",
                "event_date": "November 12-16, 2026",
                "event_location": "San Francisco Convention Center, CA",
                "event_format": "Hybrid (In-Person & Live Stream)"
            }
        }

        self.program_hero_data = {
            "id": "comp_hero_1",
            "type": "hero",
            "title": "Hero Header",
            "data": {
                "layout_variant": "conference_program",
                "eyebrow": "🌟 ANNUAL SYMPOSIUM 2026",
                "headline": "Advances in Molecular Oncology",
                "subheadline": "A premier gathering of oncologists, molecular biologists, and clinical trialists.",
                "primary_btn_text": "Register for Conference",
                "primary_btn_url": "#register-now",
                "secondary_btn_text": "Full Program Schedule",
                "secondary_btn_url": "#schedule",
                "hero_image": "https://images.unsplash.com/photo-1507668077129-56e32842fceb",
                "event_date": "October 14–18, 2026",
                "event_location": "Boston Convention & Exhibition Center, Boston, MA",
                "event_format": "In-Person Keynotes & Global Live Stream"
            }
        }

    def test_01_backward_compatibility_existing_sites(self):
        """Existing sites without layout_variant must compile without error to standard split layout."""
        legacy_site = {
            "name": "Legacy Congress Site",
            "theme_config": {"mode": "dark"},
            "schema_json": [
                {
                    "id": "comp_hero_legacy",
                    "type": "hero",
                    "title": "Hero Header",
                    "data": {
                        "eyebrow": "LEGACY CONFERENCE",
                        "headline": "Old Breakthrough Summit",
                        "subheadline": "Historic scientific research archives.",
                        "primary_btn_text": "Read Papers",
                        "primary_btn_url": "#papers",
                        "secondary_btn_text": "Archives",
                        "secondary_btn_url": "#archives",
                        "hero_image": "https://example.com/legacy.jpg"
                    }
                }
            ]
        }
        html, css = compile_website_html(legacy_site)
        self.assertIn('<div class="site-container hero-content">', html)
        self.assertIn("Old Breakthrough Summit", html)
        self.assertIn("Read Papers", html)
        self.assertIn('<div class="hero-img-box">', html)
        self.assertIn("https://example.com/legacy.jpg", html)
        self.assertNotIn('<div class="hero-program-card">', html)

    def test_02_conference_program_compiles_both_sides(self):
        """Conference program hero must render heading/intro on one side and date/location/format/CTA on the other."""
        site = {
            "name": "Molecular Oncology Summit",
            "theme_config": {"mode": "dark"},
            "schema_json": [self.program_hero_data]
        }
        html, css = compile_website_html(site)

        # Structure checks
        self.assertIn('<div class="site-container hero-program-wrap">', html)
        self.assertIn('<div class="hero-program-content">', html)
        self.assertIn('<div class="hero-program-card">', html)

        # Side 1: Content side (Heading and Introduction)
        self.assertIn("🌟 ANNUAL SYMPOSIUM 2026", html)
        self.assertIn("Advances in Molecular Oncology", html)
        self.assertIn("A premier gathering of oncologists", html)
        self.assertIn("Full Program Schedule", html)

        # Side 2: Program card side (Date, Location, Format, Registration Button)
        self.assertIn("October 14–18, 2026", html)
        self.assertIn("Boston Convention & Exhibition Center, Boston, MA", html)
        self.assertIn("In-Person Keynotes & Global Live Stream", html)
        self.assertIn("Register for Conference", html)
        self.assertIn("#register-now", html)

        # CSS checks
        self.assertIn(".hero-program-wrap", css)
        self.assertIn(".hero-program-card", css)
        self.assertIn("@media (max-width: 900px)", css)
        self.assertIn(".hero-program-wrap", css.split("@media (max-width: 900px)")[1])

    def test_03_content_preservation_switching_designs(self):
        """Switching between split and conference_program must preserve all fields in schema."""
        comp = json.loads(json.dumps(self.split_hero_data))

        # Switch to conference program
        comp["data"]["layout_variant"] = "conference_program"
        site_as_program = {
            "name": "Variant Test Site",
            "schema_json": [comp]
        }
        html_program, _ = compile_website_html(site_as_program)
        self.assertIn('<div class="hero-program-card">', html_program)
        self.assertIn("November 12-16, 2026", html_program)
        self.assertIn("San Francisco Convention Center, CA", html_program)

        # Verify image was not deleted
        self.assertIn("hero_image", comp["data"])

        # Switch back to split
        comp["data"]["layout_variant"] = "split"
        site_as_split = {
            "name": "Variant Test Site",
            "schema_json": [comp]
        }
        html_split, _ = compile_website_html(site_as_split)
        self.assertIn('<div class="hero-img-box">', html_split)
        self.assertIn("https://images.unsplash.com/photo-1532094349884-543bc11b234d", html_split)
        self.assertIn("Global Perspectives in Genomics", html_split)
        # Verify conference dates were not deleted
        self.assertEqual(comp["data"]["event_date"], "November 12-16, 2026")
        self.assertEqual(comp["data"]["event_location"], "San Francisco Convention Center, CA")

    def test_04_zip_export_includes_conference_program(self):
        """Standalone ZIP export must include the compiled Conference Program layout and CSS."""
        site = builder_engine.create_site(
            user_email="owner@sciprospect.com",
            name="ZIP Export Test Conference",
            slug="zip-export-test-conf",
            template_id="neuroscience",
            custom_options={
                "hero_headline": "Neural Circuits & Cognitive Systems",
                "hero_subheadline": "International forum on memory, perception, and computation."
            }
        )
        self.assertIsNotNone(site)
        site_id = site["site_id"]

        # Update site to conference_program layout variant
        schema = site["schema_json"]
        for c in schema:
            if c.get("type") == "hero":
                c["data"]["layout_variant"] = "conference_program"
                c["data"]["event_date"] = "December 5-9, 2026"
                c["data"]["event_location"] = "Geneva International Conference Centre, Switzerland"
                c["data"]["event_format"] = "In-Person & Virtual Stream"
                c["data"]["primary_btn_text"] = "Reserve Delegate Pass"
                c["data"]["primary_btn_url"] = "#register-pass"

        ok_upd, msg_upd, updated_site = builder_engine.update_site(site_id, {
            "schema_json": schema
        })
        self.assertTrue(ok_upd, f"Failed to update site schema: {msg_upd}")

        # Export ZIP
        zip_bytes, filename = builder_engine.export_site_zip(site_id)
        self.assertIsNotNone(zip_bytes)
        self.assertTrue(filename.endswith(".zip"))

        # Inspect ZIP archive contents
        with zipfile.ZipFile(io.BytesIO(zip_bytes), "r") as zf:
            namelist = zf.namelist()
            self.assertIn("index.html", namelist)
            self.assertIn("style.css", namelist)

            html_content = zf.read("index.html").decode("utf-8")
            self.assertIn("hero-program-wrap", html_content)
            self.assertIn("hero-program-card", html_content)
            self.assertIn("December 5-9, 2026", html_content)
            self.assertIn("Geneva International Conference Centre, Switzerland", html_content)
            self.assertIn("Reserve Delegate Pass", html_content)

            css_content = zf.read("style.css").decode("utf-8")
            self.assertIn(".hero-program-wrap", css_content)
            self.assertIn(".hero-program-card", css_content)

        # Cleanup
        builder_engine.delete_site(site_id)

    def test_05_live_published_output(self):
        """Published site endpoint /sites/{slug} serves the compiled Conference Program hero layout."""
        site = builder_engine.create_site(
            user_email="owner@sciprospect.com",
            name="Live Public Program Test",
            slug="live-public-program-test",
            template_id="biotech",
            custom_options={
                "hero_headline": "Synthetic Biology 2026",
                "hero_subheadline": "Engineering cellular machinery for sustainable materials."
            }
        )
        self.assertIsNotNone(site)
        site_id = site["site_id"]
        slug = site["slug"]

        # Configure conference program
        schema = site["schema_json"]
        for c in schema:
            if c.get("type") == "hero":
                c["data"]["layout_variant"] = "conference_program"
                c["data"]["event_date"] = "September 20–24, 2026"
                c["data"]["event_location"] = "Seattle Convention Center, WA"
                c["data"]["event_format"] = "Hybrid In-Person & Remote"
                c["data"]["primary_btn_text"] = "Register Now"

        builder_engine.update_site(site_id, {
            "schema_json": schema,
            "status": "published"
        })

        # Call public endpoint
        resp = asyncio.run(serve_public_website(slug))
        self.assertEqual(resp.status_code, 200)
        body = resp.body.decode("utf-8")
        self.assertIn("hero-program-wrap", body)
        self.assertIn("hero-program-card", body)
        self.assertIn("Synthetic Biology 2026", body)
        self.assertIn("September 20–24, 2026", body)
        self.assertIn("Seattle Convention Center, WA", body)
        self.assertIn("Hybrid In-Person & Remote", body)
        self.assertIn("Register Now", body)

        # Cleanup
        builder_engine.delete_site(site_id)

    def test_06_frontend_static_assets_contain_controls(self):
        """Static index.css and app.js must contain conference program layout controls and styles."""
        with open("web/static/app.js", "r", encoding="utf-8") as f:
            app_js = f.read()
        self.assertIn("conference_program", app_js)
        self.assertIn("setHeroLayoutVariant", app_js)
        self.assertIn("event_date", app_js)
        self.assertIn("event_location", app_js)
        self.assertIn("event_format", app_js)
        self.assertIn("canvas-hero-program-wrap", app_js)

        with open("web/static/index.css", "r", encoding="utf-8") as f:
            index_css = f.read()
        self.assertIn(".canvas-hero-program-wrap", index_css)
        self.assertIn(".mobile-view .canvas-hero-program-wrap", index_css)


if __name__ == "__main__":
    unittest.main()
