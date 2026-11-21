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
