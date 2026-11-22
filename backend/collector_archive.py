"""Database-backed automatic collection. A run records only newly discovered emails."""
import csv
import hashlib
import io
import json
import logging
import uuid
from contextlib import contextmanager
from threading import Event, Thread

from psycopg2.extras import Json, RealDictCursor
from collector_store import FIELDS, normalize
from collect_all import load_source
import db

log = logging.getLogger(__name__)
SOURCES = (("OpenAlex", "03_unified_lead_pipeline.py"), ("bioRxiv", "06_extract_biorxiv_researchers.py"))
COLUMNS = "id,topic,target,min_score,from_date,to_date,status,source,collected,target-collected AS shortfall,source_errors,started_at,updated_at"


def expire(cur, owner):
    cur.execute("""UPDATE collector_runs SET status='interrupted' WHERE owner_key=%s
                   AND status='running' AND updated_at < now()-interval '3 minutes'""", (owner,))


def create(owner, topic, target, score, start, end):
    run_id = str(uuid.uuid4())
    with db.transaction() as cur:
        expire(cur, owner)
        cur.execute("""INSERT INTO collector_runs(owner_key,id,topic,target,min_score,from_date,to_date,status)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,'running')""", (owner,run_id,topic,target,score,start,end))
    return run_id


def history(owner):
    with db.transaction() as cur:
        expire(cur, owner)
        with cur.connection.cursor(cursor_factory=RealDictCursor) as rows:
            rows.execute(f"SELECT {COLUMNS} FROM collector_runs WHERE owner_key=%s ORDER BY started_at DESC LIMIT 100", (owner,))
            return rows.fetchall()


def results(owner, run_id, limit=None, offset=0):
    with db.transaction() as cur:
        cur.execute("SELECT 1 FROM collector_runs WHERE owner_key=%s AND id=%s", (owner,run_id))
        if not cur.fetchone():
            raise KeyError(run_id)
        cur.execute("""SELECT record FROM collector_results WHERE owner_key=%s AND run_id=%s
                       ORDER BY email LIMIT %s OFFSET %s""", (owner,run_id,limit,offset))
        return [row[0] for row in cur]


def csv_export(owner, run_id):
    stream = io.StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=FIELDS)
    writer.writeheader()
    for row in results(owner, run_id):
        writer.writerow({k: "'" + v if v.lstrip().startswith(("=", "+", "-", "@")) else v for k,v in row.items()})
    return stream.getvalue().encode("utf-8-sig")


class Archive:
    def __init__(self, owner, run_id):
        self.key = (owner, run_id)
        self.cancelled = Event()

    def save(self, raw):
        record = normalize(raw)
        email = record["professional_email"]
        owner, run_id = self.key
        digest = hashlib.sha256(json.dumps(raw, sort_keys=True).encode()).hexdigest()
        with db.transaction() as cur:
            cur.execute("SELECT status,collected,target FROM collector_runs WHERE owner_key=%s AND id=%s FOR UPDATE", self.key)
            status, count, target = cur.fetchone()
            if status != "running" or count >= target:
                self.cancelled.set()
                return False
            cur.execute("INSERT INTO collector_contacts VALUES (%s,%s,%s) ON CONFLICT DO NOTHING", (owner,email,Json(record)))
            new = cur.rowcount == 1
            if not new:
                cur.execute("SELECT record FROM collector_contacts WHERE owner_key=%s AND email=%s FOR UPDATE", (owner,email))
                merged = cur.fetchone()[0]
                for field, value in record.items():
                    if value and (not merged.get(field) or field not in ("email_confidence", "delivery_status")):
                        merged[field] = value
                cur.execute("UPDATE collector_contacts SET record=%s WHERE owner_key=%s AND email=%s", (Json(merged),owner,email))
            cur.execute("INSERT INTO collector_evidence VALUES (%s,%s,%s,%s) ON CONFLICT DO NOTHING", (owner,email,digest,Json(raw)))
            if new:
                cur.execute("INSERT INTO collector_results VALUES (%s,%s,%s,%s)", (owner,run_id,email,Json(record)))
                cur.execute("UPDATE collector_runs SET collected=collected+1,updated_at=now() WHERE owner_key=%s AND id=%s", self.key)
            return new

    @contextmanager
    def heartbeat(self):
        done = Event()
        def renew():
            while not done.wait(10):
                try:
                    with db.transaction() as cur:
                        cur.execute("""UPDATE collector_runs SET updated_at=now() WHERE owner_key=%s AND id=%s
                                       AND status='running'""", self.key)
                        if not cur.rowcount:
                            self.cancelled.set()
                            return
                except Exception:
                    log.exception("Collector lease update failed")
                    self.cancelled.set()
                    return
        thread = Thread(target=renew, daemon=True)
        thread.start()
        try:
            yield
        finally:
            done.set()
            thread.join()


def execute(owner, run_id, sources=SOURCES, loader=load_source):
    archive = Archive(owner, run_id)
    try:
        with archive.heartbeat():
            for name, filename in sources:
                with db.transaction() as cur:
                    cur.execute("""UPDATE collector_runs SET source=%s,updated_at=now() WHERE owner_key=%s AND id=%s
                                   AND status='running' AND collected<target RETURNING topic,target-collected,min_score,from_date,to_date""",
                                (name,*archive.key))
                    job = cur.fetchone()
                if not job or archive.cancelled.is_set():
                    break
                topic, remaining, score, start, end = job
                try:
                    loader(filename)(keyword=topic,target_leads=remaining,min_score=score,from_date=str(start),to_date=str(end),archive=archive)
                except Exception:
                    log.exception("Collection source failed: %s", name)
                    with db.transaction() as cur:
                        cur.execute("UPDATE collector_runs SET source_errors=source_errors || %s::jsonb WHERE owner_key=%s AND id=%s",
                                    (Json([{"source":name,"message":"Source did not finish."}]),*archive.key))
        with db.transaction() as cur:
            cur.execute("""UPDATE collector_runs SET status=CASE WHEN collected=target THEN 'completed'
                           WHEN %s THEN 'interrupted' ELSE 'partial' END, updated_at=now()
                           WHERE owner_key=%s AND id=%s AND status='running'""", (archive.cancelled.is_set(),*archive.key))
    except Exception:
        log.exception("Collection worker failed")
        with db.transaction() as cur:
            cur.execute("UPDATE collector_runs SET status='failed',updated_at=now() WHERE owner_key=%s AND id=%s AND status='running'", archive.key)


def stop(owner, run_id):
    with db.transaction() as cur:
        cur.execute("""UPDATE collector_runs SET status='stopped',updated_at=now() WHERE owner_key=%s AND id=%s AND status='running'""",
                    (owner,run_id))
        return bool(cur.rowcount)
