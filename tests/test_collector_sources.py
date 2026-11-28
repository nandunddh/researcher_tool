"""Choosing which publication sources a collection searches (OpenAlex, PubMed, bioRxiv)."""
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "backend"), str(ROOT / "backend/collector_sources"), str(ROOT / "tests")]

import collector_archive as archive  # noqa: E402
import collector_routes  # noqa: E402
from test_collector_team import OWNER, START, call  # noqa: E402


class ChosenSourcesTests(unittest.TestCase):
    def test_usual_order_no_duplicates_empty_means_all(self):
        self.assertEqual(archive.chosen_sources(["bioRxiv", "OpenAlex", "bioRxiv"]), ["OpenAlex", "bioRxiv"])
        self.assertEqual(archive.chosen_sources([]), [])
        self.assertEqual(archive.chosen_sources(None), [])
        self.assertEqual(archive.SOURCE_NAMES, ("OpenAlex", "PubMed", "bioRxiv"))


class StartWithSourcesTests(unittest.TestCase):
    def start(self, body):
        with patch.object(collector_routes.archive, "stats", return_value={"total": 0, "today": 0, "datasets": 0}), \
             patch.object(collector_routes.archive, "create", return_value="run-1") as create, \
             patch.object(collector_routes.archive, "execute"), patch.object(collector_routes.archive, "history", return_value=[]):
            status, out = call(OWNER, "POST", "/api/collector/runs", {**START, **body})
        return status, out, create

    def test_the_chosen_sources_are_stored_with_the_run(self):
        status, _, create = self.start({"sources": ["PubMed", "OpenAlex"]})
        self.assertEqual(status, 202)
        self.assertEqual(create.call_args.kwargs["sources"], ["OpenAlex", "PubMed"])

    def test_no_choice_means_all_and_nih_ignores_the_choice(self):
        self.assertEqual(self.start({})[2].call_args.kwargs["sources"], [])
        self.assertEqual(self.start({"kind": "nih", "sources": ["PubMed"]})[2].call_args.kwargs["sources"], [])

    def test_unknown_sources_are_refused(self):
        status, _, create = self.start({"sources": ["Google"]})
        self.assertEqual(status, 422)
        create.assert_not_called()

    def test_country_needs_openalex(self):
        status, out, create = self.start({"sources": ["PubMed"], "country": "IN"})
        self.assertEqual(status, 400)
        self.assertIn("OpenAlex", out["detail"])
        create.assert_not_called()
        self.assertEqual(self.start({"sources": ["OpenAlex", "PubMed"], "country": "IN"})[0], 202)


class ExecuteChosenSourcesTests(unittest.TestCase):
    """execute() searches only the sources stored on the run, in the usual order."""

    def test_only_the_chosen_sources_run(self):
        ran = []

        class Cursor:
            def __init__(self):
                self.row = None

            def execute(self, sql, params=None):
                if sql.startswith("SELECT kind, sources"):
                    self.row = ("publications", ["bioRxiv", "OpenAlex"])
                elif "SET source=" in sql:
                    ran.append(params[0])
                    self.row = ("cells", 10, 50, "2026-01-01", "2026-01-31", "", "")
                else:
                    self.row = None

            def fetchone(self):
                return self.row

        class Tx:
            def __enter__(self):
                return Cursor()

            def __exit__(self, *exc):
                return False

        class Beat:
            def __enter__(self):
                return self

            def __exit__(self, *exc):
                return False

        with patch.object(archive.db, "transaction", lambda: Tx()), patch.object(archive.Archive, "heartbeat", lambda self: Beat()):
            archive.execute("owner:x", "run-1", loader=lambda filename: (lambda **kwargs: None))
        self.assertEqual(ran, ["OpenAlex", "bioRxiv"])


if __name__ == "__main__":
    unittest.main()
