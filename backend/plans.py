"""Website plans: limits for SciStudio (websites, pages, team members, storage, submissions, custom domain).
Separate from the SciProspect license tier (trial/pro), which controls the data collector."""
from typing import Dict, Optional

import db
from psycopg2.extras import Json

LIMIT_KEYS = ("websites", "pages", "members", "storage_mb", "data_storage_mb", "submissions_month", "daily_contacts")
KINDS = ("trial", "paid", "custom")
# What visitors may see of a plan (never Stripe ids).
PUBLIC_FIELDS = ("id", "name", "price_month", "price_year", "kind", "limits", "featured")
UNLIMITED = -1


def list_plans() -> list:
    with db.transaction() as cur:
        cur.execute("SELECT id, name, price_month, price_year, kind, retired, limits, stripe_price_id, stripe_price_id_year, featured FROM plans ORDER BY sort, id")
        return [{"id": i, "name": n, "price_month": float(pm), "price_year": float(py), "kind": k, "retired": r, "limits": l,
                 "stripe_price_id": sp, "stripe_price_id_year": spy, "featured": f} for i, n, pm, py, k, r, l, sp, spy, f in cur.fetchall()]


def public_plans() -> list:
    """The plans on the pricing page: not retired ones. The trial is returned too (it is a card-free start, not a purchase)."""
    return [{k: p[k] for k in PUBLIC_FIELDS} for p in list_plans() if not p["retired"]]


def clean_plan(body: dict) -> dict:
    """Validates a plan edited by root. Raises ValueError with a plain-language reason."""
    name = str(body.get("name") or "").strip()[:40]
    if not name:
        raise ValueError("The plan needs a name.")
    try:
        price = round(max(0.0, float(body.get("price_month") or 0)), 2)
        price_year = round(max(0.0, float(body.get("price_year") or 0)), 2)
    except (TypeError, ValueError):
        raise ValueError("The prices must be numbers.")
    kind = str(body.get("kind") or "paid")
    if kind not in KINDS:
        raise ValueError("The plan type must be trial, paid or custom.")
    raw = body.get("limits") if isinstance(body.get("limits"), dict) else {}
    limits: Dict[str, object] = {}
    for key in LIMIT_KEYS:
        try:
            value = int(raw.get(key, UNLIMITED))
        except (TypeError, ValueError):
            raise ValueError(f"“{key}” must be a whole number (-1 = unlimited).")
        limits[key] = UNLIMITED if value < 0 else min(value, 10_000_000)
    limits["custom_domain"] = raw.get("custom_domain") is True
    stripe_ids = []
    for field in ("stripe_price_id", "stripe_price_id_year"):
        value = str(body.get(field) or "").strip()
        if value and not value.startswith("price_"):
            raise ValueError("A Stripe price id starts with “price_”.")
        stripe_ids.append(value[:100])
    return {"name": name, "price_month": price, "price_year": price_year, "kind": kind, "retired": body.get("retired") is True, "limits": limits,
            "stripe_price_id": stripe_ids[0], "stripe_price_id_year": stripe_ids[1], "featured": body.get("featured") is True}


def save_plan(plan_id: str, body: dict) -> dict:
    plan = clean_plan(body)
    with db.transaction() as cur:
        cur.execute("UPDATE plans SET name = %s, price_month = %s, price_year = %s, kind = %s, retired = %s, limits = %s, stripe_price_id = %s, "
                    "stripe_price_id_year = %s, featured = %s, updated_at = now() WHERE id = %s",
                    (plan["name"], plan["price_month"], plan["price_year"], plan["kind"], plan["retired"], Json(plan["limits"]), plan["stripe_price_id"],
                     plan["stripe_price_id_year"], plan["featured"], plan_id))
        if cur.rowcount != 1:
            raise ValueError("Plan not found.")
        if plan["featured"]:  # only one plan carries the "Most popular" badge
            cur.execute("UPDATE plans SET featured = false WHERE id <> %s", (plan_id,))
    return {"id": plan_id, **plan}


def daily_contacts(plan: Optional[dict]) -> int:
    """Contacts one user may collect per day on this plan (-1 = unlimited)."""
    value = ((plan or {}).get("limits") or {}).get("daily_contacts", UNLIMITED)
    return int(value) if isinstance(value, (int, float)) else UNLIMITED


def default_plan_id(account: dict) -> str:
    """Accounts created before plans existed: organizations get Organization, Pro licenses get Pro, others Free."""
    if account.get("plan_id"):
        return str(account["plan_id"])
    if account.get("account_type") == "org":
        return "organization"
    return "pro" if account.get("tier") == "pro" else "free"


def plan_for(account: dict) -> Optional[dict]:
    wanted = default_plan_id(account)
    plans = list_plans()
    return next((p for p in plans if p["id"] == wanted), plans[0] if plans else None)


def usage(owner_email: str) -> dict:
    """What an account uses now: websites, the most pages on one website, storage, submissions this month."""
    email = (owner_email or "").strip().lower()
    with db.transaction() as cur:
        cur.execute("SELECT count(*), coalesce(max(greatest(jsonb_array_length(coalesce(document->'pages', '[]'::jsonb)), 1)), 0) "
                    "FROM websites WHERE lower(owner_email) = %s", (email,))
        websites, pages = cur.fetchone()
        cur.execute("SELECT coalesce(sum(m.size_bytes), 0) FROM media m JOIN websites w ON w.site_id = m.site_id WHERE lower(w.owner_email) = %s", (email,))
        storage = cur.fetchone()[0]
        cur.execute("SELECT count(*) FROM form_submissions s JOIN websites w ON w.site_id = s.site_id "
                    "WHERE lower(w.owner_email) = %s AND s.created_at >= date_trunc('month', now())", (email,))
        submissions = cur.fetchone()[0]
    return {"websites": int(websites), "pages": int(pages), "storage_mb": round(int(storage) / 1_048_576, 1), "submissions_month": int(submissions)}


MESSAGES = {
    "websites": "Your plan allows {limit} website(s). Delete one, or upgrade your plan on the Billing page.",
    "pages": "Your plan allows {limit} pages per website. Remove a page, or upgrade your plan on the Billing page.",
    "storage_mb": "Your plan's storage ({limit} MB) is full. Remove unused images, or upgrade your plan on the Billing page.",
    "submissions_month": "This form has reached its monthly limit. Please contact the organiser.",
}


def over_limit(plan: Optional[dict], key: str, new_total: float) -> Optional[str]:
    """A message when new_total would go past the plan's limit for key, else None. No plan = no limit."""
    limit = ((plan or {}).get("limits") or {}).get(key, UNLIMITED)
    if not isinstance(limit, (int, float)) or limit < 0 or new_total <= limit:
        return None
    return MESSAGES[key].format(limit=int(limit))


def usage_all() -> Dict[str, dict]:
    """Usage for every owner email at once (a few grouped queries instead of several per account)."""
    out: Dict[str, dict] = {}
    blank = lambda: {"websites": 0, "pages": 0, "storage_mb": 0.0, "submissions_month": 0}
    with db.transaction() as cur:
        cur.execute("SELECT lower(owner_email), count(*), coalesce(max(greatest(jsonb_array_length(coalesce(document->'pages', '[]'::jsonb)), 1)), 0) "
                    "FROM websites GROUP BY lower(owner_email)")
        for email, sites, pages in cur.fetchall():
            out.setdefault(email, blank()).update(websites=int(sites), pages=int(pages))
        cur.execute("SELECT lower(w.owner_email), coalesce(sum(m.size_bytes), 0) FROM media m JOIN websites w ON w.site_id = m.site_id GROUP BY lower(w.owner_email)")
        for email, size in cur.fetchall():
            out.setdefault(email, blank())["storage_mb"] = round(int(size) / 1_048_576, 1)
        cur.execute("SELECT lower(w.owner_email), count(*) FROM form_submissions s JOIN websites w ON w.site_id = s.site_id "
                    "WHERE s.created_at >= date_trunc('month', now()) GROUP BY lower(w.owner_email)")
        for email, count in cur.fetchall():
            out.setdefault(email, blank())["submissions_month"] = int(count)
    return out
