"""One-time password reset links (30 minutes, single use, stored as token hashes)."""
import os
import secrets
from html import escape

import db
from mailer import send_mail
from stores import session_key as token_hash

LIFETIME_MINUTES = 30


def create_link(email: str) -> str:
    token = secrets.token_urlsafe(32)
    with db.transaction() as cur:
        # Older unused links for this email stop working once a new one is requested.
        cur.execute("UPDATE password_resets SET used_at = now() WHERE lower(email) = lower(%s) AND used_at IS NULL", (email,))
        cur.execute("INSERT INTO password_resets (token_hash, email, expires_at) VALUES (%s, %s, now() + make_interval(mins => %s))",
                    (token_hash(token), email.strip().lower(), LIFETIME_MINUTES))
    return f"{os.environ.get('SCIPROSPECT_APP_URL', 'http://127.0.0.1:3000').rstrip('/')}/reset-password?token={token}"


def send_link(email: str) -> None:
    link = create_link(email)
    text = f"Use this link to set a new SciProspect password (valid for {LIFETIME_MINUTES} minutes):\n{link}\n\nIf you did not ask for this, ignore this email."
    html = (f"<p>Use the button below to set a new SciProspect password. The link works once and expires in {LIFETIME_MINUTES} minutes.</p>"
            f"<p><a href=\"{escape(link, quote=True)}\" style=\"background:#5a45d6;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none\">Set new password</a></p>"
            "<p>If you did not ask for this, you can ignore this email.</p>")
    send_mail(email, "Reset your SciProspect password", text, html)


def use_token(token: str):
    """Marks a valid token as used and returns its email, or None if invalid, expired or already used."""
    with db.transaction() as cur:
        cur.execute("UPDATE password_resets SET used_at = now() WHERE token_hash = %s AND used_at IS NULL AND expires_at > now() RETURNING email",
                    (token_hash(token or ""),))
        row = cur.fetchone()
    return row[0] if row else None
