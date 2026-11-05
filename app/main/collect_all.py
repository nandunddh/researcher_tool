"""One-click discovery, enrichment and a single run-specific contact export."""
import csv
import importlib.util
import json
import sys
import uuid
from datetime import datetime
from pathlib import Path
from collector_store import FIELDS, read_rows


def load_source(filename):
    spec = importlib.util.spec_from_file_location('source_' + uuid.uuid4().hex, Path(__file__).parent / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.run


def collect(keyword, target=100, min_score=50, from_date='2025-01-01', to_date=None,
            data_dir=None, sources=None):
    from app_config import get_data_dir
    keyword = keyword.strip()
    target, min_score = int(target), int(min_score)
    to_date = to_date or datetime.now().strftime('%Y-%m-%d')
    if not keyword or not 1 <= target <= 50000 or not 0 <= min_score <= 100:
        raise ValueError('Enter a topic, target 1–50000 and score 0–100')
    if datetime.fromisoformat(from_date) > datetime.fromisoformat(to_date):
        raise ValueError('Start date must be before end date')
    folder = Path(data_dir) if data_dir else get_data_dir()
    master = folder / 'central_master_leads.csv'
    def snapshot():
        return {r['professional_email']: r for r in read_rows(master)} if master.exists() else {}
    baseline = set(snapshot())
    collected = {}
    errors = []
    sources = sources if sources is not None else [
        ('OpenAlex', lambda **kw: load_source('03_unified_lead_pipeline.py')(**kw)),
        ('bioRxiv', lambda **kw: load_source('06_extract_biorxiv_researchers.py')(**kw)),
    ]
    for name, run in sources:
        remaining = target - len(collected)
        if remaining <= 0:
            break
        print(f'[AUTO] {name}: collecting up to {remaining} more contacts', flush=True)
        try:
            run(keyword=keyword, target_leads=remaining, min_score=min_score,
                from_date=from_date, to_date=to_date)
        except Exception as exc:
            errors.append({'source': name, 'message': str(exc)})
            print(f'[WARN] {name}: {exc}; retaining partial results and trying next source', flush=True)
        for email, row in snapshot().items():
            if email not in baseline and email not in collected and len(collected) < target:
                collected[email] = row
        print(f'[AUTO] Progress: {len(collected)}/{target} unique contacts', flush=True)
    output = folder / datetime.now().strftime('%Y-%m-%d') / ('collection_' + uuid.uuid4().hex[:12] + '.csv')
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open('w', encoding='utf-8-sig', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(collected.values())
    result = {'status': 'completed' if len(collected) == target else 'partial',
              'collected': len(collected), 'target': target, 'shortfall': target-len(collected),
              'file': output.relative_to(folder).as_posix(), 'source_errors': errors}
    output.with_suffix('.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    print('COLLECTION_RESULT ' + json.dumps(result), flush=True)
    return result

if __name__ == '__main__':
    collect(sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4], sys.argv[5])
