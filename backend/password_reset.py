"""One-time password reset codes: 6 digits, 10 minutes, single use, 5 tries, stored only as hashes."""
import hmac
import secrets

import db
from mailer import send_mail
from stores import session_key as _hash

LIFETIME_MINUTES = 10
MAX_ATTEMPTS = 5


def _code_hash(email: str, code: str) -> str:
    # Hash with the email so equal codes for different people never collide.
    return _hash(f"{email.strip().lower()}:{code.strip()}")


def create_code(email: str) -> str:
    code = f"{secrets.randbelow(10**6):06d}"
    with db.transaction() as cur:
        # Older unused codes for this email stop working once a new one is requested.
        cur.execute("UPDATE password_resets SET used_at = now() WHERE lower(email) = lower(%s) AND used_at IS NULL", (email,))
        cur.execute("INSERT INTO password_resets (token_hash, email, expires_at) VALUES (%s, %s, now() + make_interval(mins => %s))",
                    (_code_hash(email, code), email.strip().lower(), LIFETIME_MINUTES))
    return code


def send_code(email: str) -> None:
    code = create_code(email)
    text = (f"Your SciProspect password reset code is {code}\n\nIt expires in {LIFETIME_MINUTES} minutes. "
            "If you did not ask for this, ignore this email.")
    html = (f"<p>Your SciProspect password reset code is:</p>"
            f"<p style=\"font-size:28px;font-weight:700;letter-spacing:6px;font-family:monospace\">{code}</p>"
            f"<p>It works once and expires in {LIFETIME_MINUTES} minutes. If you did not ask for this, you can ignore this email.</p>")
    send_mail(email, f"{code} is your SciProspect reset code", text, html)


def use_code(email: str, code: str):
    """Returns the email if the code is right (and marks it used), else None. Wrong tries count; 5 kill the code."""
    email = (email or "").strip().lower()
    with db.transaction() as cur:
        cur.execute("SELECT token_hash, attempts FROM password_resets WHERE lower(email) = %s AND used_at IS NULL AND expires_at > now() "
                    "ORDER BY created_at DESC LIMIT 1 FOR UPDATE", (email,))
        row = cur.fetchone()
        if not row:
            return None
        stored, attempts = row
        if hmac.compare_digest(stored, _code_hash(email, code or "")):
            cur.execute("UPDATE password_resets SET used_at = now() WHERE token_hash = %s", (stored,))
            return email
        cur.execute("UPDATE password_resets SET attempts = attempts + 1, used_at = CASE WHEN attempts + 1 >= %s THEN now() END "
                    "WHERE token_hash = %s", (MAX_ATTEMPTS, stored))
    return None
