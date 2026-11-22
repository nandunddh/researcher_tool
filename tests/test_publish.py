import asyncio
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT_DIR / "backend"))

import app as web_app
import public_site


class _Engine:
    def __init__(self):
        self.sites = {"site_00000001": {"site_id": "site_00000001", "slug": "s", "status": "published", "pages": [{"id": "p", "is_home": True, "schema_json": []}]}}

    def update_site(self, site_id, payload):
        self.sites[site_id].update(payload)
        return True, "", self.sites[site_id]


class PublishTests(unittest.TestCase):
    def test_unpublish_takes_the_site_offline(self):
        engine = _Engine()
        with patch.object(web_app, "builder_engine", engine), patch.object(web_app, "_require_authenticated_user", lambda r: {"email": "o"}), \
                patch.object(web_app, "_require_scistudio_access", lambda u: None), patch.object(web_app, "_require_owned_site", lambda s, u: None):
            self.assertIsNotNone(public_site.published_page(engine.sites["site_00000001"]))
            asyncio.run(web_app.builder_unpublish_site("site_00000001", object()))
            self.assertEqual(engine.sites["site_00000001"]["status"], "draft")
            self.assertIsNone(public_site.published_page(engine.sites["site_00000001"]), "visitors get the not-available page")
            asyncio.run(web_app.builder_publish_site("site_00000001", object()))
            self.assertIsNotNone(public_site.published_page(engine.sites["site_00000001"]))


if __name__ == "__main__":
    unittest.main()


class SubmitLimitTests(unittest.TestCase):
    def test_ten_forms_per_ten_minutes_per_visitor(self):
        from types import SimpleNamespace
        from fastapi import HTTPException
        req = SimpleNamespace(client=SimpleNamespace(host="203.0.113.9"), headers={})
        with patch.object(web_app, "_submit_rate_limit", public_site.FormRateLimit(limit=2, seconds=600)), \
                patch.object(web_app, "_form_rate_limit", public_site.FormRateLimit(limit=100, seconds=60)):
            for _ in range(2):  # allowed: then the bad site id gives 404
                with self.assertRaises(HTTPException) as err:
                    asyncio.run(web_app.submit_website_form("bad", "form", req))
                self.assertEqual(err.exception.status_code, 404)
            with self.assertRaises(HTTPException) as err:
                asyncio.run(web_app.submit_website_form("bad", "form", req))
            self.assertEqual(err.exception.status_code, 429)
