import os
import secrets
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT_DIR / "backend"))

import app as web_app
import billing
from license_manager import LicenseManager

PLANS = {"trial": {"id": "trial", "limits": {"members": 0, "daily_contacts": 1000}}, "pro": {"id": "pro", "limits": {"members": 4, "daily_contacts": 5000}}}


class TestCardTests(unittest.TestCase):
    def test_cards_like_stripe_test_mode(self):
        good = {"card_number": "4242 4242 4242 4242", "expiry": "12 / 30", "cvc": "123"}
        self.assertIsNone(billing.check_test_card(good))
        self.assertIn("declined", billing.check_test_card({**good, "card_number": "4000 0000 0000 0002"}))
        for bad in ({"card_number": "42"}, {"expiry": "13/30"}, {"cvc": "1"}):
            self.assertIn("Check the card", billing.check_test_card({**good, **bad}))

    def test_provider_switch(self):
        with patch.dict(os.environ, {"SCIPROSPECT_PAYMENTS": "stripe", "STRIPE_SECRET_KEY": ""}):
            self.assertEqual(billing.provider(), "test", "no key → stays in test mode")
        with patch.dict(os.environ, {"SCIPROSPECT_PAYMENTS": "stripe", "STRIPE_SECRET_KEY": "sk_test_x"}):
            self.assertEqual(billing.provider(), "stripe")


class HookTests(unittest.TestCase):
    """What each payment event does to the account."""
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.mgr = LicenseManager(db_path=Path(self.tmp.name) / "l.json", sessions_path=Path(self.tmp.name) / "s.json")
        self.key = self.mgr.create_account(name="Ada", email="ada@uni.edu", tier="trial", duration_days=7, daily_limit=1000, password="Password1!", plan_id="trial")["license_key"]

    def tearDown(self):
        self.tmp.cleanup()

    def expiry(self):
        from datetime import datetime
        return datetime.strptime(self.mgr.get_account(self.key)["expires_at"].replace(" UTC", ""), "%Y-%m-%d %H:%M:%S")

    def test_paid_renewed_ended(self):
        from datetime import datetime, timedelta
        with patch.object(web_app, "license_engine", self.mgr), patch.object(web_app, "_plan_by_id", PLANS.get):
            hooks = web_app._billing_hooks()
            hooks["on_paid"](self.key, "pro")
            hooks["on_renewed"](self.key, 30)
            account = self.mgr.get_account(self.key)
            self.assertEqual((account["plan_id"], account["seat_limit"], account["tier"], account["daily_limit"]), ("pro", 4, "pro", 5000), "the plan's per-user daily limit")
            self.assertAlmostEqual((self.expiry() - datetime.utcnow()).days, 30, delta=1, msg="the first payment starts a 30-day period now, not after the trial")
            before = self.expiry()
            hooks["on_renewed"](self.key, 30)
            self.assertAlmostEqual((self.expiry() - before).days, 30, delta=1, msg="a renewal adds the period")
            hooks["on_renewed"](self.key, 365)
            self.assertGreater(self.expiry(), datetime.utcnow() + timedelta(days=365 + 55), "a yearly payment adds 365 days")
            hooks["on_ended"](self.key)
            account = self.mgr.get_account(self.key)
            self.assertEqual((account["plan_id"], account["tier"], account["daily_limit"]), ("trial", "trial", 1000), "no permanent free plan: back to trial limits")

    def test_switching_plans_while_subscribed_changes_the_daily_limit_not_the_period(self):
        plans = {**PLANS, "ultra": {"id": "ultra", "limits": {"members": 9, "daily_contacts": 10000}}}
        with patch.object(web_app, "license_engine", self.mgr), patch.object(web_app, "_plan_by_id", plans.get):
            hooks = web_app._billing_hooks()
            hooks["on_paid"](self.key, "pro")
            hooks["on_renewed"](self.key, 30)
            period = self.expiry()
            hooks["on_paid"](self.key, "ultra")
            account = self.mgr.get_account(self.key)
            self.assertEqual((account["plan_id"], account["seat_limit"], account["daily_limit"]), ("ultra", 9, 10000))
            self.assertEqual(self.expiry(), period, "switching does not extend the paid period")

    def test_ended_trial_can_still_sign_in_to_pay(self):
        """The 7 days are over: sign-in works (to reach Billing only), and paying opens everything again."""
        from types import SimpleNamespace
        from fastapi import HTTPException
        db = self.mgr._load_db()
        db["licenses"][self.key]["expires_at"] = "2020-01-01 00:00:00 UTC"
        self.mgr._save_db(db)
        ok, user, _ = self.mgr.authenticate("ada@uni.edu", "Password1!")
        self.assertTrue(ok)
        self.assertTrue(user["license_expired"])
        token = self.mgr.issue_session(user)
        request = SimpleNamespace(cookies={"scip_token": token}, headers={}, url=SimpleNamespace(scheme="http"))
        with patch.object(web_app, "license_engine", self.mgr), patch.object(web_app, "_plan_by_id", PLANS.get):
            with self.assertRaises(HTTPException) as err:
                web_app._require_authenticated_user(request)
            self.assertEqual(err.exception.status_code, 403)
            self.assertIn("ended", err.exception.detail)
            self.assertTrue(web_app._require_authenticated_user(request, allow_expired=True)["license_expired"], "Billing stays open")
            hooks = web_app._billing_hooks()
            hooks["on_paid"](self.key, "pro")
            hooks["on_renewed"](self.key, 30)
            self.assertFalse(web_app._require_authenticated_user(request).get("license_expired"), "paying reopens the workspace")
            ok, user, _ = self.mgr.authenticate("ada@uni.edu", "Password1!")
            self.assertTrue(ok and not user["license_expired"])

    def test_an_ended_license_is_still_invalid_for_the_collector_and_everything_else(self):
        db = self.mgr._load_db()
        db["licenses"][self.key]["expires_at"] = "2020-01-01 00:00:00 UTC"
        self.mgr._save_db(db)
        self.assertEqual(self.mgr.validate_license(self.key)["status"], "expired")
        self.assertFalse(self.mgr.validate_license(self.key)["valid"], "expired stays invalid for everything that calls validate_license")


class InvoiceEmailTests(HookTests):
    def test_invoice_is_emailed_to_the_owner(self):
        from datetime import datetime, timezone
        sent = []

        class NowThread:
            def __init__(self, target, args, daemon):
                self.run = lambda: target(*args)

            def start(self):
                self.run()
        with patch.object(web_app, "license_engine", self.mgr), patch.object(web_app, "_plan_by_id", lambda p: {"name": "Pro"}),                 patch.object(web_app, "_send_quietly", lambda *a: sent.append(a)), patch.object(web_app.threading, "Thread", NowThread):
            now = datetime(2026, 11, 22, tzinfo=timezone.utc)
            web_app._billing_hooks()["on_invoice"](self.key, {"id": 7, "number": "INV-000007", "plan_id": "pro", "amount": 29.0, "currency": "USD",
                                                              "period_start": now, "period_end": now})
        to, subject, text, html = sent[0]
        self.assertEqual(to, "ada@uni.edu")
        self.assertIn("INV-000007", subject)
        self.assertIn("/billing/invoices/7", html)
        self.assertIn("generated automatically", text)


@unittest.skipUnless(os.environ.get("SCIPROSPECT_DB_SCHEMA", "").startswith("test_"), "Database test: set SCIPROSPECT_DB_SCHEMA=test_<name> (never the live data).")
class BillingDbTests(unittest.TestCase):
    def test_checkout_pay_renew_cancel(self):
        calls = []
        hooks = {"on_paid": lambda k, p: calls.append(("paid", p)), "on_renewed": lambda k, days: calls.append(("renewed", days)), "on_ended": lambda k: calls.append(("ended",))}
        key = f"TEST-BILLING-{secrets.token_hex(4)}"
        plan = {"id": "pro", "price_month": 89, "price_year": 890, "stripe_price_id": "", "stripe_price_id_year": ""}
        url = billing.create_checkout(key, "a@b.c", plan, "http://x")
        session_id = url.rsplit("/", 1)[1]
        self.assertTrue(billing.pay_test_checkout(session_id, key, hooks))
        self.assertFalse(billing.pay_test_checkout(session_id, key, hooks), "a checkout can be paid once")
        self.assertEqual(calls, [("paid", "pro"), ("renewed", 30)])
        self.assertEqual((len(billing.invoices(key)), billing.invoices(key)[0]["amount"], billing.subscription(key)["interval"]), (1, 89.0, "month"))
        self.assertTrue(billing.set_cancel(key, True, hooks))
        self.assertTrue(billing.subscription(key)["cancel_at_period_end"])

    def test_yearly_checkout_charges_the_yearly_price_for_a_year(self):
        calls = []
        hooks = {"on_paid": lambda k, p: None, "on_renewed": lambda k, days: calls.append(days), "on_ended": lambda k: None}
        key = f"TEST-BILLING-{secrets.token_hex(4)}"
        plan = {"id": "basic", "price_month": 39, "price_year": 390, "stripe_price_id": "", "stripe_price_id_year": ""}
        session_id = billing.create_checkout(key, "a@b.c", plan, "http://x", "year").rsplit("/", 1)[1]
        self.assertEqual((billing.checkout(session_id, key)["amount"], billing.checkout(session_id, key)["interval"]), (390.0, "year"))
        self.assertTrue(billing.pay_test_checkout(session_id, key, hooks))
        invoice = billing.invoices(key)[0]
        self.assertEqual(invoice["amount"], 390.0)
        self.assertEqual(calls, [365])
        self.assertEqual(billing.subscription(key)["interval"], "year")
        billing.switch_plan(key, billing.subscription(key), {"id": "pro", "stripe_price_id": "", "stripe_price_id_year": ""}, "month")
        self.assertEqual((billing.subscription(key)["plan_id"], billing.subscription(key)["interval"]), ("pro", "month"))

    def test_renewal_charges_the_plans_current_price_for_the_current_period(self):
        import db
        calls = []
        hooks = {"on_paid": lambda k, p: None, "on_renewed": lambda k, days: calls.append(days), "on_ended": lambda k: None}
        key = f"TEST-BILLING-{secrets.token_hex(4)}"
        plan = {"id": "basic", "price_month": 39, "price_year": 390, "stripe_price_id": "", "stripe_price_id_year": ""}
        session_id = billing.create_checkout(key, "a@b.c", plan, "http://x", "month").rsplit("/", 1)[1]
        self.assertTrue(billing.pay_test_checkout(session_id, key, hooks))
        billing.switch_plan(key, billing.subscription(key), {"id": "basic", "stripe_price_id": "", "stripe_price_id_year": ""}, "year")
        with db.transaction() as cur:
            cur.execute("UPDATE subscriptions SET current_period_end = now() - interval '1 day' WHERE account_key = %s", (key,))
        billing.sync_test(key, hooks)
        newest = billing.invoices(key)[0]
        self.assertEqual(newest["amount"], 390.0, "a yearly period is billed at the yearly price, not at the last monthly invoice")
        self.assertEqual(calls, [30, 365])


if __name__ == "__main__":
    unittest.main()
