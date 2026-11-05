import csv
import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'app/main'))
from collector_store import save_leads, read_rows, merge_files
from collector_identity import author_email, name_matches_email

class CollectorTests(unittest.TestCase):
    def test_mixed_sources_and_repeated_checkpoint(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as folder:
            master = Path(folder) / 'master.csv'
            rows = [{'full_name':'Alice Smith','email':'alice.smith@lab.edu','organization':'Lab','award_amount':'$100'},
                    {'researcher_name':'Alice Smith','professional_email':'alice.smith@lab.edu','matched_paper_title':'Paper','doi':'10.1/example'}]
            save_leads(master, rows)
            save_leads(master, rows)
            result = list(read_rows(master))
            self.assertEqual(len(result), 1)
            self.assertEqual(result[0]['affiliation'], 'Lab')
            self.assertEqual(result[0]['award_amount'], '$100')
            self.assertEqual(result[0]['matched_paper_title'], 'Paper')
            with sqlite3.connect(master.with_suffix('.sqlite3')) as conn:
                self.assertEqual(conn.execute('SELECT count(*) FROM evidence').fetchone()[0], 2)
            conn.close()

    def test_bad_legacy_archive_is_not_overwritten(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as folder:
            master = Path(folder) / 'master.csv'
            original = 'name,email\nAlice,a@lab.edu,unexpected\n'
            master.write_text(original)
            with self.assertRaises(ValueError):
                save_leads(master, [])
            self.assertEqual(master.read_text(), original)

    def test_migration_backup(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as folder:
            master = Path(folder) / 'master.csv'
            master.write_text('full_name,email\nAlice Smith,alice@lab.edu\n')
            save_leads(master, [])
            self.assertEqual(len(list(Path(folder).glob('*.backup-*'))), 1)
            self.assertEqual(list(read_rows(master))[0]['researcher_name'], 'Alice Smith')

    def test_contact_attribution(self):
        xml = '<article><contrib-group><contrib><name><surname>Smith</surname><given-names>Alice</given-names></name><xref ref-type="corresp" rid="c1"/></contrib></contrib-group><email>wrong@publisher.org</email><corresp id="c1"><email>correct@lab.edu</email></corresp></article>'
        self.assertEqual(author_email(xml, 'Alice Smith'), 'correct@lab.edu')
        self.assertEqual(author_email(xml, 'Bob Smith'), '')
        self.assertFalse(name_matches_email('Alice Smith', 'alice.jones@lab.edu'))
        self.assertTrue(name_matches_email('Alice Smith', 'asmith@lab.edu'))
