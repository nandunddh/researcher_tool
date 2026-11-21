import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from public_site import FormRateLimit, published_page


class PublicSiteTests(unittest.TestCase):
    def setUp(self):
        self.site = {"site_id": "s", "slug": "science", "name": "Science", "status": "published",
                     "user_email": "private", "compiled_html": "private", "active_page_id": "sessions",
                     "meta_config": {"custom_head_code": "private", "meta_title": "Science conference"},
                     "pages": [{"id": "home", "name": "Home", "slug": "/", "is_home": True, "schema_json": []},
                               {"id": "sessions", "name": "Sessions", "slug": "/sessions", "schema_json": [
                                   {"id": "reg", "type": "registration", "data": {"title": "Register",
                                    "discount_codes": ["private"], "nested": [{"_payment_token": "private"}]}}]}]}

    def test_only_published_and_known_pages(self):
        self.assertIsNone(published_page(None))
        self.assertIsNone(published_page({**self.site, "status": "draft"}))
        self.assertIsNone(published_page(self.site, "missing"))
        self.assertEqual(published_page(self.site)["schema_json"], [])
        page = published_page(self.site, "sessions")
        self.assertEqual(page["schema_json"][0]["data"]["title"], "Register")
        self.assertNotIn("private", json.dumps(page))
        self.assertNotIn("schema_json", page["pages"][1])
        self.assertEqual(page["meta_config"], {"meta_title": "Science conference"})
        self.assertIn("discount_codes", self.site["pages"][1]["schema_json"][0]["data"])

    def test_legacy_single_page(self):
        site = {**self.site, "pages": [], "schema_json": [{"id": "intro"}]}
        self.assertEqual(published_page(site)["schema_json"], site["schema_json"])
        self.assertIsNone(published_page(site, "unknown"))

    def test_rate_limit_scopes_and_expires(self):
        limiter = FormRateLimit(limit=1)
        with patch("public_site.monotonic", side_effect=[0, 1, 2, 60]):
            self.assertTrue(limiter.allow("a"))
            self.assertFalse(limiter.allow("a"))
            self.assertTrue(limiter.allow("b"))
            self.assertTrue(limiter.allow("a"))
