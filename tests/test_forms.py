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
    "currency": "usd", "early_bird_ends": "2027-03-31", "standard_ends": "2027-05-31",
    "categories": [{"id": "academic", "name": "Academic", "early": 699, "standard": 799, "late": 899}],
    "addons": [{"id": "night", "name": "Night", "price": 190, "max": 3}],
    "discount_codes": [{"code": "EARLY10", "percent": 10}],
}}


class RegistrationPricingTests(unittest.TestCase):
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
