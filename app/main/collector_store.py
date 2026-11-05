"""Collector storage: canonical CSV records, lossless source payloads and SQLite upserts."""
import csv
import json
import os
import re
import shutil
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from contextlib import contextmanager

ALIASES = {
    'researcher_name': ('researcher_name', 'full_name', 'author_name'),
    'professional_email': ('professional_email', 'email'),
    'affiliation': ('affiliation', 'organization', 'institution', 'affiliations_seen_on_matching_papers'),
    'matched_paper_title': ('matched_paper_title', 'paper_title', 'example_papers'),
    'doi': ('doi', 'example_paper_dois'),
    'search_keyword': ('search_keyword', 'field_keyword', 'matched_search_terms', 'category_topic', 'category'),
    'data_source': ('data_source', 'source', 'source_dataset'),
}
FIELDS = list(ALIASES) + ['orcid', 'openalex_author_id', 'match_score', 'match_rating',
    'score_breakdown', 'publication_year', 'review_status', 'email_status',
    'email_source_url', 'award_amount', 'project_title', 'fiscal_year', 'city', 'state',
    'date_collected', 'email_confidence', 'delivery_status']

def normalize(row):
    result = {k: str(row.get(k) or '').strip() for k in FIELDS}
    for key, aliases in ALIASES.items():
        result[key] = next((str(row[a]).strip() for a in aliases if row.get(a)), '')
    email = result['professional_email'].lower().strip().rstrip('.,;')
    if not re.fullmatch(r'[^\s@;,]+@[^\s@;,]+\.[a-zA-Z]{2,}', email):
        raise ValueError('Invalid or missing email')
    result['professional_email'] = email
    result['delivery_status'] = result['delivery_status'] or 'unknown'
    result['email_confidence'] = result['email_confidence'] or ('author_linked' if result['review_status'] == 'author_linked' else 'needs_review')
    return result

@contextmanager
def database(master):
    master = Path(master)
    master.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(master.with_suffix('.sqlite3')), timeout=30)
    try:
        conn.execute('CREATE TABLE IF NOT EXISTS leads (email TEXT PRIMARY KEY, record TEXT NOT NULL)')
        conn.execute('CREATE TABLE IF NOT EXISTS evidence (email TEXT, payload TEXT, UNIQUE(email,payload))')
        conn.execute('CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT)')
        conn.commit()
        conn.execute('BEGIN IMMEDIATE')
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def read_rows(path):
    with Path(path).open(encoding='utf-8-sig', newline='') as stream:
        reader = csv.DictReader(stream)
        for line, row in enumerate(reader, 2):
            if None in row or any(v is None for v in row.values()):
                raise ValueError(f'{Path(path).name}: inconsistent columns at line {line}; original retained')
            yield row

def _upsert(conn, row):
    normalized = normalize(row)
    email = normalized['professional_email']
    old = conn.execute('SELECT record FROM leads WHERE email=?', (email,)).fetchone()
    merged = json.loads(old[0]) if old else {}
    for key, value in normalized.items():
        if value and (not merged.get(key) or key not in ('email_confidence', 'delivery_status')):
            merged[key] = value
    conn.execute('INSERT OR REPLACE INTO leads VALUES (?,?)', (email, json.dumps(merged)))
    conn.execute('INSERT OR IGNORE INTO evidence VALUES (?,?)', (email, json.dumps(row, sort_keys=True)))

def save_leads(master, rows):
    """Import legacy master once, preserve a backup, upsert and export atomically.

    SQLite serializes writers; export stays under the same transaction lock.
    Malformed legacy CSVs fail before replacement rather than guessing field mapping.
    """
    master = Path(master)
    with database(master) as conn:
        if not conn.execute("SELECT 1 FROM metadata WHERE key='imported'").fetchone():
            if master.exists() and master.stat().st_size:
                legacy = list(read_rows(master))
                for row in legacy:
                    _upsert(conn, row)
                stamp = datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S%f')
                shutil.copy2(master, master.with_name(master.name + '.backup-' + stamp))
            conn.execute("INSERT INTO metadata VALUES ('imported','1')")
        for row in rows:
            _upsert(conn, row)
        temp = master.with_suffix('.csv.tmp')
        try:
            with temp.open('w', encoding='utf-8-sig', newline='') as stream:
                writer = csv.DictWriter(stream, fieldnames=FIELDS)
                writer.writeheader()
                for (payload,) in conn.execute('SELECT record FROM leads ORDER BY email'):
                    writer.writerow(json.loads(payload))
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temp, master)
        finally:
            if temp.exists():
                temp.unlink()


def merge_files(master, paths):
    rows = []
    for path in paths:
        for row in read_rows(path):
            if row.get('professional_email') or row.get('email'):
                rows.append(row)
    # Validate all files before touching the existing archive.
    for row in rows:
        normalize(row)
    save_leads(master, rows)
    unique = len({normalize(r)['professional_email'] for r in rows})
    return {'total_leads_scanned': len(rows), 'unique_master_leads': unique,
            'duplicates_removed': len(rows)-unique}

def clear_archive(master):
    with database(master) as conn:
        conn.execute('DELETE FROM leads')
        conn.execute('DELETE FROM evidence')
