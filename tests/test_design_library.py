import asyncio
import json
import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

ROOT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT_DIR / "backend"))

import app as web_app
import design_library as lib

SECTION = {"format": "scistudio-design", "kind": "section", "name": "Speaker spotlight", "category": "Speakers", "level": "pro",
           "section": {"type": "content", "title": "Speaker spotlight", "data": {"columns": 2, "gap": 16, "nodes": [
               {"kind": "heading", "text": "Keynote", "size": 40, "span": 2, "padding": 24, "radius": 16, "color": "#111111", "background": "#ffffff", "align": "left"}]}}}


class _Req:
    def __init__(self, payload):
        self._payload = payload

    async def json(self):
        return self._payload


class ValidateTests(unittest.TestCase):
    def test_good_section_and_template(self):
        clean = lib.validate(SECTION)
        self.assertEqual(clean["section"]["type"], "content")
        tpl = lib.validate({"format": "scistudio-design", "kind": "template", "name": "Night", "theme": {"mode": "dark", "primary_color": "#123456", "bg_color": "red"},
                            "sections": [SECTION["section"], {"type": "faq", "data": {"faqs": []}}]})
        self.assertEqual(tpl["theme"], {"primary_color": "#123456", "mode": "dark"}, "bad colors dropped")
        self.assertEqual(len(tpl["pages"][0]["sections"]), 2, "one-page 'sections' becomes a Home page")

    def test_multi_page_template(self):
        tpl = lib.validate({"format": "scistudio-design", "kind": "template", "name": "Summit", "pages": [
            {"name": "Home", "slug": "ignored", "sections": [{"type": "navbar", "data": {"links": [{"label": "Program", "url": "page:program"}, {"label": "Old", "url": "page:gone"}]}}]},
            {"name": "Program", "sections": [SECTION["section"]]},
            {"name": "Program", "sections": [SECTION["section"]]}]})
        self.assertEqual([p["slug"] for p in tpl["pages"]], ["", "program", "program-2"], "home has no slug; duplicates get a suffix")
        links = lib._resolve_links(tpl["pages"][0]["sections"][0]["data"]["links"], "my-site-ab12", {"", "program"})
        self.assertEqual([l["url"] for l in links], ["/sites/my-site-ab12/program", "#"])
        self.assertEqual(lib._resolve_links("page:", "s", {""}), "/sites/s")
        with self.assertRaises(ValueError):
            lib.validate({"format": "scistudio-design", "kind": "template", "name": "X", "pages": [{"name": "Empty", "sections": []}]})

    def test_rejections(self):
        def bad(change, fragment):
            pack = json.loads(json.dumps(SECTION))
            change(pack)
            with self.assertRaises(ValueError) as err:
                lib.validate(pack)
            self.assertIn(fragment, str(err.exception))
        bad(lambda p: p.update(format="other"), "not a SciStudio design")
        bad(lambda p: p["section"].update(type="custom"), "unknown type")
        bad(lambda p: p["section"]["data"]["nodes"][0].update(text="<script>alert(1)</script>"), "Scripts")
        bad(lambda p: p["section"]["data"]["nodes"][0].update(url="JavaScript:alert(1)"), "Scripts")
        bad(lambda p: p["section"]["data"].update(_payment={"x": 1}), "Private field")
        bad(lambda p: p.update(name=""), "needs a name")
        bad(lambda p: p.update(kind="page"), "\"kind\"")
        bad(lambda p: p["section"]["data"].update(blob="x" * 210_000), "too large")

    def test_fresh_ids(self):
        a, b = lib.fresh_ids(lib.validate(SECTION)["section"]), lib.fresh_ids(lib.validate(SECTION)["section"])
        self.assertNotEqual(a["id"], b["id"])
        self.assertNotEqual(a["data"]["nodes"][0]["id"], b["data"]["nodes"][0]["id"])


class ImportEndpointTests(unittest.TestCase):
    def run_import(self, user, body):
        saved = []
        fake = SimpleNamespace(validate=lib.validate, save=lambda d, by: saved.append(d) or {"id": "x", **d})
        with patch.object(web_app, "_require_authenticated_user", lambda request: user), patch.dict(sys.modules, {"design_library": fake}):
            return asyncio.run(web_app.library_import(_Req(body))), saved

    def test_only_root_can_import(self):
        with self.assertRaises(HTTPException) as err:
            self.run_import({"is_admin": False}, SECTION)
        self.assertEqual(err.exception.status_code, 403)

    def test_all_or_nothing(self):
        with self.assertRaises(HTTPException) as err:
            self.run_import({"is_admin": True}, [SECTION, {**SECTION, "format": "x"}])
        self.assertIn("Design 2", err.exception.detail)
        result, saved = self.run_import({"is_admin": True}, [SECTION, SECTION])
        self.assertEqual(len(result["items"]), 2)


@unittest.skipUnless(os.environ.get("SCIPROSPECT_DB_SCHEMA", "").startswith("test_"), "Database test: set SCIPROSPECT_DB_SCHEMA=test_<name> (never the live data).")
class LibraryDbTests(unittest.TestCase):
    def test_template_round_trip(self):
        tpl = lib.save(lib.validate({"format": "scistudio-design", "kind": "template", "name": "T", "sections": [SECTION["section"]]}), "t")
        try:
            self.assertIn("lib-" + tpl["id"], [t["id"] for t in lib.templates_for_gallery()])
            pages, _ = lib.template_site("lib-" + tpl["id"], "site-x")
            self.assertTrue(pages[0]["is_home"])
            components, theme = lib.template_components("lib-" + tpl["id"])
            self.assertTrue(components[0]["id"].startswith("comp_"))
            self.assertEqual(theme["mode"], "light")
        finally:
            lib.delete(tpl["id"])


if __name__ == "__main__":
    unittest.main()
