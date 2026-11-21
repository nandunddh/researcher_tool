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

FORM_TYPES = ("contact", "form_button", "registration", "submission")
FIELD_TYPES = ("text", "email", "phone", "textarea", "select", "checkbox")
MAX_VALUE = 5000
EMAIL = re.compile(r"^[^\s@<>\"']{1,64}@[^\s@<>\"']{1,190}\.[A-Za-z]{2,}$")
PHONE = re.compile(r"^\+?[0-9 ()-]{5,30}$")

DEFAULT_CONTACT_FIELDS = [
    {"id": "name", "label": "Name", "type": "text", "required": True},
    {"id": "email", "label": "Email", "type": "email", "required": True},
    {"id": "message", "label": "Message", "type": "textarea", "required": True},
]


# Authors are entered separately; this is who we write back to.
DEFAULT_SUBMISSION_FIELDS = [{"id": "email", "label": "Your email (for the confirmation)", "type": "email", "required": True}]


def form_fields(section: dict) -> List[dict]:
    fields = (section.get("data") or {}).get("form_fields")
    if isinstance(fields, list) and fields:
        return [f for f in fields if isinstance(f, dict) and isinstance(f.get("id"), str)]
    if section.get("type") == "submission":
        return DEFAULT_SUBMISSION_FIELDS
    return DEFAULT_REGISTRATION_FIELDS if section.get("type") == "registration" else DEFAULT_CONTACT_FIELDS


def with_event(section: dict, event) -> dict:
    """A registration form whose site has Event details uses them: periods, currency, and the
    ticket types / add-ons / discount codes the form ticked (no list saved = all of them)."""
    if section.get("type") != "registration" or not isinstance(event, dict) or not event.get("tickets"):
        return section
    data = dict(section.get("data") or {})

    def pick(items, key):
        items = [i for i in items or [] if isinstance(i, dict)]
        chosen = data.get(key)
        return items if not isinstance(chosen, list) else [i for i in items if i.get("id") in chosen]

    basics = event.get("basics") if isinstance(event.get("basics"), dict) else {}
    data.update(currency=basics.get("currency") or "USD", periods=event.get("periods") or [],
                categories=pick(event["tickets"], "ticket_ids"), addons=pick(event.get("addons"), "addon_ids"),
                discount_codes=pick(event.get("discounts"), "discount_ids"))
    return {**section, "data": data}


def find_form(site: dict, form_id: str) -> Tuple[Optional[dict], Optional[str]]:
    """Finds a form section by id on any page. Returns (section, page_id)."""
    pages = site.get("pages") or []
    candidates = [(p.get("schema_json") or [], p.get("id")) for p in pages if isinstance(p, dict)]
    candidates.append((site.get("schema_json") or [], site.get("active_page_id")))
    for sections, page_id in candidates:
        for section in sections:
            if isinstance(section, dict) and section.get("id") == form_id and section.get("type") in FORM_TYPES:
                return with_event(section, site.get("event")), page_id
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
        try:
            if match.get("expires") and (today or date.today()) > date.fromisoformat(str(match["expires"])):
                return None, "This discount code has expired."
        except ValueError:
            pass
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
            (site_id, form_id, page_id, Json({**values, "_payment_token": token, "_payment_order": order})),
        )
        return cur.fetchone()[0], token


def receipt_number(prefix, n: int) -> str:
    clean = re.sub(r"[^A-Z0-9-]", "", str(prefix or "").upper())[:20] or "R-"
    return f"{clean}{n:04d}"


def mark_test_payment(site_id: str, submission_id: int, token: str, prefix: str = "") -> Optional[str]:
    """Test mode stand-in for Stripe: marks a registration as paid and issues the next receipt number for the site.
    Returns the receipt number, or None if the payment is not valid. shortcut: no real payment, replace with Stripe checkout + webhook."""
    with db.transaction() as cur:
        cur.execute(
            "UPDATE form_submissions SET status = 'paid (test)' WHERE id = %s AND site_id = %s AND form_type = 'registration' "
            "AND status = 'awaiting payment' AND data->>'_payment_token' = %s RETURNING id",
            (submission_id, site_id, token),
        )
        if not cur.fetchone():
            return None
        cur.execute("INSERT INTO receipt_counters (site_id, last) VALUES (%s, 1) "
                    "ON CONFLICT (site_id) DO UPDATE SET last = receipt_counters.last + 1 RETURNING last", (site_id,))
        number = receipt_number(prefix, cur.fetchone()[0])
        cur.execute("UPDATE form_submissions SET data = data || %s WHERE id = %s",
                    (Json({"_receipt": {"label": "Receipt", "value": number}, "_payment_paid_at": date.today().isoformat()}), submission_id))
    return number


def receipt(site: dict, submission_id: int, token: str) -> Optional[dict]:
    """Everything a receipt shows, for the person holding the payment link. None if not found or not paid."""
    with db.transaction() as cur:
        cur.execute("SELECT data, status FROM form_submissions WHERE id = %s AND site_id = %s AND form_type = 'registration'",
                    (submission_id, site.get("site_id")))
        row = cur.fetchone()
    if not row:
        return None
    data, status = row
    if not data.get("_receipt") or not secrets.compare_digest(str(data.get("_payment_token", "")), str(token or "")):
        return None
    event = site.get("event") if isinstance(site.get("event"), dict) else {}
    basics = event.get("basics") if isinstance(event.get("basics"), dict) else {}
    settings = event.get("receipts") if isinstance(event.get("receipts"), dict) else {}
    order = data.get("_payment_order") or {}
    try:
        rate = max(0.0, min(100.0, float(settings.get("tax_rate") or 0)))
    except (TypeError, ValueError):
        rate = 0.0
    total = float(order.get("total") or 0)
    return {
        "number": data["_receipt"]["value"], "paid_on": data.get("_payment_paid_at", ""), "status": status,
        "event": {k: basics.get(k, "") for k in ("name", "starts", "ends", "venue", "organiser", "address", "tax_id", "email")} | {"name": basics.get("name") or site.get("name", "")},
        "buyer": [v for k, v in data.items() if not k.startswith("_") and isinstance(v, dict) and v.get("value") not in ("", None, False)],
        "order": order,
        # Prices include tax: show the tax part of the total.
        "tax": {"label": str(settings.get("tax_label") or "Tax")[:20], "rate": rate, "amount": round(total * rate / (100 + rate), 2)} if rate else None,
        "note": str(settings.get("note") or "")[:2000],
    }



# ---------------------------------------------------------------- abstract / paper submissions
SUBMISSION_STATUSES = ("received", "under review", "accepted", "rejected", "withdrawn")
OWNER_STATUSES = SUBMISSION_STATUSES + ("new", "read", "replied", "awaiting payment", "paid (test)", "paid", "cancelled")
FILE_ID = re.compile(r"^[a-f0-9]{32}\.(pdf|docx|doc)$")


def sniff_document(head: bytes) -> Optional[str]:
    """File type from its content (the visitor's file name is not trusted): pdf, docx or doc."""
    if head.startswith(b"%PDF-"):
        return "pdf"
    if head.startswith(b"PK\x03\x04"):  # docx is a zip; the name check in the endpoint narrows it to .docx
        return "docx"
    if head.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"):
        return "doc"
    return None


def clean_paper(section: dict, payload: dict, event, today: Optional[date] = None) -> Tuple[Optional[Dict[str, object]], Optional[str]]:
    """Checks the abstract part of a submission (title, abstract, track, authors, file). Returns (values, None) or (None, message)."""
    data = section.get("data") or {}
    try:
        if data.get("closes") and (today or date.today()) > date.fromisoformat(str(data["closes"])):
            return None, "Submissions are closed."
    except ValueError:
        pass
    title = str(payload.get("title") or "").strip()[:300]
    abstract = str(payload.get("abstract") or "").strip()[:20000]
    if not title:
        return None, "Please enter the title."
    if not abstract:
        return None, "Please enter your abstract."
    limit = int(data.get("word_limit") or 0)
    words = len(abstract.split())
    if limit and words > limit:
        return None, f"Your abstract has {words} words; the limit is {limit}."
    tracks = [str(t.get("name")) for t in (event or {}).get("tracks") or [] if isinstance(t, dict) and t.get("name")]
    track = str(payload.get("track") or "").strip()
    if tracks and track not in tracks:
        return None, "Please choose a track."
    raw = payload.get("authors") if isinstance(payload.get("authors"), list) else []
    if not 1 <= len(raw) <= 20:
        return None, "Please add between 1 and 20 authors."
    authors = []
    for n, a in enumerate(raw, 1):
        a = a if isinstance(a, dict) else {}
        name, aff, mail = (str(a.get(k) or "").strip()[:200] for k in ("name", "affiliation", "email"))
        if not name:
            return None, f"Please enter the name of author {n}."
        if mail and not EMAIL.match(mail):
            return None, f"Please enter a valid email for author {n}."
        authors.append(f"{name}{f' ({aff})' if aff else ''}{f' <{mail}>' if mail else ''}{' · presenting' if a.get('presenting') is True else ''}")
    file_id = str(payload.get("file_id") or "")
    if file_id and not FILE_ID.match(file_id):
        return None, "The attached file is not valid. Please attach it again."
    if not file_id and data.get("file_mode", "optional") == "required":
        return None, "Please attach your file."
    values: Dict[str, object] = {"title": {"label": "Title", "value": title}}
    if tracks:
        values["track"] = {"label": "Track", "value": track}
    values["authors"] = {"label": "Authors", "value": "; ".join(authors)}
    values["abstract"] = {"label": f"Abstract ({words} words)", "value": abstract}
    if file_id:
        name = re.sub(r"[^\w .()-]", "", str(payload.get("file_name") or ""))[:120] or file_id
        values["_file"] = {"label": "File", "value": name, "id": file_id}
    return values, None


def save_paper(site_id: str, form_id: str, page_id: Optional[str], values: dict, prefix: str = "") -> str:
    """Saves a submission with the site's next submission number (ABS-0001…). Returns the number."""
    with db.transaction() as cur:
        cur.execute("INSERT INTO site_counters (site_id, name, last) VALUES (%s, 'submission', 1) "
                    "ON CONFLICT (site_id, name) DO UPDATE SET last = site_counters.last + 1 RETURNING last", (site_id,))
        number = receipt_number(prefix or "ABS-", cur.fetchone()[0])
        cur.execute("INSERT INTO form_submissions (site_id, form_id, form_type, page_id, data, status) VALUES (%s, %s, 'submission', %s, %s, 'received')",
                    (site_id, form_id, page_id, Json({"_submission": {"label": "Submission ID", "value": number}, **values})))
    return number


def set_status(site_id: str, submission_id: int, status: str) -> bool:
    if status not in OWNER_STATUSES:
        return False
    with db.transaction() as cur:
        cur.execute("UPDATE form_submissions SET status = %s WHERE id = %s AND site_id = %s", (status, submission_id, site_id))
        return cur.rowcount == 1


def submission_file(site_id: str, submission_id: int) -> Optional[dict]:
    with db.transaction() as cur:
        cur.execute("SELECT data->'_file' FROM form_submissions WHERE id = %s AND site_id = %s", (submission_id, site_id))
        row = cur.fetchone()
    return row[0] if row and isinstance(row[0], dict) and FILE_ID.match(str(row[0].get("id", ""))) else None
