"""Team members share the organisation's collector workspace; the daily limit is per user; viewers cannot change anything."""
import asyncio
import json
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import FastAPI, HTTPException

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "backend"), str(ROOT / "backend/collector_sources")]
import collector_routes  # noqa: E402

PARENT = "SCIP-ORG-1"
ACCOUNTS = {PARENT: {"client_email": "Owner@Lab.org"}}
LICENSES = SimpleNamespace(get_account=lambda key: ACCOUNTS.get(key),
                           validate_license=lambda key: {"valid": True, "daily_limit": 100}, record_usage=lambda *a: None)
OWNER = {"client_email": "owner@lab.org", "license_key": PARENT, "is_member": False}
EDITOR = {"client_email": "ed@lab.org", "is_member": True, "member_id": "mem-1", "role": "editor", "parent_license_key": PARENT, "license_key": PARENT}
VIEWER = {**EDITOR, "member_id": "mem-2", "role": "viewer"}


def call(user, method, path, body=None):
    def auth(request):
        return json.loads(request.headers["X-Test-User"])
    app = FastAPI()
    app.include_router(collector_routes.collector_router(auth, LICENSES))
    messages = []

    async def run():
        async def receive():
            return {"type": "http.request", "body": json.dumps(body or {}).encode()}
        async def send(message):
            messages.append(message)
        scope = {"type": "http", "method": method, "path": path, "query_string": b"", "headers": [
            (b"x-test-user", json.dumps(user).encode()), (b"content-type", b"application/json")]}
        await app(scope, receive, send)
    asyncio.run(run())
    return messages[0]["status"], json.loads(messages[-1]["body"] or b"null") if messages[-1].get("body") else None


START = {"topic": "cells", "target": 10, "from_date": "2026-01-01", "to_date": "2026-01-31"}


class TeamCollectorTests(unittest.TestCase):
    def test_member_shares_the_owners_workspace(self):
        get = LICENSES.get_account
        self.assertEqual(collector_routes.collector_owner_key(EDITOR, get), "owner:owner@lab.org")
        self.assertEqual(collector_routes.collector_owner_key(OWNER, get), "owner:owner@lab.org")

    def test_member_without_a_known_organisation_is_refused(self):
        for user in (EDITOR, {**EDITOR, "parent_license_key": "NOPE"}):
            with self.assertRaises(HTTPException) as ctx:
                collector_routes.collector_owner_key(user, lambda key: None)
            self.assertEqual(ctx.exception.status_code, 403)
        with self.assertRaises(HTTPException):
            collector_routes.collector_owner_key(EDITOR)  # no way to look the owner up

    def test_viewer_can_look_but_not_change(self):
        with patch.object(collector_routes.archive, "history", return_value=[]) as history, \
             patch.object(collector_routes.archive, "create") as create:
            self.assertEqual(call(VIEWER, "GET", "/api/collector/runs")[0], 200)
            history.assert_called_once_with("owner:owner@lab.org")
            for method, path, body in (("POST", "/api/collector/runs", START), ("POST", "/api/collector/contacts/check", {}),
                                       ("DELETE", "/api/collector/runs/00000000-0000-0000-0000-000000000001", None)):
                self.assertEqual(call(VIEWER, method, path, body)[0], 403, path)
            create.assert_not_called()

    def test_each_user_has_their_own_daily_limit(self):
        seen = []

        def stats(owner, started_by=None):
            seen.append((owner, started_by))
            return {"total": 0, "today": {"": 100, "mem-1": 40}[started_by], "datasets": 0}

        with patch.object(collector_routes.archive, "stats", side_effect=stats), \
             patch.object(collector_routes.archive, "create", return_value="run-1") as create, \
             patch.object(collector_routes.archive, "execute"), patch.object(collector_routes.archive, "history", return_value=[]):
            self.assertEqual(call(OWNER, "POST", "/api/collector/runs", START)[0], 429)   # the owner used all 100
            self.assertEqual(call(EDITOR, "POST", "/api/collector/runs", START)[0], 202)  # the member has 60 left
        self.assertEqual(seen, [("owner:owner@lab.org", ""), ("owner:owner@lab.org", "mem-1")])
        self.assertEqual(create.call_args.args[-1], "mem-1")  # the run remembers who started it
        self.assertEqual(create.call_args.args[0], "owner:owner@lab.org")

    def test_stats_show_the_callers_own_numbers(self):
        with patch.object(collector_routes.archive, "stats", return_value={"total": 5, "today": 30, "datasets": 1}) as stats:
            status, body = call(EDITOR, "GET", "/api/collector/stats")
        stats.assert_called_once_with("owner:owner@lab.org", "mem-1")
        self.assertEqual((status, body["remaining_today"]), (200, 70))


if __name__ == "__main__":
    unittest.main()
