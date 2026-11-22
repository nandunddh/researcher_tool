"""Website plans: limits for SciStudio (websites, pages, team members, storage, submissions, custom domain).
Separate from the SciProspect license tier (trial/pro), which controls the data collector."""
from typing import Dict, Optional

import db
from psycopg2.extras import Json

LIMIT_KEYS = ("websites", "pages", "members", "storage_mb", "submissions_month")
UNLIMITED = -1


def list_plans() -> list:
    with db.transaction() as cur:
        cur.execute("SELECT id, name, price_month, limits, stripe_price_id FROM plans ORDER BY sort, id")
        return [{"id": i, "name": n, "price_month": float(p), "limits": l, "stripe_price_id": sp} for i, n, p, l, sp in cur.fetchall()]


def clean_plan(body: dict) -> dict:
    """Validates a plan edited by root. Raises ValueError with a plain-language reason."""
    name = str(body.get("name") or "").strip()[:40]
    if not name:
        raise ValueError("The plan needs a name.")
    try:
        price = round(max(0.0, float(body.get("price_month") or 0)), 2)
    except (TypeError, ValueError):
        raise ValueError("The price must be a number.")
    raw = body.get("limits") if isinstance(body.get("limits"), dict) else {}
    limits: Dict[str, object] = {}
    for key in LIMIT_KEYS:
        try:
            value = int(raw.get(key, UNLIMITED))
        except (TypeError, ValueError):
            raise ValueError(f"“{key}” must be a whole number (-1 = unlimited).")
        limits[key] = UNLIMITED if value < 0 else min(value, 10_000_000)
    limits["custom_domain"] = raw.get("custom_domain") is True
    stripe_price = str(body.get("stripe_price_id") or "").strip()
    if stripe_price and not stripe_price.startswith("price_"):
        raise ValueError("A Stripe price id starts with “price_”.")
    return {"name": name, "price_month": price, "limits": limits, "stripe_price_id": stripe_price[:100]}


def save_plan(plan_id: str, body: dict) -> dict:
    plan = clean_plan(body)
    with db.transaction() as cur:
        cur.execute("UPDATE plans SET name = %s, price_month = %s, limits = %s, stripe_price_id = %s, updated_at = now() WHERE id = %s",
                    (plan["name"], plan["price_month"], Json(plan["limits"]), plan["stripe_price_id"], plan_id))
        if cur.rowcount != 1:
            raise ValueError("Plan not found.")
    return {"id": plan_id, **plan}


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
    "websites": "Your plan allows {limit} website(s). Delete one or ask your administrator to upgrade your plan.",
    "pages": "Your plan allows {limit} pages per website. Remove a page or ask your administrator to upgrade your plan.",
    "storage_mb": "Your plan's storage ({limit} MB) is full. Remove unused images or ask your administrator to upgrade your plan.",
    "submissions_month": "This form has reached its monthly limit. Please contact the organiser.",
}


def over_limit(plan: Optional[dict], key: str, new_total: float) -> Optional[str]:
    """A message when new_total would go past the plan's limit for key, else None. No plan = no limit."""
    limit = ((plan or {}).get("limits") or {}).get(key, UNLIMITED)
    if not isinstance(limit, (int, float)) or limit < 0 or new_total <= limit:
        return None
    return MESSAGES[key].format(limit=int(limit))
