"""Newsletter sign-up: email and consent are required, duplicates are not stored twice, and the answer never reveals who signed up."""
import asyncio
import re
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

import app as web_app  # noqa: E402
import forms  # noqa: E402

SECTION = {"id": "news_1", "type": "newsletter", "data": {"success_message": "You are on the list."}}
SITE = {"site_id": "site_0000000a", "user_email": "owner@lab.org", "schema_json": [SECTION]}


class _Req:
    def __init__(self, payload):
        self._payload, self.headers, self.client = payload, {}, None

    async def json(self):
        return self._payload


class NewsletterRulesTests(unittest.TestCase):
    def test_it_is_a_form_with_email_and_consent(self):
        self.assertIn("newsletter", forms.FORM_TYPES)
        self.assertEqual(forms.find_form(SITE, "news_1")[0]["type"], "newsletter")
        self.assertEqual([(f["id"], f["type"], f["required"]) for f in forms.form_fields(SECTION)], [("email", "email", True), ("consent", "checkbox", True)])
        values, problem = forms.clean_submission(SECTION, {"email": "Ada@Lab.org", "consent": True})
        self.assertIsNone(problem)
        self.assertEqual(forms.first_email(values), "ada@lab.org")
        for payload, fragment in (({"email": "ada@lab.org"}, "tick"), ({"email": "", "consent": True}, "fill in"), ({"email": "nope", "consent": True}, "valid email")):
            self.assertIn(fragment, forms.clean_submission(SECTION, payload)[1])

    def test_frontend_defaults_match_the_backend(self):
        source = (ROOT / "frontend/src/features/studio/section-blocks.tsx").read_text(encoding="utf-8")
        block = source[source.index("export const defaultNewsletterFields"):]
        block = block[:block.index("];")]
        for field in forms.DEFAULT_NEWSLETTER_FIELDS:
            self.assertIn(f'id: "{field["id"]}"', block)
            self.assertIn(f'label: "{field["label"]}"', block)
        self.assertEqual(forms.first_email({}), "")
        self.assertEqual(forms.first_email({"x": {"value": "not-an-email"}, "y": "bad"}), "")


class NewsletterRouteTests(unittest.TestCase):
    def submit(self, already):
        saved = []
        with patch.object(web_app, "builder_engine", SimpleNamespace(get_site=lambda site_id: SITE)), \
             patch.object(forms, "already_signed_up", return_value=already) as check, \
             patch.object(forms, "save_submission", side_effect=lambda *a: saved.append(a)), \
             patch.object(web_app, "_plan_of_account", return_value=None), \
             patch.object(web_app, "license_engine", SimpleNamespace(account_for_email=lambda email: None)),              patch.object(web_app, "_limit_form_requests", lambda request: None),              patch.object(web_app._submit_rate_limit, "allow", return_value=True):
            result = asyncio.run(web_app.submit_website_form("site_0000000a", "news_1", _Req({"email": "Ada@Lab.org", "consent": True})))
        return result, saved, check

    def test_new_and_repeated_sign_ups_get_the_same_answer(self):
        first, saved, check = self.submit(already=False)
        self.assertEqual(first, {"status": "ok", "message": "You are on the list."})
        self.assertEqual(len(saved), 1)
        self.assertEqual(saved[0][2], "newsletter")
        check.assert_called_once_with("site_0000000a", "news_1", "ada@lab.org")
        again, saved_again, _ = self.submit(already=True)
        self.assertEqual(again, first, "the answer does not reveal that the email is already on the list")
        self.assertEqual(saved_again, [], "not stored twice")


if __name__ == "__main__":
    unittest.main()
