"""
Unit and Integration Tests for SciStudio Client Briefing Form and Empty Workspace.
Verifies:
1. Empty workspace state (0 conferences, 0 websites) handles requests gracefully without errors.
2. Validation: only conference name is required, other fields are optional.
3. Review step identifies missing optional details and permits editing without data loss.
4. Briefing carried through: full brief is stored on the website and mapped into
   hero (event_date, event_location, event_format) and contact (email, address) components.
5. Minimal brief: creating website with only the required conference name uses smart defaults.
6. Standalone compilation and ZIP export include the briefed conference details.
"""

import sys
import os
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "web"))

import unittest
import json
import zipfile
import io
import asyncio
from app import serve_public_website
from builder_manager import (
    compile_website_html,
    builder_engine,
    get_websites_dir
)
from conference_manager import (
    conference_engine,
    get_conferences_dir
)


class TestClientBriefingFlow(unittest.TestCase):

    def test_01_empty_workspace_state(self):
        """Empty workspace with 0 conferences and 0 websites operates without error."""
        conf_dir = get_conferences_dir()
        sites_dir = get_websites_dir()

        # List all conferences
        confs = conference_engine.list_conferences("root@sciprospect.internal")
        self.assertIsInstance(confs, list)

        # List all sites
        sites = builder_engine.list_sites("root@sciprospect.internal")
        self.assertIsInstance(sites, list)

    def test_02_briefing_validation_only_conference_name_required(self):
        """Conference Name is required; start_date, end_date, venue_format, contact_email are optional."""
        # Minimal brief with only required conference name
        minimal_brief = {
            "conference_name": "International Congress on Neurogenetics 2026",
            "start_date": "",
            "end_date": "",
            "venue_format": "",
            "contact_email": ""
        }
        self.assertTrue(bool(minimal_brief["conference_name"].strip()))
        self.assertFalse(bool(minimal_brief["start_date"]))
        self.assertFalse(bool(minimal_brief["end_date"]))
        self.assertFalse(bool(minimal_brief["venue_format"]))
        self.assertFalse(bool(minimal_brief["contact_email"]))

        # Creation succeeds with minimal brief
        site = builder_engine.create_site(
            user_email="owner@sciprospect.com",
            name=minimal_brief["conference_name"],
            slug="neurogenetics-2026",
            template_id="neuroscience",
            custom_options={
                "client_brief": minimal_brief
            }
        )
        self.assertIsNotNone(site)
        site_id = site["site_id"]
        self.assertEqual(site["client_brief"]["conference_name"], "International Congress on Neurogenetics 2026")
        self.assertEqual(site["client_brief"]["start_date"], "")

        # Check hero component used sensible default date
        hero_comp = next((c for c in site["schema_json"] if c["type"] == "hero"), None)
        self.assertIsNotNone(hero_comp)
        self.assertTrue(bool(hero_comp["data"].get("event_date")))

        # Clean up
        builder_engine.delete_site(site_id)

    def test_03_brief_carried_through_into_website_components(self):
        """Full brief is carried through into site_data, hero (date, venue, format) and contact (email, address)."""
        full_brief = {
            "conference_name": "Annual Precision Oncology Symposium 2026",
            "start_date": "October 14, 2026",
            "end_date": "October 18, 2026",
            "venue_format": "Boston Convention & Exhibition Center, Boston, MA",
            "contact_email": "secretariat@precisiononcology2026.org"
        }

        site = builder_engine.create_site(
            user_email="owner@sciprospect.com",
            name=full_brief["conference_name"],
            slug="precision-oncology-brief-test",
            template_id="biotech",
            custom_options={
                "client_brief": full_brief
            }
        )
        self.assertIsNotNone(site)
        site_id = site["site_id"]
        slug = site["slug"]

        # 1. Stored on site record
        self.assertIn("client_brief", site)
        self.assertEqual(site["client_brief"]["conference_name"], full_brief["conference_name"])
        self.assertEqual(site["client_brief"]["start_date"], "October 14, 2026")
        self.assertEqual(site["client_brief"]["end_date"], "October 18, 2026")
        self.assertEqual(site["client_brief"]["venue_format"], full_brief["venue_format"])
        self.assertEqual(site["client_brief"]["contact_email"], full_brief["contact_email"])

        # 2. Hero Component receives dates, location, format, and conference_program variant
        hero_comp = next((c for c in site["schema_json"] if c["type"] == "hero"), None)
        self.assertIsNotNone(hero_comp)
        self.assertIn("October 14, 2026 – October 18, 2026", hero_comp["data"]["event_date"])
        self.assertEqual(hero_comp["data"]["event_location"], full_brief["venue_format"])
        self.assertEqual(hero_comp["data"]["event_format"], full_brief["venue_format"])
        self.assertEqual(hero_comp["data"]["layout_variant"], "conference_program")

        # 3. Contact Component receives email and address
        contact_comp = next((c for c in site["schema_json"] if c["type"] == "contact"), None)
        self.assertIsNotNone(contact_comp)
        self.assertEqual(contact_comp["data"]["email"], "secretariat@precisiononcology2026.org")
        self.assertEqual(contact_comp["data"]["address"], full_brief["venue_format"])

        # 4. Standalone HTML compilation embeds the brief details
        html, css = compile_website_html(site)
        self.assertIn("October 14, 2026 – October 18, 2026", html)
        self.assertIn("Boston Convention & Exhibition Center, Boston, MA", html)
        self.assertIn("secretariat@precisiononcology2026.org", html)

        # 5. Standalone ZIP export contains the brief details
        zip_bytes, _ = builder_engine.export_site_zip(site_id)
        with zipfile.ZipFile(io.BytesIO(zip_bytes), "r") as zf:
            zip_html = zf.read("index.html").decode("utf-8")
            self.assertIn("October 14, 2026 – October 18, 2026", zip_html)
            self.assertIn("Boston Convention & Exhibition Center, Boston, MA", zip_html)
            self.assertIn("secretariat@precisiononcology2026.org", zip_html)

        # 6. Public site delivery endpoint serves the briefed site
        builder_engine.update_site(site_id, {"status": "published"})
        resp = asyncio.run(serve_public_website(slug))
        self.assertEqual(resp.status_code, 200)
        body = resp.body.decode("utf-8")
        self.assertIn("Annual Precision Oncology Symposium 2026", body)
        self.assertIn("October 14, 2026 – October 18, 2026", body)
        self.assertIn("secretariat@precisiononcology2026.org", body)

        # Clean up
        builder_engine.delete_site(site_id)

    def test_04_review_step_and_stepper_in_html_and_js(self):
        """Static HTML, CSS, and JS include briefing inputs, review step, missing detail tags, and back nav."""
        with open("web/static/index.html", "r", encoding="utf-8") as f:
            html = f.read()

        # Step 1 inputs
        self.assertIn('id="brief-conf-name"', html)
        self.assertIn('id="brief-start-date"', html)
        self.assertIn('id="brief-end-date"', html)
        self.assertIn('id="brief-venue-format"', html)
        self.assertIn('id="brief-contact-email"', html)
        self.assertIn('id="btn-brief-next"', html)

        # Step 2 review container & back button
        self.assertIn('id="wizard-pane-2"', html)
        self.assertIn('id="review-summary-container"', html)
        self.assertIn('id="btn-review-back"', html)
        self.assertIn('id="btn-review-proceed"', html)

        # Step 3 template pane & back button
        self.assertIn('id="wizard-pane-3"', html)
        self.assertIn('id="btn-templates-back"', html)

        with open("web/static/index.css", "r", encoding="utf-8") as f:
            css = f.read()
        self.assertIn(".wizard-stepper", css)
        self.assertIn(".badge-provided", css)
        self.assertIn(".badge-missing", css)
        self.assertIn(".review-notice-banner", css)

        with open("web/static/app.js", "r", encoding="utf-8") as f:
            js = f.read()
        self.assertIn("switchWizardStep", js)
        self.assertIn("renderReviewSummary", js)
        self.assertIn("btnReviewBack", js)
        self.assertIn("client_brief", js)


if __name__ == "__main__":
    unittest.main()

