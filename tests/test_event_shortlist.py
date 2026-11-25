"""Invited-speakers shortlist routes: validation, ownership, privacy (no database: storage is stubbed)."""
import asyncio
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "backend"), str(ROOT / "backend/collector_sources")]

import app as backend  # noqa: E402
import collector_routes  # noqa: E402
import public_site  # noqa: E402

SITE = "site_0a1b2c3d"
OWNER = {"client_email": "org@example.org", "is_member": False, "is_admin": False}


class Req:
    def __init__(self, body):
        self._body = body
    async def json(self):
        return self._body


def call(fn, *args, user=OWNER, owned=True, **kw):
    """Runs a route with the login and ownership checks stubbed."""
    def need(site_id, u, need="view"):
        if not owned:
            raise HTTPException(404, "Website not found.")
        return {}
    with patch.object(backend, "_require_authenticated_user", return_value=user), \
         patch.object(backend, "_require_scistudio_access"), patch.object(backend, "_require_owned_site", side_effect=need):
        return asyncio.run(fn(*args, **kw))


class ShortlistRouteTests(unittest.TestCase):
    def test_adds_only_the_callers_own_contacts_and_reports_counts(self):
        seen = {}
        def lookup(key, emails):
            seen["key"] = key
            return [{"professional_email": "a@x.edu", "researcher_name": "Ana"}, {"professional_email": "b@x.edu", "researcher_name": "Bo"}]
        with patch.object(backend.collector_archive, "contacts_by_email", side_effect=lookup), \
             patch.object(backend.event_shortlist, "add", return_value=1) as add:
            out = call(backend.builder_shortlist_add, SITE, Req({"emails": ["A@x.edu", "b@x.edu", "ghost@x.edu"]}))
        self.assertEqual(seen["key"], "owner:org@example.org")  # archive of the signed-in workspace only
        self.assertEqual(out, {"added": 1, "already_listed": 1, "not_found": 1})
        self.assertEqual(add.call_args.args[0], SITE)

    def test_rejects_bad_bodies_members_and_other_peoples_sites(self):
        for body in ({}, {"emails": []}, {"emails": "a@x.edu"}, {"emails": [1]}, {"emails": ["a@x.edu"] * 201}):
            with self.assertRaises(HTTPException) as ctx:
                call(backend.builder_shortlist_add, SITE, Req(body))
            self.assertEqual(ctx.exception.status_code, 400)
        with self.assertRaises(HTTPException) as ctx:  # a member whose organisation can't be found has no archive
            call(backend.builder_shortlist_add, SITE, Req({"emails": ["a@x.edu"]}), user={**OWNER, "is_member": True})
        self.assertEqual(ctx.exception.status_code, 403)
        with self.assertRaises(HTTPException) as ctx:  # someone else's website
            call(backend.builder_shortlist_add, SITE, Req({"emails": ["a@x.edu"]}), owned=False)
        self.assertEqual(ctx.exception.status_code, 404)

    def test_list_and_remove(self):
        with patch.object(backend.event_shortlist, "listing", return_value=[{"email": "a@x.edu"}]):
            self.assertEqual(call(backend.builder_shortlist, SITE, SimpleNamespace()), {"invited": [{"email": "a@x.edu"}]})
        with patch.object(backend.event_shortlist, "remove", return_value=False):
            with self.assertRaises(HTTPException) as ctx:
                call(backend.builder_shortlist_remove, SITE, "a@x.edu", SimpleNamespace())
            self.assertEqual(ctx.exception.status_code, 404)
        with patch.object(backend.event_shortlist, "remove", return_value=True) as remove:
            call(backend.builder_shortlist_remove, SITE, "a@x.edu", SimpleNamespace())
        remove.assert_called_once_with(SITE, "a@x.edu")

    def test_shortlist_never_reaches_visitors(self):
        # It lives in its own table, not in the event, and the public event only exposes a fixed list of keys.
        event = {"basics": {"name": "Summit"}, "speakers": [{"name": "Confirmed"}], "invited": [{"email": "secret@x.edu"}]}
        self.assertNotIn("secret@x.edu", str(public_site.public_event(event)))
        self.assertNotIn("event_shortlist", Path(public_site.__file__).read_text(encoding="utf-8"))

    def test_owner_key_rules_are_shared_with_the_collector(self):
        self.assertEqual(collector_routes.collector_owner_key({"client_email": " Org@Example.org "}), "owner:org@example.org")
        self.assertEqual(collector_routes.collector_owner_key({"is_admin": True, "client_email": ""}), "admin:root")
        with self.assertRaises(HTTPException):
            collector_routes.collector_owner_key({"client_email": ""})


if __name__ == "__main__":
    unittest.main()
