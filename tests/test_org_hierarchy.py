import unittest
import tempfile
from pathlib import Path
from web.license_manager import LicenseManager

class OrgHierarchyTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "licenses_test.json"
        self.mgr = LicenseManager(db_path=self.db_path)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_create_org_and_members(self):
        # 1. Create Organization
        org = self.mgr.create_account(
            name="Dr. Alex Vance",
            email="alex@blackmesa.org",
            account_type="org",
            org_name="Black Mesa Research Facility",
            seat_limit=2,
            scistudio_access=True
        )
        self.assertEqual(org["account_type"], "org")
        self.assertEqual(org["org_name"], "Black Mesa Research Facility")
        self.assertEqual(org["seat_limit"], 2)

        # 2. Add Member 1
        ok, msg, mem1 = self.mgr.add_org_member(
            parent_key=org["license_key"],
            name="Gordon Freeman",
            email="gordon@blackmesa.org",
            role="editor",
            scistudio_access=True
        )
        self.assertTrue(ok)
        self.assertEqual(mem1["name"], "Gordon Freeman")
        self.assertTrue(mem1["scistudio_access"])

        # 3. Add Member 2
        ok, msg, mem2 = self.mgr.add_org_member(
            parent_key=org["license_key"],
            name="Eli Vance",
            email="eli@blackmesa.org",
            role="admin",
            scistudio_access=False
        )
        self.assertTrue(ok)

        # 4. Seat limit exceeded
        ok, msg, mem3 = self.mgr.add_org_member(
            parent_key=org["license_key"],
            name="Barney Calhoun",
            email="barney@blackmesa.org"
        )
        self.assertFalse(ok)
        self.assertIn("seat limit reached", msg.lower())

        # 5. Check Stats
        stats = self.mgr.get_stats()
        self.assertEqual(stats["org_count"], 1)
        self.assertEqual(stats["total_members"], 2)

        # 6. Toggle SciStudio for Member 2
        ok, msg, updated_mem = self.mgr.toggle_member_scistudio(
            parent_key=org["license_key"],
            member_id=mem2["member_id"],
            enable=True
        )
        self.assertTrue(ok)
        self.assertTrue(updated_mem["scistudio_access"])

        # 7. Remove Member 1
        ok, msg = self.mgr.remove_org_member(org["license_key"], mem1["member_id"])
        self.assertTrue(ok)
        acc = self.mgr.get_account(org["license_key"])
        self.assertEqual(len(acc["members"]), 1)

if __name__ == '__main__':
    unittest.main()
