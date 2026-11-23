"""Saved collector searches and their schedule (daily or weekly)."""
import uuid
from datetime import date, timedelta

from psycopg2.extras import RealDictCursor
import db

FREQUENCIES = ("off", "daily", "weekly")
_STEP = {"daily": "1 day", "weekly": "7 days"}
COLUMNS = ("id,name,kind,topic,target,min_score,window_days,country,institution,frequency,"
           "next_run_at,last_run_id,last_run_at,last_error,created_at")


def _next(frequency):
    """SQL for the next run time; frequency is validated against FREQUENCIES before use."""
    return f"now() + interval '{_STEP[frequency]}'" if frequency in _STEP else "NULL"


def list_searches(owner):
    with db.transaction() as cur, cur.connection.cursor(cursor_factory=RealDictCursor) as rows:
        rows.execute(f"SELECT {COLUMNS} FROM collector_saved_searches WHERE owner_key=%s ORDER BY created_at DESC", (owner,))
        return rows.fetchall()


def save(owner, *, name, kind, topic, target, min_score, window_days, country, institution, frequency, license_key):
    if frequency not in FREQUENCIES:
        raise ValueError("Unknown frequency.")
    search_id = str(uuid.uuid4())
    with db.transaction() as cur:
        cur.execute(f"""INSERT INTO collector_saved_searches(owner_key,id,name,kind,topic,target,min_score,window_days,country,
                        institution,frequency,license_key,next_run_at) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,{_next(frequency)})""",
                    (owner, search_id, name, kind, topic, target, min_score, window_days, country, institution, frequency, license_key))
    return search_id


def update(owner, search_id, *, name=None, frequency=None, license_key=None):
    """Renames and/or reschedules. Changing the frequency restarts the clock from now."""
    sets, args = [], []
    if name is not None:
        sets.append("name=%s"); args.append(name)
    if frequency is not None:
        if frequency not in FREQUENCIES:
            raise ValueError("Unknown frequency.")
        sets.append(f"frequency=%s, next_run_at={_next(frequency)}, last_error=''"); args.append(frequency)
    if license_key is not None:
        sets.append("license_key=%s"); args.append(license_key)
    if not sets:
        return
    with db.transaction() as cur:
        cur.execute(f"UPDATE collector_saved_searches SET {', '.join(sets)} WHERE owner_key=%s AND id=%s", (*args, owner, search_id))
        if cur.rowcount != 1:
            raise KeyError(search_id)


def delete(owner, search_id):
    with db.transaction() as cur:
        cur.execute("DELETE FROM collector_saved_searches WHERE owner_key=%s AND id=%s", (owner, search_id))
        if cur.rowcount != 1:
            raise KeyError(search_id)


def get(owner, search_id):
    with db.transaction() as cur, cur.connection.cursor(cursor_factory=RealDictCursor) as rows:
        rows.execute(f"SELECT {COLUMNS},license_key FROM collector_saved_searches WHERE owner_key=%s AND id=%s", (owner, search_id))
        row = rows.fetchone()
    if not row:
        raise KeyError(search_id)
    return row


def run_window(window_days, today=None):
    """The date window for a run of this search: window_days long, ending today."""
    end = today or date.today()
    return end - timedelta(days=int(window_days)), end


def claim_due(limit=5):
    """Atomically takes the searches whose time has come and moves each to its next slot, so a search runs once
    even when two servers share the database."""
    with db.transaction() as cur, cur.connection.cursor(cursor_factory=RealDictCursor) as rows:
        rows.execute(f"""UPDATE collector_saved_searches s
                         SET next_run_at = now() + CASE s.frequency WHEN 'daily' THEN interval '1 day' ELSE interval '7 days' END
                         WHERE (s.owner_key, s.id) IN (
                             SELECT owner_key, id FROM collector_saved_searches
                             WHERE frequency <> 'off' AND next_run_at <= now()
                             ORDER BY next_run_at LIMIT %s FOR UPDATE SKIP LOCKED)
                         RETURNING s.owner_key,s.license_key,{', '.join('s.' + c for c in COLUMNS.split(','))}""", (limit,))
        return rows.fetchall()


def record(owner, search_id, run_id=None, error=""):
    with db.transaction() as cur:
        cur.execute("""UPDATE collector_saved_searches SET last_run_at=now(), last_run_id=COALESCE(%s::uuid, last_run_id), last_error=%s
                       WHERE owner_key=%s AND id=%s""", (run_id, error[:300], owner, search_id))


def retry_soon(owner, search_id, minutes=30):
    """A due search that could not start (another collection running) tries again shortly instead of next period."""
    with db.transaction() as cur:
        cur.execute("UPDATE collector_saved_searches SET next_run_at = now() + make_interval(mins => %s) WHERE owner_key=%s AND id=%s",
                    (int(minutes), owner, search_id))
