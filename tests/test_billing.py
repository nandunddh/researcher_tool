import os
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

PLANS = {"free": {"id": "free", "limits": {"members": 0}}, "pro": {"id": "pro", "limits": {"members": 3}}}


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
        self.key = self.mgr.create_account(name="Ada", email="ada@uni.edu", tier="trial", duration_days=365, daily_limit=100, password="Password1!", plan_id="free")["license_key"]

    def tearDown(self):
        self.tmp.cleanup()

    def test_paid_renewed_ended(self):
        with patch.object(web_app, "license_engine", self.mgr), patch.object(web_app, "_plan_by_id", PLANS.get):
            hooks = web_app._billing_hooks()
            hooks["on_paid"](self.key, "pro")
            hooks["on_renewed"](self.key)
            account = self.mgr.get_account(self.key)
            self.assertEqual((account["plan_id"], account["seat_limit"], account["tier"]), ("pro", 3, "pro"))
            first_expiry = account["expires_at"]
            hooks["on_renewed"](self.key)
            self.assertGreater(self.mgr.get_account(self.key)["expires_at"], first_expiry, "renewal extends the license")
            hooks["on_ended"](self.key)
            account = self.mgr.get_account(self.key)
            self.assertEqual((account["plan_id"], account["tier"]), ("free", "trial"))
            self.assertTrue(self.mgr.validate_license(self.key)["valid"], "still signs in on Free")


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
        hooks = {"on_paid": lambda k, p: calls.append(("paid", p)), "on_renewed": lambda k: calls.append(("renewed",)), "on_ended": lambda k: calls.append(("ended",))}
        key = "TEST-BILLING-1"
        url = billing.create_checkout(key, "a@b.c", {"id": "pro", "price_month": 29, "stripe_price_id": ""}, "http://x")
        session_id = url.rsplit("/", 1)[1]
        self.assertTrue(billing.pay_test_checkout(session_id, key, hooks))
        self.assertFalse(billing.pay_test_checkout(session_id, key, hooks), "a checkout can be paid once")
        self.assertEqual(calls, [("paid", "pro"), ("renewed",)])
        self.assertEqual(len(billing.invoices(key)), 1)
        self.assertTrue(billing.set_cancel(key, True, hooks))
        self.assertTrue(billing.subscription(key)["cancel_at_period_end"])


if __name__ == "__main__":
    unittest.main()
