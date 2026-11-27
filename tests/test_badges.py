"""Name badges: the registration type for each badge, and QR codes that carry only a badge code."""
import asyncio
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

import app as web_app  # noqa: E402
import forms  # noqa: E402

SITE = "site_0000000a"


class _Req:
    def __init__(self, payload):
        self._payload, self.headers = payload, {}

    async def json(self):
        return self._payload


class TicketNameTests(unittest.TestCase):
    def test_new_registrations_store_the_type_and_older_ones_fall_back_to_the_line(self):
        self.assertEqual(forms.ticket_name({"_payment_order": {"category_name": "Academic", "lines": [{"label": "Academic (Early bird)"}]}}), "Academic")
        self.assertEqual(forms.ticket_name({"_payment_order": {"lines": [{"label": "Student (Late / onsite)"}]}}), "Student")
        self.assertEqual(forms.ticket_name({"_payment_order": {"lines": [{"label": "Virtual"}]}}), "Virtual")
        for broken in ({}, {"_payment_order": "x"}, {"_payment_order": {"lines": "x"}}, {"_payment_order": {"lines": [None]}}):
            self.assertEqual(forms.ticket_name(broken), "")

    def test_quotes_now_name_the_registration_type(self):
        section = {"type": "registration", "data": {"currency": "EUR", "periods": [{"id": "std", "name": "Standard", "ends": ""}],
                                                     "categories": [{"id": "academic", "name": "Academic", "prices": {"std": 100}}]}}
        order, problem = forms.quote(section, {"category": "academic"})
        self.assertIsNone(problem)
        self.assertEqual((order["category"], order["category_name"]), ("academic", "Academic"))


class BadgeQrRouteTests(unittest.TestCase):
    def call(self, body, need_seen=None):
        def owned(site_id, user, need="view"):
            if need_seen is not None:
                need_seen.append(need)
            return {}
        with patch.multiple(web_app, _require_authenticated_user=lambda request: {}, _require_scistudio_access=lambda user: None, _require_owned_site=owned):
            return asyncio.run(web_app.builder_badge_qr(SITE, _Req(body)))

    def test_each_code_gets_a_qr_that_holds_only_the_site_and_code(self):
        seen, needs = [], []
        with patch("mfa.qr_svg", side_effect=lambda text: seen.append(text) or f"data:image/svg+xml,{len(seen)}"):
            out = self.call({"codes": ["R7", "S-spk_1", "R7"]}, needs)
        self.assertEqual(list(out["qr"]), ["R7", "S-spk_1"], "duplicates are made once")
        self.assertEqual(seen, [f"SCIP:{SITE}:R7", f"SCIP:{SITE}:S-spk_1"])
        self.assertEqual(needs, ["edit"])

    def test_bad_requests_are_refused(self):
        for body in ({}, {"codes": []}, {"codes": "R7"}, {"codes": ["has space"]}, {"codes": ["x" * 41]}, {"codes": [7]}, {"codes": ["a"] * 2001}, []):
            with self.assertRaises(HTTPException) as ctx:
                self.call(body)
            self.assertEqual(ctx.exception.status_code, 400)

    def test_the_real_qr_is_an_svg_image(self):
        import mfa
        self.assertTrue(mfa.qr_svg(f"SCIP:{SITE}:R7").startswith("data:image/svg+xml"))


class BadgeDesignSavingTests(unittest.TestCase):
    """Two tabs (the website editor and the badge page) save Event details; neither may undo the other's work."""
    def setUp(self):
        self.store = {"site_id": SITE, "event": {"basics": {"name": "QH"}, "tickets": [{"id": "a"}], "badge_design": {"template": "night"}}}

    def engine(self):
        def update(site_id, payload):
            self.store = {**self.store, **payload}
            return True, "ok", self.store
        return SimpleNamespace(get_site=lambda site_id: self.store, update_site=update)

    def patches(self):
        return patch.multiple(web_app, builder_engine=self.engine(), _require_authenticated_user=lambda request: {}, _require_scistudio_access=lambda user: None,
                              _require_owned_site=lambda site_id, user, need="view": self.store, _user_plan=lambda user: None)

    def test_an_old_editor_tab_cannot_put_back_an_old_badge_design(self):
        stale = {"basics": {"name": "QH renamed"}, "tickets": [{"id": "a"}, {"id": "b"}], "badge_design": {"template": "classic"}}
        with self.patches():
            asyncio.run(web_app.builder_update_site(SITE, _Req({"event": stale})))
        self.assertEqual(self.store["event"]["badge_design"], {"template": "night"}, "the badge design is kept")
        self.assertEqual(self.store["event"]["basics"]["name"], "QH renamed", "the editor's own changes are saved")
        self.assertEqual(len(self.store["event"]["tickets"]), 2)

    def test_editor_saves_without_a_design_keep_it_and_sites_without_one_stay_without(self):
        with self.patches():
            asyncio.run(web_app.builder_update_site(SITE, _Req({"event": {"basics": {}}})))
        self.assertEqual(self.store["event"]["badge_design"], {"template": "night"})
        self.store["event"] = {"basics": {}}
        with self.patches():
            asyncio.run(web_app.builder_update_site(SITE, _Req({"event": {"basics": {}, "badge_design": {"template": "x"}}})))
        self.assertNotIn("badge_design", self.store["event"], "only the badge page sets a design")

    def test_the_badge_page_saves_only_the_design_into_the_latest_event(self):
        self.store["event"]["tickets"] = [{"id": "a"}, {"id": "new-from-editor"}]
        with self.patches():
            out = asyncio.run(web_app.builder_badge_design(SITE, _Req({"design": {"template": "elegant"}})))
        self.assertEqual(out, {"status": "ok"})
        self.assertEqual(self.store["event"]["badge_design"], {"template": "elegant"})
        self.assertEqual(self.store["event"]["tickets"][-1]["id"], "new-from-editor", "Event details edited elsewhere are untouched")

    def test_bad_designs_are_refused(self):
        for body in ({}, {"design": "x"}, {"design": [1]}, {"design": {"t": "x" * 60_000}}, []):
            with self.patches(), self.assertRaises(HTTPException) as ctx:
                asyncio.run(web_app.builder_badge_design(SITE, _Req(body)))
            self.assertEqual(ctx.exception.status_code, 400)


if __name__ == "__main__":
    unittest.main()
