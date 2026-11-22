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
