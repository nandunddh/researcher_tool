"""Private "invited speakers" shortlist for an event website (never part of the public site)."""
from psycopg2.extras import RealDictCursor
import db

MAX_PER_REQUEST = 200
MAX_PER_SITE = 2000


def add(site_id, contacts):
    """Adds contact records (from the collector archive) to the site's shortlist. Returns how many were new."""
    contacts = list(contacts)[:MAX_PER_REQUEST]
    with db.transaction() as cur:
        cur.execute("SELECT count(*) FROM event_shortlist WHERE site_id=%s", (site_id,))
        room = MAX_PER_SITE - cur.fetchone()[0]
        added = 0
        for c in contacts:
            if added >= room:
                break
            cur.execute("""INSERT INTO event_shortlist(site_id,email,name,affiliation,orcid,source,paper_title)
                           VALUES (%s,%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING""",
                        (site_id, c["professional_email"], (c.get("researcher_name") or c["professional_email"])[:200],
                         (c.get("affiliation") or "")[:300], (c.get("orcid") or "")[:40], (c.get("data_source") or "")[:40],
                         (c.get("matched_paper_title") or "")[:300]))
            added += cur.rowcount
    return added


def listing(site_id):
    with db.transaction() as cur, cur.connection.cursor(cursor_factory=RealDictCursor) as rows:
        rows.execute("SELECT email,name,affiliation,orcid,source,paper_title,added_at FROM event_shortlist WHERE site_id=%s ORDER BY added_at DESC, name", (site_id,))
        return rows.fetchall()


def remove(site_id, email):
    with db.transaction() as cur:
        cur.execute("DELETE FROM event_shortlist WHERE site_id=%s AND email=%s", (site_id, email.strip().lower()))
        return cur.rowcount == 1
