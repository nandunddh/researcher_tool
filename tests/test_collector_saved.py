"""Saved searches and the collector scheduler (no database: storage calls are faked)."""
import sys
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "backend"), str(ROOT / "backend/collector_sources")]

import collector_saved as saved  # noqa: E402
import collector_routes  # noqa: E402
from psycopg2.errors import UniqueViolation  # noqa: E402


class Licenses:
    def __init__(self, valid=True, limit=None):
        self.info = {"valid": valid, "daily_limit": limit}
        self.usage = []
    def validate_license(self, key):
        return self.info
    def record_usage(self, key, n):
        self.usage.append((key, n))


def due(**over):
    item = {"owner_key": "owner:a@x.org", "license_key": "LIC", "id": "11111111-1111-1111-1111-111111111111", "topic": "protein folding",
            "target": 50, "min_score": 50, "window_days": 30, "country": "DE", "institution": "", "kind": "publications"}
    item.update(over)
    return item


class SavedSearchTests(unittest.TestCase):
    def test_run_window_ends_today(self):
        self.assertEqual(saved.run_window(30, date(2026, 11, 23)), (date(2026, 10, 24), date(2026, 11, 23)))
        self.assertEqual(saved.run_window(0, date(2026, 11, 23)), (date(2026, 11, 23), date(2026, 11, 23)))

    def test_frequency_sql_only_from_known_values(self):
        self.assertEqual(saved._next("daily"), "now() + interval '1 day'")
        self.assertEqual(saved._next("off"), "NULL")
        self.assertEqual(saved._next("x'; DROP TABLE t; --"), "NULL")
        with self.assertRaises(ValueError):
            saved.save("o", name="n", kind="publications", topic="t", target=1, min_score=0, window_days=1, country="",
                       institution="", frequency="hourly", license_key="")

    def run_pass(self, items, licenses, created=None, stats_today=0):
        router = collector_routes.collector_router(lambda request: {}, licenses)
        calls = {"create": [], "record": [], "retry": [], "execute": []}
        def create(*args):
            calls["create"].append(args)
            if created is UniqueViolation:
                raise UniqueViolation()
            return "22222222-2222-2222-2222-222222222222"
        with patch.object(saved, "claim_due", return_value=items), \
             patch.object(saved, "record", side_effect=lambda *a, **k: calls["record"].append((a, k))), \
             patch.object(saved, "retry_soon", side_effect=lambda *a: calls["retry"].append(a)), \
             patch.object(collector_routes.archive, "create", side_effect=create), \
             patch.object(collector_routes.archive, "stats", return_value={"today": stats_today}), \
             patch.object(collector_routes.archive, "execute", side_effect=lambda k, r: calls["execute"].append(r)), \
             patch.object(collector_routes.archive, "history", return_value=[{"id": "22222222-2222-2222-2222-222222222222", "collected": 7}]):
            router.run_due_searches()
        return calls

    def test_due_search_starts_a_run_and_counts_usage(self):
        licenses = Licenses()
        calls = self.run_pass([due()], licenses)
        key, topic, target, score, start, end, country, inst, kind = calls["create"][0]
        self.assertEqual((key, topic, target, country, kind), ("owner:a@x.org", "protein folding", 50, "DE", "publications"))
        self.assertEqual((end - start).days, 30)
        self.assertEqual(calls["execute"], ["22222222-2222-2222-2222-222222222222"])
        self.assertEqual(licenses.usage, [("LIC", 7)])

    def test_scheduled_target_is_clamped_to_what_is_left_today(self):
        calls = self.run_pass([due(target=50)], Licenses(limit=100), stats_today=80)
        self.assertEqual(calls["create"][0][2], 20)

    def test_limit_reached_or_expired_license_records_the_reason(self):
        calls = self.run_pass([due()], Licenses(limit=100), stats_today=100)
        self.assertEqual(calls["create"], [])
        self.assertIn("limit", calls["record"][0][1]["error"])
        calls = self.run_pass([due()], Licenses(valid=False))
        self.assertIn("license", calls["record"][0][1]["error"])

    def test_busy_workspace_retries_soon(self):
        calls = self.run_pass([due()], Licenses(), created=UniqueViolation)
        self.assertEqual(len(calls["retry"]), 1)
        self.assertIn("already running", calls["record"][0][1]["error"])


if __name__ == "__main__":
    unittest.main()
