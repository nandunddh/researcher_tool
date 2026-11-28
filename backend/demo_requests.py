"""Book-a-demo requests: checked here, stored in demo_requests, read and updated by root."""
from __future__ import annotations

import re
from typing import Dict, List, Optional, Tuple

import db

EMAIL = re.compile(r"^[^\s@<>\"']{1,64}@[^\s@<>\"']{1,190}\.[A-Za-z]{2,}$")
INTERESTS = ("collect", "studio", "both", "custom")
STATUSES = ("new", "contacted", "done")
LIMITS = {"name": 120, "email": 254, "organization": 160, "message": 2000, "time": 80}


def _text(value: object, limit: int) -> str:
    return re.sub(r"\s+", " ", value).strip()[:limit] if isinstance(value, str) else ""


def clean(payload: object) -> Tuple[Optional[Dict[str, str]], Optional[str]]:
    """The request's values, or a message for the visitor. Unknown keys are ignored."""
    if not isinstance(payload, dict):
        return None, "Please fill in the form."
    if _text(payload.get("_hp"), 200):  # spam trap: a hidden field people never fill
        return None, "Your request could not be sent."
    name = _text(payload.get("name"), LIMITS["name"])
    email = _text(payload.get("email"), LIMITS["email"]).lower()
    if not name:
        return None, "Please enter your name."
    if not EMAIL.match(email):
        return None, "Please enter a valid email address."
    interest = payload.get("interest") if payload.get("interest") in INTERESTS else "both"
    message = payload.get("message")
    message = message.strip()[:LIMITS["message"]] if isinstance(message, str) else ""
    times = payload.get("times") if isinstance(payload.get("times"), list) else []
    times_text = " | ".join(t for t in (_text(t, LIMITS["time"]) for t in times[:2]) if t)
    return {"name": name, "email": email, "organization": _text(payload.get("organization"), LIMITS["organization"]),
            "interest": interest, "message": message, "times": times_text}, None


def save(values: Dict[str, str]) -> int:
    with db.transaction() as cur:
        cur.execute("INSERT INTO demo_requests (name, email, organization, interest, message, times) VALUES (%s, %s, %s, %s, %s, %s) RETURNING id",
                    (values["name"], values["email"], values["organization"], values["interest"], values["message"], values["times"]))
        return cur.fetchone()[0]


def list_all(limit: int = 500) -> List[dict]:
    with db.transaction() as cur:
        cur.execute("SELECT id, name, email, organization, interest, message, times, status, created_at FROM demo_requests ORDER BY created_at DESC LIMIT %s", (limit,))
        keys = ("id", "name", "email", "organization", "interest", "message", "times", "status", "created_at")
        return [{**dict(zip(keys, row)), "created_at": row[8].isoformat()} for row in cur.fetchall()]


def set_status(request_id: int, status: str) -> bool:
    if status not in STATUSES:
        raise ValueError("Unknown status.")
    with db.transaction() as cur:
        cur.execute("UPDATE demo_requests SET status = %s WHERE id = %s", (status, request_id))
        return cur.rowcount > 0
