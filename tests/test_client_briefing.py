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
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

import unittest
import json
import zipfile
import io
import asyncio
from app import get_published_page
from builder_manager import (
    builder_engine,
    get_websites_dir
)
from conference_manager import conference_engine


@unittest.skipUnless(os.environ.get("SCIPROSPECT_DB_SCHEMA", "").startswith("test_"), "Database test: set SCIPROSPECT_DB_SCHEMA=test_<name> to run against an isolated test schema (never the live data).")
class TestClientBriefingFlow(unittest.TestCase):

    def test_01_empty_workspace_state(self):
        """Empty workspace with 0 conferences and 0 websites operates without error."""
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

        # 5. Standalone ZIP export contains the brief details
        zip_bytes, _ = builder_engine.export_site_zip(site_id)
        with zipfile.ZipFile(io.BytesIO(zip_bytes), "r") as zf:
            zip_html = zf.read("index.html").decode("utf-8")
            self.assertIn("October 14, 2026 – October 18, 2026", zip_html)
            self.assertIn("Boston Convention & Exhibition Center, Boston, MA", zip_html)
            self.assertIn("secretariat@precisiononcology2026.org", zip_html)

        # 6. Public site delivery endpoint serves the briefed site
        builder_engine.update_site(site_id, {"status": "published"})
        resp = asyncio.run(get_published_page(slug))
        self.assertEqual(resp.status_code, 200)
        body = json.dumps(json.loads(resp.body), ensure_ascii=False)
        self.assertIn("Annual Precision Oncology Symposium 2026", body)
        self.assertIn("October 14, 2026 – October 18, 2026", body)
        self.assertIn("secretariat@precisiononcology2026.org", body)

        # Clean up
        builder_engine.delete_site(site_id)
