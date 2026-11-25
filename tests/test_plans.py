import asyncio
import os
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
        self.assertIn("10 MB", plans.over_limit({"limits": {"data_storage_mb": 10}}, "data_storage_mb", 10.5))
        self.assertIsNone(plans.over_limit({"limits": {"data_storage_mb": 10}}, "data_storage_mb", 10))
        for key in ("websites", "pages", "storage_mb", "data_storage_mb"):
            self.assertIn("Billing", plans.over_limit({"limits": {key: 1}}, key, 2), "customers upgrade themselves, no administrator to ask")

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

    def test_clean_plan_pricing_fields(self):
        clean = plans.clean_plan({"name": "Basic", "price_month": 39, "price_year": "390", "kind": "paid", "retired": True,
                                  "stripe_price_id_year": "price_y1", "limits": {"daily_contacts": 3000, "data_storage_mb": 10000}})
        self.assertEqual((clean["price_year"], clean["kind"], clean["retired"], clean["stripe_price_id_year"]), (390.0, "paid", True, "price_y1"))
        self.assertEqual((clean["limits"]["daily_contacts"], clean["limits"]["data_storage_mb"]), (3000, 10000))
        self.assertEqual(plans.clean_plan({"name": "X"})["kind"], "paid", "paid unless said otherwise")
        self.assertFalse(plans.clean_plan({"name": "X"})["retired"])
        for bad in ({"name": "X", "kind": "gift"}, {"name": "X", "price_year": "cheap"}, {"name": "X", "stripe_price_id_year": "oops"}):
            with self.assertRaises(ValueError):
                plans.clean_plan(bad)

    def test_daily_contacts(self):
        self.assertEqual(plans.daily_contacts({"limits": {"daily_contacts": 5000}}), 5000)
        self.assertEqual(plans.daily_contacts({"limits": {"daily_contacts": -1}}), -1)
        self.assertEqual(plans.daily_contacts({"limits": {}}), -1, "not set = unlimited")
        self.assertEqual(plans.daily_contacts(None), -1)

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

    def test_usage_for_all_accounts_in_one_go(self):
        calls = []
        fake_plans = SimpleNamespace(usage_all=lambda: calls.append("usage") or {"jane@uni.edu": {"websites": 2, "pages": 3, "storage_mb": 1.0, "submissions_month": 9}},
                                     default_plan_id=plans.default_plan_id)
        fake_billing = SimpleNamespace(all_subscriptions=lambda: calls.append("subs") or {})
        with patch.object(web_app, "license_engine", self.mgr), patch.object(web_app, "_verify_admin_auth", lambda r: None),                 patch.dict(sys.modules, {"plans": fake_plans, "billing": fake_billing}):
            out = asyncio.run(web_app.admin_usage(_Req()))["accounts"]
        self.assertEqual(calls, ["usage", "subs"], "one batch each, not per account")
        self.assertEqual(out[self.acc["license_key"]]["usage"]["websites"], 2)
        self.assertNotIn("SCIP-PRO-ROOT-MASTER", out)

    def test_website_limit_blocks_creation(self):
        user = {"license_key": self.acc["license_key"], "client_email": "jane@uni.edu", "scistudio_access": True}
        fake = SimpleNamespace(usage=lambda email: {"websites": 2}, over_limit=plans.over_limit)
        with patch.object(web_app, "_require_authenticated_user", lambda r: user), patch.object(web_app, "_require_scistudio_access", lambda u: None), \
                patch.object(web_app, "_user_plan", lambda u: PRO), patch.dict(sys.modules, {"plans": fake}):
            with self.assertRaises(HTTPException) as err:
                asyncio.run(web_app.builder_create_site(_Req({"name": "Third"})))
        self.assertEqual(err.exception.status_code, 403)
        self.assertIn("2 website", err.exception.detail)


@unittest.skipUnless(os.environ.get("SCIPROSPECT_DB_SCHEMA", "").startswith("test_"), "Database test: set SCIPROSPECT_DB_SCHEMA=test_<name> (never the live data).")
class NewPricingSeedTests(unittest.TestCase):
    """Migration 105 on a fresh database: the plans the pricing page sells."""
    def setUp(self):
        self.all = {p["id"]: p for p in plans.list_plans()}

    def test_plans_and_prices(self):
        for plan_id, month, year in (("basic", 39, 390), ("pro", 89, 890), ("ultra", 199, 1990)):
            plan = self.all[plan_id]
            self.assertEqual((plan["price_month"], plan["price_year"], plan["kind"], plan["retired"]), (month, year, "paid", False))
            self.assertEqual(plan["price_year"], plan["price_month"] * 10, "annual billing saves two months")
        self.assertEqual((self.all["trial"]["kind"], self.all["trial"]["price_month"]), ("trial", 0))
        self.assertEqual((self.all["custom"]["kind"], self.all["custom"]["price_month"]), ("custom", 0))

    def test_limits_match_the_price_list(self):
        wanted = {"trial": (1, 1000, 3), "basic": (2, 3000, 3), "pro": (5, 5000, 5), "ultra": (10, 10000, 10)}  # users, per-user daily contacts, websites
        for plan_id, (users, daily, websites) in wanted.items():
            limits = self.all[plan_id]["limits"]
            self.assertEqual((limits["members"] + 1, limits["daily_contacts"], limits["websites"]), (users, daily, websites), plan_id)
        # "Daily workspace maximum with all included users active": users x per-user limit
        self.assertEqual([(self.all[i]["limits"]["members"] + 1) * self.all[i]["limits"]["daily_contacts"] for i in ("basic", "pro", "ultra")], [6000, 25000, 100000])
        self.assertEqual([self.all[i]["limits"]["pages"] for i in ("basic", "pro", "ultra")], [5, 12, 25])
        self.assertEqual([self.all[i]["limits"]["storage_mb"] for i in ("basic", "pro", "ultra")], [4000, 10000, 20000])
        self.assertEqual([self.all[i]["limits"]["data_storage_mb"] for i in ("basic", "pro", "ultra")], [10000, 20000, 50000])
        self.assertEqual([self.all[i]["limits"]["custom_domain"] for i in ("basic", "pro", "ultra")], [False, True, True])

    def test_old_plans_are_retired_but_kept_and_not_shown(self):
        for plan_id in ("free", "business", "organization"):
            self.assertTrue(self.all[plan_id]["retired"], plan_id)
        shown = [p["id"] for p in plans.public_plans()]
        self.assertEqual(shown, ["trial", "basic", "pro", "ultra", "custom"])
        self.assertNotIn("stripe_price_id", plans.public_plans()[0], "visitors never see Stripe ids")


if __name__ == "__main__":
    unittest.main()
