"""Template gallery previews: built-in templates never touch the database; an imported one is a single lookup by id."""
import asyncio
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

import app as web_app  # noqa: E402
import design_library  # noqa: E402


def preview(template_id):
    return asyncio.run(web_app.builder_template_document(template_id))


class TemplatePreviewTests(unittest.TestCase):
    def test_built_in_templates_need_no_database(self):
        with patch.object(design_library, "list_items", side_effect=AssertionError("no full list")), \
             patch.object(design_library, "_load_template", side_effect=AssertionError("no database")):
            doc = preview("summit")
            self.assertEqual(doc["name"], "Summit")
            self.assertTrue(doc["schema_json"])
            self.assertEqual(preview("blank")["schema_json"], [])
            with self.assertRaises(HTTPException) as ctx:
                preview("does-not-exist")
            self.assertEqual(ctx.exception.status_code, 404)

    def test_an_imported_template_is_one_lookup(self):
        design = {"name": "Frontier Systems", "theme": {"mode": "dark"},
                  "pages": [{"name": "Home", "slug": "", "sections": [{"id": "s1", "type": "hero", "data": {"title": "Hi"}}]}]}
        with patch.object(design_library, "list_items", side_effect=AssertionError("no full list")), \
             patch.object(design_library, "_load_template", return_value=design) as load:
            doc = preview("lib-abc123")
        load.assert_called_once_with("lib-abc123")
        self.assertEqual((doc["name"], doc["theme_config"], len(doc["schema_json"])), ("Frontier Systems", {"mode": "dark"}, 1))
        self.assertEqual(doc["schema_json"][0]["type"], "hero")

    def test_a_missing_imported_template_is_404(self):
        with patch.object(design_library, "_load_template", return_value=None):
            with self.assertRaises(HTTPException) as ctx:
                preview("lib-gone")
        self.assertEqual(ctx.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
