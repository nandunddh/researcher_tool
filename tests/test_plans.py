import asyncio
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

ROOT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT_DIR / "backend"))

import app as web_app
import plans
from license_manager import LicenseManager

PRO = {"id": "pro", "name": "Pro", "price_month": 29, "limits": {"websites": 2, "pages": 3, "members": 3, "storage_mb": 10, "submissions_month": 5}}


class _Req:
    def __init__(self, payload=None):
        self._payload = payload or {}

    async def json(self):
        return self._payload


class PlanRulesTests(unittest.TestCase):
    def test_limits(self):
        self.assertIsNone(plans.over_limit(PRO, "websites", 2))
        self.assertIn("2 website", plans.over_limit(PRO, "websites", 3))
        self.assertIsNone(plans.over_limit({"limits": {"websites": -1}}, "websites", 10**6), "-1 = unlimited")
        self.assertIsNone(plans.over_limit(None, "pages", 999), "no plan = no limit (root)")
        self.assertIn("10 MB", plans.over_limit(PRO, "storage_mb", 10.2))

    def test_clean_plan(self):
        clean = plans.clean_plan({"name": " Team ", "price_month": "49.5", "limits": {"websites": "4", "pages": -5, "custom_domain": "yes"}})
        self.assertEqual(clean["name"], "Team")
        self.assertEqual(clean["price_month"], 49.5)
        self.assertEqual(clean["limits"]["websites"], 4)
        self.assertEqual(clean["limits"]["pages"], -1, "negative = unlimited")
        self.assertEqual(clean["limits"]["members"], -1, "missing = unlimited")
        self.assertFalse(clean["limits"]["custom_domain"], "only true counts")
        self.assertFalse(clean["featured"])
        self.assertTrue(plans.clean_plan({"name": "B", "featured": True})["featured"])
        for bad in ({"name": ""}, {"name": "X", "price_month": "free"}, {"name": "X", "limits": {"websites": "many"}}):
            with self.assertRaises(ValueError):
                plans.clean_plan(bad)

    def test_default_plan(self):
        self.assertEqual(plans.default_plan_id({"plan_id": "free", "tier": "pro"}), "free")
        self.assertEqual(plans.default_plan_id({"account_type": "org"}), "organization")
        self.assertEqual(plans.default_plan_id({"tier": "pro"}), "pro")
        self.assertEqual(plans.default_plan_id({"tier": "trial"}), "free")


class PlanAccountsTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.mgr = LicenseManager(db_path=Path(self.tmp.name) / "l.json", sessions_path=Path(self.tmp.name) / "s.json")
        self.acc = self.mgr.create_account(name="Jane", email="jane@uni.edu", account_type="org", org_name="Lab", tier="pro", seat_limit=5, password="Password1!")
        self.mgr.add_org_member(parent_key=self.acc["license_key"], name="Sam", email="sam@uni.edu", role="editor", password="Password1!")

    def tearDown(self):
        self.tmp.cleanup()

    def test_set_plan_and_lookup(self):
        ok, _ = self.mgr.set_plan(self.acc["license_key"], "pro", 3)
        self.assertTrue(ok)
        account = self.mgr.get_account(self.acc["license_key"])
        self.assertEqual((account["plan_id"], account["seat_limit"]), ("pro", 3))
        self.assertEqual(self.mgr.account_for_email("SAM@uni.edu")["license_key"], self.acc["license_key"], "member → their organization")
        self.assertFalse(self.mgr.set_plan("SCIP-PRO-ROOT-MASTER", "free", 0)[0])

    def test_website_limit_blocks_creation(self):
        user = {"license_key": self.acc["license_key"], "client_email": "jane@uni.edu", "scistudio_access": True}
        fake = SimpleNamespace(usage=lambda email: {"websites": 2}, over_limit=plans.over_limit)
        with patch.object(web_app, "_require_authenticated_user", lambda r: user), patch.object(web_app, "_require_scistudio_access", lambda u: None), \
                patch.object(web_app, "_user_plan", lambda u: PRO), patch.dict(sys.modules, {"plans": fake}):
            with self.assertRaises(HTTPException) as err:
                asyncio.run(web_app.builder_create_site(_Req({"name": "Third"})))
        self.assertEqual(err.exception.status_code, 403)
        self.assertIn("2 website", err.exception.detail)


if __name__ == "__main__":
    unittest.main()
