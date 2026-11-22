"""Country and institution filters for the web collector (no network, no database)."""
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "backend"), str(ROOT / "backend/collector_sources")]

import collector_archive  # noqa: E402
from collect_all import load_source  # noqa: E402
from collector_routes import CollectionRequest  # noqa: E402
from pydantic import ValidationError  # noqa: E402

import types  # noqa: E402
openalex = types.SimpleNamespace(**load_source("03_unified_lead_pipeline.py").__globals__)  # names only, for work_filter


def work(country):
    return {"title": "Protein folding dynamics", "publication_year": 2025, "doi": "https://doi.org/10.1/x",
            "authorships": [{"author": {"display_name": "Jane Doe"}, "is_corresponding": True,
                             "institutions": [{"display_name": "Max Planck Institute", "country_code": country}],
                             "raw_affiliation_strings": []}]}


class CollectorFilterTests(unittest.TestCase):
    def test_openalex_work_filter(self):
        self.assertEqual(openalex.work_filter("2025-01-01", "2025-12-31"),
                         "from_publication_date:2025-01-01,to_publication_date:2025-12-31")
        self.assertEqual(openalex.work_filter("2025-01-01", "2025-12-31", "de", "Max Planck, Berlin: |x"),
                         "from_publication_date:2025-01-01,to_publication_date:2025-12-31,"
                         "authorships.institutions.country_code:DE,raw_affiliation_strings.search:Max Planck Berlin x")

    def test_country_keeps_only_authors_from_that_country(self):
        module = load_source("03_unified_lead_pipeline.py").__globals__
        with patch.dict(module, fetch_emails_for_doi=lambda doi: ["jane.doe@mpg.de"], fetch_email_from_orcid=lambda url: ""):
            process = module["process_single_work"]
            self.assertTrue(process(work("DE"), "protein folding", 0, set(), "DE"))
            self.assertEqual(process(work("FR"), "protein folding", 0, set(), "DE"), [])
            self.assertTrue(process(work("FR"), "protein folding", 0, set()))

    def test_institution_mismatch_is_skipped_before_saving(self):
        archive = collector_archive.Archive("owner:test", "run")
        archive.institution = "stanford"
        with patch.object(collector_archive.db, "transaction", side_effect=AssertionError("must not save")):
            self.assertFalse(archive.save({"professional_email": "a@b.edu", "affiliation": "MIT"}))

    def test_request_validates_country(self):
        base = {"topic": "x", "from_date": "2025-01-01", "to_date": "2025-02-01"}
        self.assertEqual(CollectionRequest(**base, country="us").country, "us")
        self.assertEqual(CollectionRequest(**base).country, "")
        for bad in ("USA", "1A", "U"):
            with self.assertRaises(ValidationError):
                CollectionRequest(**base, country=bad)


if __name__ == "__main__":
    unittest.main()
