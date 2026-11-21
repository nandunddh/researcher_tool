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

FORM_TYPES = ("contact", "form_button")
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
    return DEFAULT_CONTACT_FIELDS


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
            "id": r[0], "form_id": r[1], "form_type": r[2], "page_id": r[3], "data": r[4],
            "status": r[5], "created_at": r[6].isoformat(),
        } for r in cur.fetchall()]
