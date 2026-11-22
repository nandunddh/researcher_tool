"""Self sign-up: details are held (password hashed) until the person enters the 6-digit code we email them."""
import hmac
import re
import secrets
from html import escape
from typing import Optional, Tuple

import db
from psycopg2.extras import Json
from license_manager import hash_password
from mailer import send_mail
from stores import session_key as _hash

LIFETIME_MINUTES = 10
MAX_ATTEMPTS = 5
EMAIL = re.compile(r"^[^\s@<>\"']{1,64}@[^\s@<>\"']{1,190}\.[A-Za-z]{2,}$")


def clean(body: dict) -> Tuple[Optional[dict], Optional[str]]:
    """Checks the sign-up form. Returns (details, None) or (None, message)."""
    name = str(body.get("name") or "").strip()[:120]
    email = str(body.get("email") or "").strip().lower()
    password = str(body.get("password") or "")
    kind = "org" if body.get("account_type") == "org" else "single"
    org = str(body.get("org_name") or "").strip()[:120]
    if not name:
        return None, "Please enter your name."
    if not EMAIL.match(email):
        return None, "Please enter a valid email address."
    if len(password) < 8:
        return None, "Use at least 8 characters for your password."
    if kind == "org" and not org:
        return None, "Please enter your organization's name."
    if body.get("accept_terms") is not True:
        return None, "Please accept the terms to continue."
    return {"name": name, "email": email, "account_type": kind, "org_name": org if kind == "org" else "",
            "plan_id": str(body.get("plan_id") or "free")[:40], "password_hash": hash_password(password)}, None


def _code_hash(email: str, code: str) -> str:
    return _hash(f"signup:{email}:{code.strip()}")


def start(details: dict) -> None:
    """Saves the pending sign-up (replacing an earlier one for this email) and emails the code."""
    code = f"{secrets.randbelow(10**6):06d}"
    with db.transaction() as cur:
        cur.execute("INSERT INTO signup_requests (email, payload, code_hash, attempts, expires_at) "
                    "VALUES (%s, %s, %s, 0, now() + make_interval(mins => %s)) "
                    "ON CONFLICT (email) DO UPDATE SET payload = EXCLUDED.payload, code_hash = EXCLUDED.code_hash, attempts = 0, "
                    "expires_at = EXCLUDED.expires_at, created_at = now()",
                    (details["email"], Json(details), _code_hash(details["email"], code), LIFETIME_MINUTES))
    send_mail(details["email"], f"{code} is your SciProspect sign-up code",
              f"Welcome to SciProspect, {details['name']}!\nYour code is {code}. It expires in {LIFETIME_MINUTES} minutes.\n\nIf you did not sign up, ignore this email.",
              f"<p>Welcome to SciProspect, {escape(details['name'])}!</p><p>Your sign-up code is:</p>"
              f"<p style=\"font-size:28px;font-weight:700;letter-spacing:6px;font-family:monospace\">{code}</p>"
              f"<p>It expires in {LIFETIME_MINUTES} minutes. If you did not sign up, you can ignore this email.</p>")


def verify(email: str, code: str) -> Tuple[Optional[dict], Optional[str]]:
    """Returns the sign-up details once the code is right (and removes the request). Wrong tries count; 5 cancel it."""
    email = (email or "").strip().lower()
    with db.transaction() as cur:
        cur.execute("SELECT payload, code_hash, attempts FROM signup_requests WHERE email = %s AND expires_at > now() FOR UPDATE", (email,))
        row = cur.fetchone()
        if not row:
            return None, "This code has expired. Please sign up again to get a new one."
        payload, stored, attempts = row
        if hmac.compare_digest(stored, _code_hash(email, code or "")):
            cur.execute("DELETE FROM signup_requests WHERE email = %s", (email,))
            return payload, None
        if attempts + 1 >= MAX_ATTEMPTS:
            cur.execute("DELETE FROM signup_requests WHERE email = %s", (email,))
            return None, "Too many wrong codes. Please sign up again to get a new code."
        cur.execute("UPDATE signup_requests SET attempts = attempts + 1 WHERE email = %s", (email,))
    return None, "That code is not right. Check the email and try again."
