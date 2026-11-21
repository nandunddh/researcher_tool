"""Two-step sign-in with an authenticator app (TOTP, RFC 6238: 6 digits, 30 seconds) plus one-time backup codes."""
import base64
import hashlib
import hmac
import secrets
import struct
import time
from urllib.parse import quote

import db
from psycopg2.extras import Json

ISSUER = "SciProspect"
BACKUP_COUNT = 8


# ---------------------------------------------------------------- pure helpers
def totp(secret: str, step: int) -> str:
    key = base64.b32decode(secret.upper() + "=" * (-len(secret) % 8))
    digest = hmac.new(key, struct.pack(">Q", step), hashlib.sha1).digest()
    offset = digest[-1] & 15
    return f"{(struct.unpack('>I', digest[offset:offset + 4])[0] & 0x7FFFFFFF) % 1_000_000:06d}"


def matching_step(secret: str, code: str, last_step: int, now: float = None):
    """Returns the time step the code belongs to (one step of clock drift allowed), or None.
    Steps at or before last_step are refused, so a code can't be used twice."""
    code = "".join(ch for ch in str(code) if ch.isdigit())
    if len(code) != 6:
        return None
    current = int((time.time() if now is None else now) // 30)
    for step in (current - 1, current, current + 1):
        if step > last_step and hmac.compare_digest(totp(secret, step), code):
            return step
    return None


def _backup_hash(code: str) -> str:
    return hashlib.sha256(code.strip().lower().replace("-", "").encode()).hexdigest()


def new_backup_codes():
    codes = [f"{c[:5]}-{c[5:]}" for c in (secrets.token_hex(5) for _ in range(BACKUP_COUNT))]
    return codes, [_backup_hash(c) for c in codes]


def otpauth_uri(secret: str, account_label: str) -> str:
    return f"otpauth://totp/{quote(ISSUER)}:{quote(account_label)}?secret={secret}&issuer={quote(ISSUER)}"


def qr_svg(uri: str) -> str:
    import segno
    return segno.make(uri, error="m").svg_data_uri(scale=5, border=2)


# ---------------------------------------------------------------- storage
# shortcut: the TOTP secret is stored as-is (it must be readable to check codes); encrypt it with a server key if the DB is ever shared.
def is_enabled(user_key: str) -> bool:
    with db.transaction() as cur:
        cur.execute("SELECT 1 FROM mfa WHERE user_key = %s AND enabled_at IS NOT NULL", (user_key,))
        return cur.fetchone() is not None


def start_setup(user_key: str, account_label: str):
    """New secret waiting for confirmation. Returns None if two-step sign-in is already on."""
    if is_enabled(user_key):
        return None
    secret = base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")
    with db.transaction() as cur:
        cur.execute("INSERT INTO mfa (user_key, secret) VALUES (%s, %s) ON CONFLICT (user_key) DO UPDATE "
                    "SET secret = EXCLUDED.secret, backup_hashes = '[]', last_step = 0, updated_at = now() WHERE mfa.enabled_at IS NULL",
                    (user_key, secret))
    uri = otpauth_uri(secret, account_label)
    return {"secret": secret, "otpauth_uri": uri, "qr": qr_svg(uri)}


def enable(user_key: str, code: str):
    """Turns it on if the code matches the pending secret. Returns the backup codes (shown once), or None."""
    with db.transaction() as cur:
        cur.execute("SELECT secret, last_step FROM mfa WHERE user_key = %s AND enabled_at IS NULL FOR UPDATE", (user_key,))
        row = cur.fetchone()
        step = row and matching_step(row[0], code, row[1])
        if not step:
            return None
        codes, hashes = new_backup_codes()
        cur.execute("UPDATE mfa SET enabled_at = now(), last_step = %s, backup_hashes = %s, updated_at = now() WHERE user_key = %s",
                    (step, Json(hashes), user_key))
    return codes


def verify(user_key: str, code: str) -> bool:
    """Checks an app code or a backup code (each backup code works once)."""
    with db.transaction() as cur:
        cur.execute("SELECT secret, last_step, backup_hashes FROM mfa WHERE user_key = %s AND enabled_at IS NOT NULL FOR UPDATE", (user_key,))
        row = cur.fetchone()
        if not row:
            return False
        secret, last_step, hashes = row
        step = matching_step(secret, code, last_step)
        if step:
            cur.execute("UPDATE mfa SET last_step = %s WHERE user_key = %s", (step, user_key))
            return True
        wanted = _backup_hash(str(code or ""))
        if any(hmac.compare_digest(wanted, h) for h in hashes):
            cur.execute("UPDATE mfa SET backup_hashes = %s, updated_at = now() WHERE user_key = %s",
                        (Json([h for h in hashes if h != wanted]), user_key))
            return True
    return False


def disable(user_key: str, code: str) -> bool:
    if not verify(user_key, code):
        return False
    with db.transaction() as cur:
        cur.execute("DELETE FROM mfa WHERE user_key = %s", (user_key,))
    return True
