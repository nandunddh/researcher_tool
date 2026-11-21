"""
forms.py
========
Website form submissions. A form is a section in the site document; its fields
(`data.form_fields`) define what visitors may send. Submissions are checked
against those fields and stored in PostgreSQL (`form_submissions`).
"""
import re
from typing import Dict, List, Optional, Tuple

from psycopg2.extras import Json

import db

FORM_TYPES = ("contact", "form_button", "registration")
FIELD_TYPES = ("text", "email", "phone", "textarea", "select", "checkbox")
MAX_VALUE = 5000
EMAIL = re.compile(r"^[^\s@<>\"']{1,64}@[^\s@<>\"']{1,190}\.[A-Za-z]{2,}$")
PHONE = re.compile(r"^\+?[0-9 ()-]{5,30}$")

DEFAULT_CONTACT_FIELDS = [
    {"id": "name", "label": "Name", "type": "text", "required": True},
    {"id": "email", "label": "Email", "type": "email", "required": True},
    {"id": "message", "label": "Message", "type": "textarea", "required": True},
]


def form_fields(section: dict) -> List[dict]:
    fields = (section.get("data") or {}).get("form_fields")
    if isinstance(fields, list) and fields:
        return [f for f in fields if isinstance(f, dict) and isinstance(f.get("id"), str)]
    return DEFAULT_REGISTRATION_FIELDS if section.get("type") == "registration" else DEFAULT_CONTACT_FIELDS


def find_form(site: dict, form_id: str) -> Tuple[Optional[dict], Optional[str]]:
    """Finds a form section by id on any page. Returns (section, page_id)."""
    pages = site.get("pages") or []
    candidates = [(p.get("schema_json") or [], p.get("id")) for p in pages if isinstance(p, dict)]
    candidates.append((site.get("schema_json") or [], site.get("active_page_id")))
    for sections, page_id in candidates:
        for section in sections:
            if isinstance(section, dict) and section.get("id") == form_id and section.get("type") in FORM_TYPES:
                return section, page_id
    return None, None


def clean_submission(section: dict, payload: dict) -> Tuple[Optional[Dict[str, object]], Optional[str]]:
    """Checks a visitor's values against the form's fields. Unknown keys are dropped.
    Returns (clean values, None) or (None, message for the visitor)."""
    if not isinstance(payload, dict):
        return None, "Invalid form data."
    if str(payload.get("_hp", "")).strip():  # spam trap: hidden field real visitors never fill
        return None, "Your message could not be sent."
    values: Dict[str, object] = {}
    for field in form_fields(section):
        label = str(field.get("label") or field["id"])[:200]
        raw = payload.get(field["id"])
        ftype = field.get("type") if field.get("type") in FIELD_TYPES else "text"
        if ftype == "checkbox":
            value: object = raw is True
            if field.get("required") and not value:
                return None, f"Please tick “{label}”."
        else:
            value = str(raw).strip()[:MAX_VALUE] if isinstance(raw, (str, int, float)) else ""
            if not value:
                if field.get("required"):
                    return None, f"Please fill in “{label}”."
            elif ftype == "email" and not EMAIL.match(value):
                return None, f"Please enter a valid email for “{label}”."
            elif ftype == "phone" and not PHONE.match(value):
                return None, f"Please enter a valid phone number for “{label}”."
            elif ftype == "select":
                options = [str(o) for o in (field.get("options") or [])]
                if options and value not in options:
                    return None, f"Please choose an option for “{label}”."
        values[field["id"]] = {"label": label, "value": value}
    return values, None


def save_submission(site_id: str, form_id: str, form_type: str, page_id: Optional[str], values: dict) -> int:
    with db.transaction() as cur:
        cur.execute(
            "INSERT INTO form_submissions (site_id, form_id, form_type, page_id, data) VALUES (%s, %s, %s, %s, %s) RETURNING id",
            (site_id, form_id, form_type, page_id, Json(values)),
        )
        return cur.fetchone()[0]


def list_submissions(site_id: str, limit: int = 500) -> List[dict]:
    with db.transaction() as cur:
        cur.execute(
            "SELECT id, form_id, form_type, page_id, data, status, created_at FROM form_submissions "
            "WHERE site_id = %s ORDER BY created_at DESC LIMIT %s",
            (site_id, limit),
        )
        return [{
            "id": r[0], "form_id": r[1], "form_type": r[2], "page_id": r[3],
            "data": {k: v for k, v in (r[4] or {}).items() if not k.startswith("_payment")},
            "status": r[5], "created_at": r[6].isoformat(),
        } for r in cur.fetchall()]


# ---------------------------------------------------------------- registration pricing
from datetime import date  # noqa: E402
import secrets  # noqa: E402

DEFAULT_REGISTRATION_FIELDS = [
    {"id": "name", "label": "Full name", "type": "text", "required": True},
    {"id": "email", "label": "Email", "type": "email", "required": True},
    {"id": "organization", "label": "Organization", "type": "text", "required": True},
    {"id": "phone", "label": "Phone", "type": "phone", "required": False},
    {"id": "country", "label": "Country", "type": "text", "required": True},
]


def _money(v) -> float:
    try:
        return max(0.0, round(float(v), 2))
    except (TypeError, ValueError):
        return 0.0


def _price(v) -> Optional[float]:
    """A price cell: a number, or None when the type is not offered in that period (left blank)."""
    if v is None or (isinstance(v, str) and not v.strip()):
        return None
    try:
        return max(0.0, round(float(v), 2))
    except (TypeError, ValueError):
        return None


def periods(data: dict) -> List[dict]:
    """The owner's price periods in date order; a period without an end date runs until registration closes (last)."""
    items = [p for p in data.get("periods") or [] if isinstance(p, dict) and p.get("id")]
    return sorted(items, key=lambda p: (not p.get("ends"), str(p.get("ends") or "")))


def current_period(data: dict, today: date) -> Optional[dict]:
    """The first period that has not ended yet, or None when registration is closed."""
    for period in periods(data):
        try:
            if not period.get("ends") or today <= date.fromisoformat(str(period["ends"])):
                return period
        except ValueError:
            continue
    return None


def quote(section: dict, payload: dict, today: Optional[date] = None) -> Tuple[Optional[dict], Optional[str]]:
    """Server-side price for a registration. Prices and discount codes come only from the saved form."""
    data = section.get("data") or {}
    period = current_period(data, today or date.today())
    if not period:
        return None, "Registration is closed."
    category = next((c for c in data.get("categories") or [] if isinstance(c, dict) and c.get("id") == payload.get("category")), None)
    if not category:
        return None, "Please choose a registration type."
    prices = category.get("prices") if isinstance(category.get("prices"), dict) else {}
    base = _price(prices.get(period["id"]))
    if base is None:
        return None, f"{category.get('name', 'This type')} is not available during {period.get('name', 'this period')}."
    lines = [{"label": f"{category.get('name', 'Registration')} ({period.get('name', '')})", "amount": base}]
    quantities = payload.get("addons") if isinstance(payload.get("addons"), dict) else {}
    for addon in data.get("addons") or []:
        if not isinstance(addon, dict):
            continue
        try:
            qty = int(quantities.get(addon.get("id"), 0))
        except (TypeError, ValueError):
            qty = 0
        qty = max(0, min(qty, int(addon.get("max") or 10)))
        if qty:
            lines.append({"label": f"{addon.get('name', 'Add-on')} × {qty}", "amount": round(_money(addon.get("price")) * qty, 2)})
    subtotal = round(sum(l["amount"] for l in lines), 2)
    discount, code = 0.0, str(payload.get("discount_code") or "").strip().upper()
    if code:
        match = next((d for d in data.get("discount_codes") or [] if isinstance(d, dict) and str(d.get("code", "")).strip().upper() == code), None)
        if not match:
            return None, "This discount code is not valid."
        # A fixed amount wins over a percentage when both are set.
        fixed = _money(match.get("amount"))
        discount = min(subtotal, fixed) if fixed else round(subtotal * min(100.0, _money(match.get("percent"))) / 100, 2)
    return {
        "currency": str(data.get("currency") or "USD")[:3].upper(), "period": period["id"], "lines": lines,
        "subtotal": subtotal, "discount": discount, "discount_code": code if discount else "", "total": round(subtotal - discount, 2),
    }, None


def order_summary(order: dict) -> str:
    parts = [f"{l['label']} {order['currency']} {l['amount']:.2f}" for l in order["lines"]]
    if order["discount"]:
        parts.append(f"Discount {order['discount_code']} -{order['discount']:.2f}")
    return "; ".join(parts) + f" = {order['currency']} {order['total']:.2f}"


def save_registration(site_id: str, form_id: str, page_id: Optional[str], values: dict, order: dict) -> Tuple[int, str]:
    token = secrets.token_urlsafe(16)
    values = {**values, "_order": {"label": "Order", "value": order_summary(order)}, "_total": {"label": "Total", "value": f"{order['currency']} {order['total']:.2f}"}}
    with db.transaction() as cur:
        cur.execute(
            "INSERT INTO form_submissions (site_id, form_id, form_type, page_id, data, status) VALUES (%s, %s, 'registration', %s, %s, 'awaiting payment') RETURNING id",
            (site_id, form_id, page_id, Json({**values, "_payment_token": token})),
        )
        return cur.fetchone()[0], token


def mark_test_payment(site_id: str, submission_id: int, token: str) -> bool:
    """Test mode stand-in for Stripe: marks a registration as paid. shortcut: no real payment, replace with Stripe checkout + webhook."""
    with db.transaction() as cur:
        cur.execute(
            "UPDATE form_submissions SET status = 'paid (test)' WHERE id = %s AND site_id = %s AND form_type = 'registration' "
            "AND status = 'awaiting payment' AND data->>'_payment_token' = %s",
            (submission_id, site_id, token),
        )
        return cur.rowcount == 1
