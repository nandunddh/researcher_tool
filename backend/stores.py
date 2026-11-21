"""
stores.py
=========
Storage for accounts and login sessions. The application uses the PostgreSQL
stores. The in-memory stores exist only so automated tests run without a
database; instances created with the same name share data, which lets tests
simulate a server restart.
"""
from __future__ import annotations

import copy
import hashlib
import threading
from datetime import datetime, timezone
from typing import Dict, Optional

from psycopg2.extras import Json

import db

SETTINGS_KEY = "license_metadata"


def session_key(token: str) -> str:
    """Sessions are stored by a SHA-256 hash of the token, never the token itself."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _expiry(session: dict) -> datetime:
    try:
        return datetime.fromtimestamp(float(session.get("expires_at", 0)), tz=timezone.utc)
    except (TypeError, ValueError, OverflowError):
        return datetime.fromtimestamp(0, tz=timezone.utc)


# ---------------------------------------------------------------- PostgreSQL
class PgAccountStore:
    def is_empty(self) -> bool:
        with db.transaction() as cur:
            cur.execute("SELECT 1 FROM accounts LIMIT 1")
            return cur.fetchone() is None

    def load(self) -> dict:
        with db.transaction() as cur:
            cur.execute("SELECT value FROM app_settings WHERE key = %s", (SETTINGS_KEY,))
            row = cur.fetchone()
            metadata = row[0] if row else {}
            cur.execute("SELECT license_key, data FROM accounts")
            licenses = {key: data for key, data in cur.fetchall()}
        return {"_metadata": metadata, "licenses": licenses}

    def save(self, data: dict) -> None:
        licenses: Dict[str, dict] = data.get("licenses", {})
        with db.transaction() as cur:
            cur.execute(
                "INSERT INTO app_settings (key, value, updated_at) VALUES (%s, %s, now()) "
                "ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()",
                (SETTINGS_KEY, Json(data.get("_metadata", {}))),
            )
            for key, account in licenses.items():
                cur.execute(
                    "INSERT INTO accounts (license_key, email, data, updated_at) VALUES (%s, %s, %s, now()) "
                    "ON CONFLICT (license_key) DO UPDATE SET email = EXCLUDED.email, data = EXCLUDED.data, updated_at = now() "
                    "WHERE accounts.data IS DISTINCT FROM EXCLUDED.data",
                    (key, str(account.get("client_email", "")).strip().lower(), Json(account)),
                )
            cur.execute("DELETE FROM accounts WHERE NOT (license_key = ANY(%s))", (list(licenses.keys()),))


class PgSessionStore:
    def load_all(self) -> Dict[str, dict]:
        with db.transaction() as cur:
            cur.execute("DELETE FROM sessions WHERE expires_at < now()")
            cur.execute("SELECT token_hash, data FROM sessions")
            return {key: data for key, data in cur.fetchall()}

    def get(self, key: str) -> Optional[dict]:
        with db.transaction() as cur:
            cur.execute("SELECT data FROM sessions WHERE token_hash = %s AND expires_at >= now()", (key,))
            row = cur.fetchone()
            return row[0] if row else None

    def save_all(self, sessions: Dict[str, dict]) -> None:
        with db.transaction() as cur:
            for key, session in sessions.items():
                cur.execute(
                    "INSERT INTO sessions (token_hash, data, expires_at) VALUES (%s, %s, %s) "
                    "ON CONFLICT (token_hash) DO UPDATE SET data = EXCLUDED.data, expires_at = EXCLUDED.expires_at "
                    "WHERE sessions.data IS DISTINCT FROM EXCLUDED.data",
                    (key, Json(session), _expiry(session)),
                )
            cur.execute("DELETE FROM sessions WHERE NOT (token_hash = ANY(%s)) OR expires_at < now()", (list(sessions.keys()),))


# ---------------------------------------------------------------- in memory (tests only)
_memory: Dict[str, dict] = {}
_memory_lock = threading.Lock()


class MemoryAccountStore:
    def __init__(self, name: str):
        self.name = f"accounts:{name}"

    def is_empty(self) -> bool:
        return not _memory.get(self.name, {}).get("licenses")

    def load(self) -> dict:
        with _memory_lock:
            return copy.deepcopy(_memory.get(self.name, {"_metadata": {}, "licenses": {}}))

    def save(self, data: dict) -> None:
        with _memory_lock:
            _memory[self.name] = copy.deepcopy(data)


class MemorySessionStore:
    def __init__(self, name: str):
        self.name = f"sessions:{name}"

    def load_all(self) -> Dict[str, dict]:
        with _memory_lock:
            return copy.deepcopy(_memory.get(self.name, {}))

    def get(self, key: str) -> Optional[dict]:
        with _memory_lock:
            found = _memory.get(self.name, {}).get(key)
            return copy.deepcopy(found) if found else None

    def save_all(self, sessions: Dict[str, dict]) -> None:
        with _memory_lock:
            _memory[self.name] = copy.deepcopy(sessions)


def clear_memory_stores() -> None:
    with _memory_lock:
        _memory.clear()
