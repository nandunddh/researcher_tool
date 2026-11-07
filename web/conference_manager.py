"""
conference_manager.py
=====================
Manages SciStudio Conference Workspaces across PostgreSQL and local storage.
Provides stable conference IDs, workspace switching, and website associations.
"""

import json
import os
import re
import uuid
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import psycopg2
from app_config import get_data_dir

# Oracle PostgreSQL Cloud Config (reused from builder_manager/license_manager)
PG_CONFIG = {
    "host": os.environ.get("SCIPROSPECT_DB_HOST", ""),
    "port": int(os.environ.get("SCIPROSPECT_DB_PORT", "5432")),
    "dbname": os.environ.get("SCIPROSPECT_DB_NAME", "postgres"),
    "user": os.environ.get("SCIPROSPECT_DB_USER", "postgres"),
    "password": os.environ.get("SCIPROSPECT_DB_PASS", ""),
    "connect_timeout": 3
}


def get_conferences_dir() -> Path:
    """Returns directory path where conference metadata is stored."""
    d = get_data_dir() / "conferences"
    d.mkdir(parents=True, exist_ok=True)
    return d


class ConferenceManager:
    """Manages full lifecycle of Conference workspaces."""

    def __init__(self):
        self._ensure_storage()

    def _ensure_storage(self):
        get_conferences_dir()
        try:
            if not PG_CONFIG["host"]:
                raise RuntimeError("Cloud database is not configured")
            with psycopg2.connect(**PG_CONFIG) as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        CREATE TABLE IF NOT EXISTS user_conferences (
                            conference_id VARCHAR(64) PRIMARY KEY,
                            owner_email VARCHAR(255) NOT NULL,
                            owner_license_key VARCHAR(64),
                            name VARCHAR(255) NOT NULL,
                            description TEXT DEFAULT '',
                            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                        );
                    """)
                    conn.commit()
        except Exception as e:
            # Cloud DB optional in local / offline mode
            pass

    def _get_local_file(self, conference_id: str) -> Path:
        return get_conferences_dir() / f"{conference_id}.json"

    def create_conference(
        self,
        name: str,
        owner_email: str,
        owner_license_key: str = "",
        description: str = ""
    ) -> dict:
        """
        Creates a new conference workspace with a stable immutable ID.
        """
        clean_name = (name or "").strip()
        if not clean_name:
            raise ValueError("Conference name is required.")

        conf_id = f"conf_{uuid.uuid4().hex[:8]}"
        now_str = datetime.utcnow().isoformat()
        clean_email = (owner_email or "").strip().lower()
        clean_key = (owner_license_key or "").strip().upper()

        conf_data = {
            "conference_id": conf_id,
            "name": clean_name,
            "owner_email": clean_email,
            "owner_license_key": clean_key,
            "description": (description or "").strip(),
            "created_at": now_str,
            "updated_at": now_str
        }

        # 1. Local storage
        conf_file = self._get_local_file(conf_id)
        conf_file.write_text(json.dumps(conf_data, indent=2), encoding="utf-8")

        # 2. Cloud storage (if configured)
        try:
            if PG_CONFIG["host"]:
                with psycopg2.connect(**PG_CONFIG) as conn:
                    with conn.cursor() as cur:
                        cur.execute("""
                            INSERT INTO user_conferences (conference_id, owner_email, owner_license_key, name, description, created_at, updated_at)
                            VALUES (%s, %s, %s, %s, %s, NOW(), NOW())
                            ON CONFLICT (conference_id) DO UPDATE SET
                                name = EXCLUDED.name,
                                description = EXCLUDED.description,
                                updated_at = NOW();
                        """, (conf_id, clean_email, clean_key, clean_name, conf_data["description"]))
                        conn.commit()
        except Exception as e:
            pass

        return conf_data

    def get_conference(self, conference_id: str) -> Optional[dict]:
        """Gets full conference record by conference_id."""
        clean_id = (conference_id or "").strip()
        if not clean_id or not re.fullmatch(r"conf_[a-f0-9]{8}", clean_id):
            return None

        # 1. Try PostgreSQL
        try:
            if PG_CONFIG["host"]:
                with psycopg2.connect(**PG_CONFIG) as conn:
                    with conn.cursor() as cur:
                        cur.execute("""
                            SELECT conference_id, owner_email, owner_license_key, name, description, created_at, updated_at
                            FROM user_conferences WHERE conference_id = %s;
                        """, (clean_id,))
                        row = cur.fetchone()
                        if row:
                            return {
                                "conference_id": row[0],
                                "owner_email": row[1],
                                "owner_license_key": row[2] or "",
                                "name": row[3],
                                "description": row[4] or "",
                                "created_at": str(row[5]),
                                "updated_at": str(row[6])
                            }
        except Exception:
            pass

        # 2. Local Fallback
        conf_file = self._get_local_file(clean_id)
        if conf_file.exists():
            try:
                return json.loads(conf_file.read_text(encoding="utf-8"))
            except Exception:
                pass
        return None

    def list_conferences(
        self,
        owner_email: str = "",
        is_admin: bool = False,
        owner_license_key: str = ""
    ) -> List[dict]:
        """Lists all conferences accessible to the owner or team."""
        conferences = []
        clean_email = (owner_email or "").strip().lower()
        clean_key = (owner_license_key or "").strip().upper()

        # 1. Try PostgreSQL
        try:
            if PG_CONFIG["host"]:
                with psycopg2.connect(**PG_CONFIG) as conn:
                    with conn.cursor() as cur:
                        if is_admin or clean_email in ("root@sciprospect.internal", "admin"):
                            cur.execute("SELECT conference_id, owner_email, owner_license_key, name, description, created_at, updated_at FROM user_conferences ORDER BY updated_at DESC;")
                        else:
                            cur.execute("""
                                SELECT conference_id, owner_email, owner_license_key, name, description, created_at, updated_at
                                FROM user_conferences
                                WHERE LOWER(owner_email) = %s OR (owner_license_key <> '' AND owner_license_key = %s)
                                ORDER BY updated_at DESC;
                            """, (clean_email, clean_key))
                        rows = cur.fetchall()
                        for r in rows:
                            conferences.append({
                                "conference_id": r[0],
                                "owner_email": r[1],
                                "owner_license_key": r[2] or "",
                                "name": r[3],
                                "description": r[4] or "",
                                "created_at": str(r[5]),
                                "updated_at": str(r[6])
                            })
                        return conferences
        except Exception:
            pass

        # 2. Local Fallback
        c_dir = get_conferences_dir()
        for f in c_dir.glob("conf_*.json"):
            try:
                conf = json.loads(f.read_text(encoding="utf-8"))
                if is_admin or clean_email in ("root@sciprospect.internal", "admin"):
                    conferences.append(conf)
                else:
                    conf_owner = conf.get("owner_email", "").strip().lower()
                    conf_key = conf.get("owner_license_key", "").strip().upper()
                    if (clean_email and conf_owner == clean_email) or (clean_key and conf_key == clean_key):
                        conferences.append(conf)
            except Exception:
                pass

        conferences.sort(key=lambda c: c.get("updated_at", ""), reverse=True)
        return conferences

    def update_conference(self, conference_id: str, payload: dict) -> Tuple[bool, str, Optional[dict]]:
        """Updates conference workspace name or description."""
        conf = self.get_conference(conference_id)
        if not conf:
            return False, "Conference not found.", None

        if "name" in payload and payload["name"]:
            conf["name"] = payload["name"].strip()
        if "description" in payload:
            conf["description"] = payload["description"].strip()

        conf["updated_at"] = datetime.utcnow().isoformat()

        # Save local
        conf_file = self._get_local_file(conference_id)
        conf_file.write_text(json.dumps(conf, indent=2), encoding="utf-8")

        # Save PG
        try:
            if PG_CONFIG["host"]:
                with psycopg2.connect(**PG_CONFIG) as conn:
                    with conn.cursor() as cur:
                        cur.execute("""
                            UPDATE user_conferences
                            SET name = %s, description = %s, updated_at = NOW()
                            WHERE conference_id = %s;
                        """, (conf["name"], conf.get("description", ""), conference_id))
                        conn.commit()
        except Exception:
            pass

        return True, "Conference updated successfully.", conf

    def delete_conference(self, conference_id: str) -> Tuple[bool, str]:
        """Deletes a conference record locally and from PostgreSQL."""
        conf = self.get_conference(conference_id)
        if not conf:
            return False, "Conference not found."

        # Delete local
        conf_file = self._get_local_file(conference_id)
        if conf_file.exists():
            conf_file.unlink()

        # Delete PG
        try:
            if PG_CONFIG["host"]:
                with psycopg2.connect(**PG_CONFIG) as conn:
                    with conn.cursor() as cur:
                        cur.execute("DELETE FROM user_conferences WHERE conference_id = %s;", (conference_id,))
                        conn.commit()
        except Exception:
            pass

        return True, "Conference deleted successfully."


conference_engine = ConferenceManager()

