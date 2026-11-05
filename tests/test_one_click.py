import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'app/main'))
from collect_all import collect
from collector_store import save_leads, read_rows

class OneClickTests(unittest.TestCase):
    def test_fallback_fills_only_remaining_and_exports_run(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as folder:
            master = Path(folder) / 'central_master_leads.csv'
            save_leads(master, [{'email':'old@lab.edu'}])
            calls = []
            def first(**kw):
                calls.append(kw['target_leads'])
                save_leads(master, [{'email':'first@lab.edu'}])
            def second(**kw):
                calls.append(kw['target_leads'])
                save_leads(master, [{'email':'second@lab.edu'}, {'email':'first@lab.edu'}])
            result = collect('biology', 2, data_dir=folder, sources=[('one', first), ('two', second)])
            self.assertEqual(calls, [2, 1])
            self.assertEqual(result['status'], 'completed')
            self.assertEqual({r['professional_email'] for r in read_rows(Path(folder)/result['file'])}, {'first@lab.edu','second@lab.edu'})

    def test_source_failure_is_partial_and_next_source_runs(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as folder:
            def failure(**kw):
                raise RuntimeError('source unavailable')
            result = collect('biology', 100, data_dir=folder, sources=[('one', failure), ('two', lambda **kw: None)])
            self.assertEqual(result['status'], 'partial')
            self.assertEqual(result['shortfall'], 100)
            self.assertEqual(len(result['source_errors']), 1)

    def test_target_met_skips_other_source(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as folder:
            def first(**kw):
                save_leads(Path(folder)/'central_master_leads.csv', [{'email':'first@lab.edu'}])
            def unexpected(**kw):
                self.fail('Fallback should not run')
            result = collect('biology', 1, data_dir=folder, sources=[('one', first), ('two', unexpected)])
            self.assertEqual(result['collected'], 1)
