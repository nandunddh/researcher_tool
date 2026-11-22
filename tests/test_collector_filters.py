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

    def test_nih_run_saves_funded_pis_through_the_archive(self):
        nih = load_source("04_extract_nih_researchers.py").__globals__
        pis = [{"full_name": n, "first_name": "", "last_name": "", "organization": org, "city": "Boston", "state": "MA",
                "award_amount": 500000, "project_num": "R01", "project_title": "Amyloid", "fiscal_year": 2026, "keyword": "x"}
               for n, org in (("Ann Lee", "Harvard Medical School"), ("Bo Chan", "Stanford University"), ("Cy Diaz", "Harvard Medical School"))]
        calls = {}

        class FakeArchive:
            cancelled = __import__("threading").Event()
            saved = []
            def save(self, row):
                self.saved.append(row)
                return True

        def fetch(keyword, limit, fiscal_years, cancelled):
            calls["years"] = fiscal_years
            return pis
        archive = FakeArchive()
        with patch.dict(nih, fetch_nih_projects=fetch, find_pi_email=lambda pi: pi["full_name"].split()[0].lower() + "@hms.edu"):
            nih["run"](keyword="amyloid", target_leads=5, from_date="2024-03-01", to_date="2026-01-01", archive=archive, institution="harvard")
            self.assertEqual(calls["years"], [2024, 2025, 2026])
            self.assertEqual(sorted(r["full_name"] for r in archive.saved), ["Ann Lee", "Cy Diaz"])  # Stanford filtered out
            row = archive.saved[0]
            self.assertEqual((row["source"], row["award_amount"], row["review_status"]), ("NIH RePORTER", "$500,000", "author_linked"))
            archive.saved.clear()
            nih["run"](keyword="amyloid", target_leads=5, archive=archive, country="DE")  # NIH funds US institutions
            self.assertEqual(archive.saved, [])

    def test_request_validates_kind(self):
        base = {"topic": "x", "from_date": "2025-01-01", "to_date": "2025-02-01"}
        self.assertEqual(CollectionRequest(**base).kind, "publications")
        self.assertEqual(CollectionRequest(**base, kind="nih").kind, "nih")
        with self.assertRaises(ValidationError):
            CollectionRequest(**base, kind="patents")

    def test_request_validates_country(self):
        base = {"topic": "x", "from_date": "2025-01-01", "to_date": "2025-02-01"}
        self.assertEqual(CollectionRequest(**base, country="us").country, "us")
        self.assertEqual(CollectionRequest(**base).country, "")
        for bad in ("USA", "1A", "U"):
            with self.assertRaises(ValidationError):
                CollectionRequest(**base, country=bad)


if __name__ == "__main__":
    unittest.main()
