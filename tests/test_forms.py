import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
import forms  # noqa: E402

SECTION = {"id": "c1", "type": "contact", "data": {"form_fields": [
    {"id": "name", "label": "Name", "type": "text", "required": True},
    {"id": "email", "label": "Email", "type": "email", "required": True},
    {"id": "topic", "label": "Topic", "type": "select", "options": ["Registration", "Abstracts"]},
    {"id": "agree", "label": "I agree", "type": "checkbox", "required": True},
]}}


class FormTests(unittest.TestCase):
    def test_valid_submission_keeps_only_known_fields(self):
        values, problem = forms.clean_submission(SECTION, {"name": " Ada ", "email": "ada@uni.edu", "topic": "Abstracts", "agree": True, "evil": "<script>"})
        self.assertIsNone(problem)
        self.assertEqual(values["name"], {"label": "Name", "value": "Ada"})
        self.assertNotIn("evil", values)

    def test_problems_are_explained(self):
        good = {"name": "Ada", "email": "ada@uni.edu", "agree": True}
        self.assertIn("Name", forms.clean_submission(SECTION, {**good, "name": ""})[1])
        self.assertIn("valid email", forms.clean_submission(SECTION, {**good, "email": "nope"})[1])
        self.assertIn("option", forms.clean_submission(SECTION, {**good, "topic": "Hacking"})[1])
        self.assertIn("tick", forms.clean_submission(SECTION, {**good, "agree": False})[1])
        self.assertIsNotNone(forms.clean_submission(SECTION, {**good, "_hp": "bot"})[1], "spam trap")
        self.assertIsNotNone(forms.clean_submission(SECTION, "not a dict")[1])

    def test_default_fields_and_finding_forms_on_any_page(self):
        bare = {"id": "c2", "type": "contact", "data": {}}
        self.assertEqual([f["id"] for f in forms.form_fields(bare)], ["name", "email", "message"])
        site = {"schema_json": [], "pages": [{"id": "p2", "schema_json": [bare, {"id": "h", "type": "hero"}]}]}
        self.assertEqual(forms.find_form(site, "c2"), (bare, "p2"))
        self.assertEqual(forms.find_form(site, "h"), (None, None), "only form sections accept submissions")
        popup = {"id": "b1", "type": "form_button", "data": {}}
        self.assertEqual(forms.find_form({"schema_json": [popup]}, "b1")[0], popup, "button forms accept submissions")


if __name__ == "__main__":
    unittest.main()


from datetime import date  # noqa: E402

REG = {"id": "r1", "type": "registration", "data": {
    "currency": "usd",
    # Deliberately out of order: the server sorts by end date, open-ended last.
    "periods": [{"id": "late", "name": "Late", "ends": ""}, {"id": "std", "name": "Standard", "ends": "2027-05-31"},
                {"id": "early", "name": "Early bird", "ends": "2027-03-31"}],
    "categories": [{"id": "academic", "name": "Academic", "prices": {"early": 699, "std": 799, "late": 899}},
                   {"id": "student", "name": "Student", "prices": {"early": 99.5, "std": "", "late": None}}],
    "addons": [{"id": "night", "name": "Night", "price": 190, "max": 3}],
    "discount_codes": [{"code": "EARLY10", "percent": 10}],
}}


class RegistrationPricingTests(unittest.TestCase):
    def test_custom_periods_blank_prices_and_closing(self):
        q = lambda d, cat="student": forms.quote(REG, {"category": cat}, d)
        self.assertEqual(q(date(2027, 1, 1))[0]["total"], 99.5, "decimals allowed")
        self.assertIn("not available during Standard", q(date(2027, 4, 1))[1])
        closed = {**REG, "data": {**REG["data"], "periods": [{"id": "early", "name": "Early", "ends": "2027-03-31"}]}}
        self.assertIn("closed", forms.quote(closed, {"category": "academic"}, date(2027, 4, 1))[1])
        self.assertIn("closed", forms.quote({"data": {"categories": REG["data"]["categories"]}}, {"category": "academic"})[1])

    def test_event_details_drive_registration(self):
        import public_site
        event = {"basics": {"currency": "eur"}, "periods": REG["data"]["periods"],
                 "tickets": REG["data"]["categories"] + [{"id": "vip", "name": "VIP", "prices": {"early": 5000}}],
                 "addons": [{"id": "night", "name": "Night", "price": 100, "max": 2}, {"id": "dinner", "name": "Dinner", "price": 80}],
                 "discounts": [{"id": "d1", "code": "OLD", "percent": 50, "expires": "2026-12-31"}, {"id": "d2", "code": "ALL", "percent": 10}]}
        section = {"id": "r2", "type": "registration", "data": {"ticket_ids": ["academic"], "addon_ids": ["night"], "categories": [{"id": "own"}]}}
        site = {"event": event, "pages": [{"id": "p", "schema_json": [section]}]}
        found, _ = forms.find_form(site, "r2")
        self.assertEqual([c["id"] for c in found["data"]["categories"]], ["academic"], "only ticked types")
        self.assertEqual(forms.quote(found, {"category": "vip"}, date(2027, 1, 1))[1], "Please choose a registration type.")
        order, _ = forms.quote(found, {"category": "academic", "addons": {"night": 1, "dinner": 1}, "discount_code": "all"}, date(2027, 1, 1))
        self.assertEqual((order["currency"], order["total"]), ("EUR", round((699 + 100) * 0.9, 2)), "unticked add-on ignored, all codes when none ticked")
        self.assertIn("expired", forms.quote(found, {"category": "academic", "discount_code": "OLD"}, date(2027, 1, 1))[1])
        self.assertEqual(forms.find_form({"pages": [{"id": "p", "schema_json": [section]}]}, "r2")[0], section, "no event: form keeps its own data")
        self.assertNotIn("discounts", public_site.public_event(event))

    def test_fixed_amount_discount(self):
        data = {**REG["data"], "discount_codes": [{"code": "FIFTY", "amount": 50, "percent": 90}, {"code": "BIG", "amount": 5000}]}
        self.assertEqual(forms.quote({"data": data}, {"category": "academic", "discount_code": "fifty"}, date(2027, 1, 1))[0]["total"], 649)
        self.assertEqual(forms.quote({"data": data}, {"category": "academic", "discount_code": "BIG"}, date(2027, 1, 1))[0]["total"], 0)

    def test_price_follows_the_date(self):
        q = lambda d: forms.quote(REG, {"category": "academic"}, d)[0]["total"]
        self.assertEqual(q(date(2027, 3, 31)), 699)
        self.assertEqual(q(date(2027, 4, 1)), 799)
        self.assertEqual(q(date(2027, 6, 1)), 899)

    def test_addons_discount_and_tampering(self):
        order, _ = forms.quote(REG, {"category": "academic", "addons": {"night": 99, "fake": 5}, "discount_code": "early10", "price": 1}, date(2027, 1, 1))
        self.assertEqual(order["subtotal"], 699 + 190 * 3, "quantity capped at max; unknown add-ons and client prices ignored")
        self.assertEqual(order["discount"], round((699 + 570) * 0.10, 2))
        self.assertEqual(order["currency"], "USD")
        self.assertIn("not valid", forms.quote(REG, {"category": "academic", "discount_code": "FREE"})[1])
        self.assertIn("registration type", forms.quote(REG, {"category": "vip"})[1])


class CredentialSplitTests(unittest.TestCase):
    def test_hashes_leave_the_json_and_come_back(self):
        from stores import merge_secrets, split_secrets
        data = {"_metadata": {"root_password_hash": "R"}, "licenses": {"K": {"password_hash": "A", "members": [
            {"member_id": "m1", "password_hash": "M"}, {"password_hash": "legacy-no-id"}]}}}
        clean, creds = split_secrets(data)
        self.assertNotIn("password_hash", str(clean.get("licenses", {}).get("K", {}).get("members", [{}])[0]))
        self.assertNotIn("root_password_hash", clean["_metadata"])
        self.assertNotIn("password_hash", clean["licenses"]["K"])
        self.assertEqual(clean["licenses"]["K"]["members"][1]["password_hash"], "legacy-no-id", "members without id keep theirs")
        self.assertEqual(creds, {("__root__", ""): "R", ("K", ""): "A", ("K", "m1"): "M"})
        self.assertEqual(merge_secrets(clean, creds), data)
        self.assertEqual(data["licenses"]["K"]["password_hash"], "A", "input not mutated")


class RootEmailTests(unittest.TestCase):
    def test_root_can_use_its_own_email_for_login_and_reset(self):
        import license_manager as lm
        mgr = lm.LicenseManager(Path(__file__).with_name("_root_email_test.json"))
        data = mgr._load_db()
        data["_metadata"]["root_password_hash"] = lm.hash_password("OldRoot123!")
        data["licenses"].setdefault("SCIP-PRO-ROOT-MASTER", {"license_key": "SCIP-PRO-ROOT-MASTER"})["client_email"] = "Me@Example.com"
        mgr._save_db(data)
        ok, user, _ = mgr.authenticate("me@example.com", "OldRoot123!")
        self.assertTrue(ok and user["is_admin"])
        self.assertEqual(user["client_email"], "me@example.com")
        self.assertTrue(mgr.authenticate("admin", "OldRoot123!")[0], "admin handle still works")
        self.assertTrue(mgr.check_password_reset_email("me@example.com")[0])
        self.assertTrue(mgr.reset_password_by_email("me@example.com", "NewRoot123!")[0])
        self.assertTrue(mgr.authenticate("me@example.com", "NewRoot123!")[0])
        self.assertFalse(mgr.check_password_reset_email("root@sciprospect.internal")[0], "internal address still blocked")


class ReceiptTests(unittest.TestCase):
    def test_receipt_number(self):
        self.assertEqual(forms.receipt_number("aiml-2027-", 7), "AIML-2027-0007")
        self.assertEqual(forms.receipt_number("<x>", 12345), "X12345")
        self.assertEqual(forms.receipt_number("", 1), "R-0001")

    def test_receipt_needs_token_and_shows_tax_inside_total(self):
        from contextlib import contextmanager
        from unittest.mock import patch
        stored = {"name": {"label": "Full name", "value": "Ada"}, "email": {"label": "Email", "value": "ada@uni.edu"},
                  "_payment_token": "tok", "_receipt": {"label": "Receipt", "value": "R-0001"}, "_payment_paid_at": "2027-01-02",
                  "_payment_order": {"currency": "USD", "lines": [{"label": "Academic", "amount": 118}], "subtotal": 118, "discount": 0, "total": 118}}

        class Cur:
            def execute(self, *a): pass
            def fetchone(self): return (stored, "paid (test)")

        @contextmanager
        def tx():
            yield Cur()

        site = {"site_id": "site_00000001", "name": "Site", "event": {"basics": {"name": "AI 2027", "tax_id": "GST1"}, "receipts": {"tax_rate": 18, "tax_label": "GST"}}}
        with patch.object(forms.db, "transaction", tx):
            self.assertIsNone(forms.receipt(site, 1, "wrong"))
            r = forms.receipt(site, 1, "tok")
        self.assertEqual((r["number"], r["event"]["name"], r["event"]["tax_id"]), ("R-0001", "AI 2027", "GST1"))
        self.assertEqual(r["tax"], {"label": "GST", "rate": 18.0, "amount": 18.0})
        self.assertEqual([b["value"] for b in r["buyer"]], ["Ada", "ada@uni.edu"], "private fields stay out")
