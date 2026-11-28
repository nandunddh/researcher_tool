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
import email_check

log = logging.getLogger(__name__)
SOURCES = (("OpenAlex", "03_unified_lead_pipeline.py"), ("PubMed", "07_extract_pubmed_researchers.py"), ("bioRxiv", "06_extract_biorxiv_researchers.py"))
NIH_SOURCES = (("NIH RePORTER", "04_extract_nih_researchers.py"),)
COUNTRY_SOURCES = {"OpenAlex", "NIH RePORTER"}  # sources that know the institution country
SOURCE_NAMES = tuple(name for name, _ in SOURCES)  # the publication sources a user can choose from
COLUMNS = "id,kind,topic,target,min_score,from_date,to_date,country,institution,status,source,collected,target-collected AS shortfall,source_errors,started_at,updated_at,sources"


def expire(cur, owner):
    cur.execute("""UPDATE collector_runs SET status='interrupted' WHERE owner_key=%s
                   AND status='running' AND updated_at < now()-interval '3 minutes'""", (owner,))


def chosen_sources(names):
    """The chosen publication sources in their usual order; empty or None means all of them."""
    wanted = set(names or ())
    return [n for n in SOURCE_NAMES if n in wanted]


def create(owner, topic, target, score, start, end, country="", institution="", kind="publications", started_by="", sources=()):
    run_id = str(uuid.uuid4())
    with db.transaction() as cur:
        expire(cur, owner)
        cur.execute("""INSERT INTO collector_runs(owner_key,id,topic,target,min_score,from_date,to_date,country,institution,kind,started_by,sources,status)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'running')""", (owner,run_id,topic,target,score,start,end,country,institution,kind,started_by,chosen_sources(sources)))
    return run_id


def history(owner):
    with db.transaction() as cur:
        expire(cur, owner)
        with cur.connection.cursor(cursor_factory=RealDictCursor) as rows:
            rows.execute(f"SELECT {COLUMNS} FROM collector_runs WHERE owner_key=%s ORDER BY started_at DESC LIMIT 100", (owner,))
            return rows.fetchall()


def stats(owner, started_by=None):
    """Counts for the collector page's summary cards. With started_by, "today" counts only that user's collections ("" = the owner)."""
    with db.transaction() as cur:
        cur.execute("SELECT count(*) FROM collector_contacts WHERE owner_key=%s", (owner,))
        total = cur.fetchone()[0]
        cur.execute("SELECT count(*) FROM collector_results r JOIN collector_runs u ON u.owner_key=r.owner_key AND u.id=r.run_id "
                    "WHERE r.owner_key=%s AND u.started_at >= date_trunc('day', now()) AND (%s::text IS NULL OR u.started_by=%s)",
                    (owner, started_by, started_by))
        today = cur.fetchone()[0]
        cur.execute("SELECT count(*) FROM collector_runs WHERE owner_key=%s", (owner,))
        datasets = cur.fetchone()[0]
    return {"total": int(total), "today": int(today), "datasets": int(datasets)}


# Leads Explorer sorting: column name -> SQL expression (never user text in SQL).
SORTS = {"name": "r.record->>'researcher_name'", "email": "r.email", "affiliation": "r.record->>'affiliation'",
         "source": "r.record->>'data_source'", "confidence": "r.record->>'email_confidence'",
         "status": "COALESCE(c.record->>'delivery_status','unknown')"}


def results(owner, run_id, limit=None, offset=0, delivery_status=None, q="", sort="email", order="asc"):
    with db.transaction() as cur:
        cur.execute("SELECT 1 FROM collector_runs WHERE owner_key=%s AND id=%s", (owner,run_id))
        if not cur.fetchone():
            raise KeyError(run_id)
        q = (q or "").strip()[:200]
        # Search text is matched literally: "!" escapes LIKE wildcards typed by the user.
        pattern = "%" + q.replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%"
        # Keep the collected snapshot, with the latest delivery check from the archive.
        cur.execute("""SELECT r.record || jsonb_strip_nulls(jsonb_build_object(
                                'delivery_status', COALESCE(c.record->>'delivery_status','unknown'),
                                'checks', c.record->'checks', 'checked_at', c.record->'checked_at'))
                       FROM collector_results r JOIN collector_contacts c USING (owner_key,email)
                       WHERE r.owner_key=%s AND r.run_id=%s
                         AND (%s IS NULL OR COALESCE(c.record->>'delivery_status','unknown')=%s)
                         AND (%s = '' OR r.record->>'researcher_name' ILIKE %s ESCAPE '!' OR r.email ILIKE %s ESCAPE '!'
                              OR r.record->>'affiliation' ILIKE %s ESCAPE '!')
                       ORDER BY """ + SORTS.get(sort, "r.email") + (" DESC" if order == "desc" else " ASC") + """ NULLS LAST, r.email
                       LIMIT %s OFFSET %s""",
                    (owner,run_id,delivery_status,delivery_status,q,pattern,pattern,pattern,limit,offset))
        return [row[0] for row in cur]


# Same sort keys over the whole archive (one row per unique contact).
ALL_SORTS = {"name": "record->>'researcher_name'", "email": "email", "affiliation": "record->>'affiliation'",
             "source": "record->>'data_source'", "confidence": "record->>'email_confidence'",
             "status": "COALESCE(record->>'delivery_status','unknown')"}


def all_contacts(owner, limit=None, offset=0, delivery_status=None, q="", sort="name", order="asc"):
    """Every contact the workspace ever collected, deduplicated (the central archive)."""
    q = (q or "").strip()[:200]
    pattern = "%" + q.replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%"
    with db.transaction() as cur:
        cur.execute("""SELECT record || jsonb_build_object('delivery_status', COALESCE(record->>'delivery_status','unknown'))
                       FROM collector_contacts WHERE owner_key=%s
                         AND (%s IS NULL OR COALESCE(record->>'delivery_status','unknown')=%s)
                         AND (%s = '' OR record->>'researcher_name' ILIKE %s ESCAPE '!' OR email ILIKE %s ESCAPE '!'
                              OR record->>'affiliation' ILIKE %s ESCAPE '!')
                       ORDER BY """ + ALL_SORTS.get(sort, "email") + (" DESC" if order == "desc" else " ASC") + """ NULLS LAST, email
                       LIMIT %s OFFSET %s""",
                    (owner, delivery_status, delivery_status, q, pattern, pattern, pattern, limit, offset))
        return [row[0] for row in cur]


def _csv(rows):
    stream = io.StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=FIELDS)
    writer.writeheader()
    for row in rows:
        fields = {key: str(row.get(key) or "") for key in FIELDS}
        writer.writerow({k: "'" + v if v.lstrip().startswith(("=", "+", "-", "@")) else v for k,v in fields.items()})
    return stream.getvalue().encode("utf-8-sig")


def contacts_by_email(owner, emails):
    """The workspace's own archive records for these addresses (others are ignored)."""
    wanted = sorted({str(e).strip().lower() for e in emails if str(e).strip()})[:200]
    if not wanted:
        return []
    with db.transaction() as cur:
        cur.execute("SELECT record FROM collector_contacts WHERE owner_key=%s AND email = ANY(%s)", (owner, wanted))
        return [row[0] for row in cur]


def all_contacts_csv(owner):
    return _csv(all_contacts(owner))


def csv_export(owner, run_id):
    stream = io.StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=FIELDS)
    writer.writeheader()
    for row in results(owner, run_id):
        fields = {key: str(row.get(key) or "") for key in FIELDS}
        writer.writerow({k: "'" + v if v.lstrip().startswith(("=", "+", "-", "@")) else v for k,v in fields.items()})
    return stream.getvalue().encode("utf-8-sig")


class Archive:
    def __init__(self, owner, run_id):
        self.key = (owner, run_id)
        self.cancelled = Event()
        self.email_checker = email_check.EmailChecker()
        self.institution = ""  # set by execute(); rows whose affiliation lacks it are skipped

    def save(self, raw):
        record = normalize(raw)
        if self.institution and self.institution.casefold() not in (record.get("affiliation") or "").casefold():
            return False
        email = record["professional_email"]
        record.update(self.email_checker.check(email))
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
                    if field in ("checks", "checked_at", "delivery_status"):
                        continue
                    if value and (not merged.get(field) or field != "email_confidence"):
                        merged[field] = value
                if not merged.get("checked_at"):
                    merged.update({k: record[k] for k in ("checks", "checked_at", "delivery_status")})
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
        if sources is SOURCES:
            with db.transaction() as cur:
                cur.execute("SELECT kind, sources FROM collector_runs WHERE owner_key=%s AND id=%s", archive.key)
                row = cur.fetchone()
            if row and row[0] == "nih":
                sources = NIH_SOURCES
            elif row and row[1]:  # the user picked some publication sources
                sources = tuple(s for s in SOURCES if s[0] in row[1])
        with archive.heartbeat():
            for name, filename in sources:
                with db.transaction() as cur:
                    cur.execute("""UPDATE collector_runs SET source=%s,updated_at=now() WHERE owner_key=%s AND id=%s
                                   AND status='running' AND collected<target RETURNING topic,target-collected,min_score,from_date,to_date,country,institution""",
                                (name,*archive.key))
                    job = cur.fetchone()
                if not job or archive.cancelled.is_set():
                    break
                topic, remaining, score, start, end, country, institution = job
                archive.institution = institution
                filters = {k: v for k, v in (("country", country), ("institution", institution)) if v}
                if country and name not in COUNTRY_SOURCES:
                    print(f"[AUTO] {name}: skipped (it has no country data)", flush=True)
                    continue
                try:
                    loader(filename)(keyword=topic,target_leads=remaining,min_score=score,from_date=str(start),to_date=str(end),archive=archive,**filters)
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


def delete_run(owner, run_id):
    """Removes a finished collection. Its contacts stay in the central archive (they may be in other collections)."""
    with db.transaction() as cur:
        cur.execute("SELECT status FROM collector_runs WHERE owner_key=%s AND id=%s FOR UPDATE", (owner, run_id))
        row = cur.fetchone()
        if not row:
            raise KeyError(run_id)
        if row[0] == "running":
            raise ValueError("Stop the collection before deleting it.")
        cur.execute("DELETE FROM collector_results WHERE owner_key=%s AND run_id=%s", (owner, run_id))
        cur.execute("DELETE FROM collector_runs WHERE owner_key=%s AND id=%s", (owner, run_id))


def rename_run(owner, run_id, topic):
    with db.transaction() as cur:
        cur.execute("UPDATE collector_runs SET topic=%s WHERE owner_key=%s AND id=%s", (topic, owner, run_id))
        if cur.rowcount != 1:
            raise KeyError(run_id)


def stop(owner, run_id):
    with db.transaction() as cur:
        cur.execute("""UPDATE collector_runs SET status='stopped',updated_at=now() WHERE owner_key=%s AND id=%s AND status='running'""",
                    (owner,run_id))
        return bool(cur.rowcount)
