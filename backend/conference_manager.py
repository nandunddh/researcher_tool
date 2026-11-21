"""
conference_manager.py
=====================
Manages SciStudio conference workspaces. PostgreSQL (`conferences` table) is the
only store. Provides stable conference IDs, workspace switching and website
associations.
"""

import re
import uuid
from datetime import datetime
from typing import List, Optional, Tuple

from psycopg2.extras import Json

import db

ADMIN_EMAILS = ("root@sciprospect.internal", "admin")


def _from_row(row) -> dict:
    conference_id, owner_email, data, created_at, updated_at = row
    conf = dict(data or {})
    conf.update({
        "conference_id": conference_id,
        "owner_email": owner_email,
        "owner_license_key": conf.get("owner_license_key", ""),
        "description": conf.get("description", ""),
        "created_at": created_at.isoformat() if created_at else conf.get("created_at", ""),
        "updated_at": updated_at.isoformat() if updated_at else conf.get("updated_at", ""),
    })
    return conf


_SELECT = "SELECT conference_id, owner_email, data, created_at, updated_at FROM conferences"


class ConferenceManager:
    """Manages the full lifecycle of conference workspaces."""

    def create_conference(self, name: str, owner_email: str, owner_license_key: str = "", description: str = "") -> dict:
        """Creates a new conference workspace with a stable, immutable ID."""
        clean_name = (name or "").strip()
        if not clean_name:
            raise ValueError("Conference name is required.")
        conf_id = f"conf_{uuid.uuid4().hex[:8]}"
        now_str = datetime.utcnow().isoformat()
        conf = {
            "conference_id": conf_id,
            "name": clean_name,
            "owner_email": (owner_email or "").strip().lower(),
            "owner_license_key": (owner_license_key or "").strip().upper(),
            "description": (description or "").strip(),
            "created_at": now_str,
            "updated_at": now_str,
        }
        with db.transaction() as cur:
            cur.execute(
                "INSERT INTO conferences (conference_id, owner_email, data) VALUES (%s, %s, %s)",
                (conf_id, conf["owner_email"], Json(conf)),
            )
        return conf

    def get_conference(self, conference_id: str) -> Optional[dict]:
        """Gets a conference by id."""
        clean_id = (conference_id or "").strip()
        if not re.fullmatch(r"conf_[a-f0-9]{8}", clean_id):
            return None
        with db.transaction() as cur:
            cur.execute(_SELECT + " WHERE conference_id = %s", (clean_id,))
            row = cur.fetchone()
        return _from_row(row) if row else None

    def list_conferences(self, owner_email: str = "", is_admin: bool = False, owner_license_key: str = "") -> List[dict]:
        """Lists conferences the owner (or their organisation) can access; all for the admin."""
        email = (owner_email or "").strip().lower()
        key = (owner_license_key or "").strip().upper()
        with db.transaction() as cur:
            if is_admin or email in ADMIN_EMAILS:
                cur.execute(_SELECT + " ORDER BY updated_at DESC")
            else:
                cur.execute(
                    _SELECT + " WHERE lower(owner_email) = %s OR (%s <> '' AND data->>'owner_license_key' = %s) ORDER BY updated_at DESC",
                    (email, key, key),
                )
            return [_from_row(r) for r in cur.fetchall()]

    def update_conference(self, conference_id: str, payload: dict) -> Tuple[bool, str, Optional[dict]]:
        """Updates a conference's name or description."""
        conf = self.get_conference(conference_id)
        if not conf:
            return False, "Conference not found.", None
        if "name" in payload and payload["name"]:
            conf["name"] = payload["name"].strip()
        if "description" in payload:
            conf["description"] = (payload["description"] or "").strip()
        conf["updated_at"] = datetime.utcnow().isoformat()
        with db.transaction() as cur:
            cur.execute("UPDATE conferences SET data = %s, updated_at = now() WHERE conference_id = %s", (Json(conf), conf["conference_id"]))
        return True, "Conference updated successfully.", conf

    def delete_conference(self, conference_id: str) -> Tuple[bool, str]:
        """Deletes a conference."""
        conf = self.get_conference(conference_id)
        if not conf:
            return False, "Conference not found."
        with db.transaction() as cur:
            cur.execute("DELETE FROM conferences WHERE conference_id = %s", (conf["conference_id"],))
        return True, "Conference deleted successfully."


class _LazyEngine:
    """Creates the manager on first use so importing this module never connects to the database."""
    def __init__(self, factory):
        self._factory, self._instance = factory, None

    def __getattr__(self, name):
        if self._instance is None:
            self._instance = self._factory()
        return getattr(self._instance, name)


conference_engine = _LazyEngine(ConferenceManager)
