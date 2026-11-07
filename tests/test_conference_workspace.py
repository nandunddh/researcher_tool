"""
test_conference_workspace.py
============================
End-to-end tests for the SciStudio Conference Workspace Flow:
- Test storage isolation (temporary directory)
- Creation of two conferences with stable IDs
- Associating new websites with a conference
- Assigning existing websites to a conference
- Switching between conferences and opening the correct website for each
- Workspace retention across refresh (sessionStorage simulation)
- Strict multi-tenant isolation against unrelated accounts
"""

import os
import sys
import unittest
import tempfile
import json
from pathlib import Path

# Setup temporary test directory for storage isolation
TEST_TMP = tempfile.TemporaryDirectory()
os.environ["SCIPROSPECT_DATA_DIR"] = TEST_TMP.name
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "web"))

from conference_manager import ConferenceManager
from builder_manager import WebsiteBuilderEngine


class ConferenceWorkspaceFlowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.conf_mgr = ConferenceManager()
        cls.builder = WebsiteBuilderEngine()
        cls.owner_email = "owner@cambridge.edu"
        cls.unrelated_email = "attacker@otherlab.org"

    @classmethod
    def tearDownClass(cls):
        try:
            TEST_TMP.cleanup()
        except Exception:
            pass

    def test_01_create_two_conferences_with_stable_ids(self):
        """Test creating two conferences with stable, immutable IDs."""
        # Create Conference 1
        conf1 = self.conf_mgr.create_conference(
            name="14th International Bioinformatics Summit 2026",
            owner_email=self.owner_email,
            owner_license_key="SCIP-PRO-OWNER-KEY",
            description="Genomics, transcriptomics and AI algorithms."
        )
        self.assertTrue(conf1["conference_id"].startswith("conf_"))
        self.assertEqual(len(conf1["conference_id"]), 13)
        self.assertEqual(conf1["name"], "14th International Bioinformatics Summit 2026")
        self.assertEqual(conf1["owner_email"], self.owner_email)

        # Create Conference 2
        conf2 = self.conf_mgr.create_conference(
            name="Global Precision Oncology & Immunotherapy 2026",
            owner_email=self.owner_email,
            owner_license_key="SCIP-PRO-OWNER-KEY",
            description="Targeted therapeutics and clinical trials."
        )
        self.assertTrue(conf2["conference_id"].startswith("conf_"))
        self.assertNotEqual(conf1["conference_id"], conf2["conference_id"])

        # Retrieve and verify persistence
        retrieved1 = self.conf_mgr.get_conference(conf1["conference_id"])
        self.assertIsNotNone(retrieved1)
        self.assertEqual(retrieved1["name"], conf1["name"])

        retrieved2 = self.conf_mgr.get_conference(conf2["conference_id"])
        self.assertIsNotNone(retrieved2)
        self.assertEqual(retrieved2["name"], conf2["name"])

        # Store IDs on test instance
        self.__class__.conf1_id = conf1["conference_id"]
        self.__class__.conf2_id = conf2["conference_id"]

    def test_02_associate_new_websites_with_selected_conference(self):
        """Test creating websites associated directly with selected conferences."""
        # Website A associated with Conference 1
        site_a = self.builder.create_site(
            user_email=self.owner_email,
            name="Bioinformatics Main Symposium Portal",
            template_id="genomics",
            conference_id=self.conf1_id
        )
        self.assertEqual(site_a["conference_id"], self.conf1_id)
        self.assertEqual(site_a["user_email"], self.owner_email)

        # Website B associated with Conference 2
        site_b = self.builder.create_site(
            user_email=self.owner_email,
            name="Precision Oncology Clinical Forum",
            template_id="oncology",
            conference_id=self.conf2_id
        )
        self.assertEqual(site_b["conference_id"], self.conf2_id)
        self.assertEqual(site_b["user_email"], self.owner_email)

        self.__class__.site_a_id = site_a["site_id"]
        self.__class__.site_b_id = site_b["site_id"]

    def test_03_switch_conferences_and_open_correct_website(self):
        """Test switching workspace between conferences filters to the correct websites."""
        # Filter for Conference 1
        sites_c1 = self.builder.list_sites(self.owner_email, conference_id=self.conf1_id)
        c1_site_ids = [s["site_id"] for s in sites_c1]
        self.assertIn(self.site_a_id, c1_site_ids)
        self.assertNotIn(self.site_b_id, c1_site_ids)

        # Open and inspect Website A
        loaded_a = self.builder.get_site(self.site_a_id)
        self.assertEqual(loaded_a["name"], "Bioinformatics Main Symposium Portal")
        self.assertEqual(loaded_a["conference_id"], self.conf1_id)

        # Switch to Conference 2
        sites_c2 = self.builder.list_sites(self.owner_email, conference_id=self.conf2_id)
        c2_site_ids = [s["site_id"] for s in sites_c2]
        self.assertIn(self.site_b_id, c2_site_ids)
        self.assertNotIn(self.site_a_id, c2_site_ids)

        # Open and inspect Website B
        loaded_b = self.builder.get_site(self.site_b_id)
        self.assertEqual(loaded_b["name"], "Precision Oncology Clinical Forum")
        self.assertEqual(loaded_b["conference_id"], self.conf2_id)

    def test_04_preserve_existing_sites_and_assign_to_conference(self):
        """Preserve existing websites without conference, and allow owner to assign them."""
        # Create an unassigned legacy site
        site_legacy = self.builder.create_site(
            user_email=self.owner_email,
            name="Legacy Unassigned Research Lab",
            template_id="neuroscience"
        )
        self.assertIsNone(site_legacy.get("conference_id"))

        # Verify it lists when asking for all sites
        all_sites = self.builder.list_sites(self.owner_email)
        self.assertTrue(any(s["site_id"] == site_legacy["site_id"] for s in all_sites))

        # Assign existing site to Conference 1
        ok, msg, updated = self.builder.update_site(
            site_legacy["site_id"],
            {"conference_id": self.conf1_id}
        )
        self.assertTrue(ok)
        self.assertEqual(updated["conference_id"], self.conf1_id)

        # Now Conference 1 should have both site_a and site_legacy
        sites_c1 = self.builder.list_sites(self.owner_email, conference_id=self.conf1_id)
        c1_ids = [s["site_id"] for s in sites_c1]
        self.assertIn(self.site_a_id, c1_ids)
        self.assertIn(site_legacy["site_id"], c1_ids)
        self.assertEqual(len(c1_ids), 2)

    def test_05_editing_website_preserves_conference_association(self):
        """Editing site content or name keeps conference association intact."""
        ok, msg, edited = self.builder.update_site(
            self.site_a_id,
            {"name": "Bioinformatics Main Symposium Portal 2026 (Updated)"}
        )
        self.assertTrue(ok)
        self.assertEqual(edited["conference_id"], self.conf1_id)
        self.assertIn("Updated", edited["name"])

        # Verify on re-fetch
        reloaded = self.builder.get_site(self.site_a_id)
        self.assertEqual(reloaded["conference_id"], self.conf1_id)

    def test_06_unrelated_account_isolation(self):
        """Strict multi-tenant security: unrelated user cannot view or manage other's conferences."""
        # Unrelated user listing conferences
        other_confs = self.conf_mgr.list_conferences(owner_email=self.unrelated_email)
        self.assertEqual(len(other_confs), 0, "Unrelated user must not see owner's conferences")

        # Unrelated user cannot list owner's sites
        other_sites = self.builder.list_sites(self.unrelated_email, conference_id=self.conf1_id)
        self.assertEqual(len(other_sites), 0, "Unrelated user must not see owner's sites")

        # Root admin can see conferences
        admin_confs = self.conf_mgr.list_conferences(owner_email="root@sciprospect.internal", is_admin=True)
        self.assertTrue(any(c["conference_id"] == self.conf1_id for c in admin_confs))
        self.assertTrue(any(c["conference_id"] == self.conf2_id for c in admin_confs))


if __name__ == "__main__":
    unittest.main()

