"""
license_manager.py
==================
Central License and User Account Management Engine for SciProspect.
Allows the Root User to:
1. Issue new Trial and Pro accounts with custom quotas & expiration dates.
2. Generate secure, human-readable License Keys (e.g., SCIP-TR-XXXX-XXXX or SCIP-PRO-XXXX-XXXX).
3. Instantly STOP / SUSPEND any user account at any time (remote kill switch).
4. RESUME / RE-ACTIVATE stopped accounts.
5. Extend trial durations or upgrade accounts from Trial to Pro.
6. Validate licenses locally and remotely for client desktop & web apps.
"""

import json
import os
import secrets
import string
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Tuple

# Default Root Admin Password
DEFAULT_ROOT_PASSWORD = os.environ.get("SCIPROSPECT_ROOT_PASS", "")

import hashlib
import time

def hash_password(password: str) -> str:
    """Hashes a password with a random cryptographic salt."""
    if not password:
        return ""
    salt = secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("ascii"), 600000).hex()
    return f"pbkdf2_sha256$600000${salt}${h}"

def verify_password(password: str, stored_hash: str) -> bool:
    """Verifies a raw password against stored salt:hash string."""
    if stored_hash and stored_hash.startswith("pbkdf2_sha256$"):
        try:
            _, rounds, salt, digest = stored_hash.split("$")
            expected = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("ascii"), int(rounds)).hex()
            return secrets.compare_digest(expected, digest)
        except (ValueError, TypeError):
            return False
    if not stored_hash or ":" not in stored_hash:
        return False
    try:
        salt, h = stored_hash.split(":", 1)
        expected = hashlib.sha256((salt + password).encode("utf-8")).hexdigest()
        return secrets.compare_digest(expected, h)
    except Exception:
        return False


BASE_DIR = Path(__file__).resolve().parent
LICENSES_FILE = BASE_DIR / "licenses.json"

# Cloud Database Configuration (Oracle Cloud PostgreSQL)
PG_CONFIG = {
    "host": os.environ.get("SCIPROSPECT_DB_HOST", ""),
    "port": int(os.environ.get("SCIPROSPECT_DB_PORT", "5432")),
    "dbname": os.environ.get("SCIPROSPECT_DB_NAME", "sciprospect_db"),
    "user": os.environ.get("SCIPROSPECT_DB_USER", ""),
    "password": os.environ.get("SCIPROSPECT_DB_PASSWORD", ""),
    "connect_timeout": 3,
}



def _generate_key(prefix: str = "SCIP", tier: str = "TR") -> str:
    """Generates a clean, 16-character license key like SCIP-TR-4A9B-8C2D."""
    chars = string.ascii_uppercase + string.digits
    # Exclude confusing chars like 0/O, 1/I
    clean_chars = [c for c in chars if c not in ("O", "0", "I", "1")]
    part1 = "".join(secrets.choice(clean_chars) for _ in range(4))
    part2 = "".join(secrets.choice(clean_chars) for _ in range(4))
    tier_tag = "PRO" if tier.lower() == "pro" else "TR"
    return f"{prefix}-{tier_tag}-{part1}-{part2}"


class LicenseManager:
    def __init__(self, db_path: Path = LICENSES_FILE, sessions_path: Optional[Path] = None):
        self.db_path = Path(db_path)
        if sessions_path:
            self.sessions_path = Path(sessions_path)
        elif self.db_path.name == "licenses.json":
            self.sessions_path = self.db_path.parent / "sessions.json"
        else:
            self.sessions_path = self.db_path.parent / f"{self.db_path.stem}_sessions.json"
        self._last_sessions_mtime = 0.0
        self._sessions = self._load_sessions()
        self._ensure_db()

    def _load_sessions(self) -> dict:
        """Loads sessions from the persisted sessions file."""
        if not self.sessions_path.exists():
            return {}
        try:
            self._last_sessions_mtime = self.sessions_path.stat().st_mtime
            with open(self.sessions_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                raw_sessions = data.get("sessions", {}) if isinstance(data, dict) and "sessions" in data else (data if isinstance(data, dict) else {})
                return {k: v for k, v in raw_sessions.items() if isinstance(v, dict)}
        except Exception as e:
            print(f"[LICENSE] Warning: Failed to load sessions from {self.sessions_path}: {e}")
            return {}

    def _save_sessions(self):
        """Persists sessions to disk atomically so sessions survive server reloads/updates."""
        try:
            self.sessions_path.parent.mkdir(parents=True, exist_ok=True)
            payload = {
                "_metadata": {
                    "version": "1.0",
                    "updated_at": datetime.utcnow().isoformat()
                },
                "sessions": self._sessions
            }
            temp_file = self.sessions_path.with_suffix(".tmp")
            with open(temp_file, "w", encoding="utf-8") as f:
                json.dump(payload, f, indent=2)
            try:
                temp_file.replace(self.sessions_path)
            except Exception:
                with open(self.sessions_path, "w", encoding="utf-8") as f:
                    json.dump(payload, f, indent=2)
                try:
                    temp_file.unlink(missing_ok=True)
                except Exception:
                    pass
            try:
                self._last_sessions_mtime = self.sessions_path.stat().st_mtime
            except Exception:
                pass
        except Exception as e:
            print(f"[LICENSE] Warning: Failed to persist sessions to {self.sessions_path}: {e}")

    def _ensure_db(self):
        """Initializes licenses.json with default root config and sample active keys if missing."""
        if not self.db_path.exists():
            default_data = {
                "_metadata": {
                    "version": "1.0",
                    "updated_at": datetime.utcnow().isoformat(),
                    "root_password_hash": hash_password(DEFAULT_ROOT_PASSWORD),
                },
                "licenses": {
                    "SCIP-PRO-ROOT-MASTER": {
                        "license_key": "SCIP-PRO-ROOT-MASTER",
                        "client_name": "Root Administrator",
                        "client_email": "root@sciprospect.internal",
                        "tier": "pro",
                        "status": "active",
                        "created_at": datetime.utcnow().isoformat(),
                        "expires_at": "never",
                        "daily_limit": -1,
                        "used_today": 0,
                        "last_active_date": datetime.utcnow().strftime("%Y-%m-%d"),
                        "total_extracted": 0,
                        "notes": "Master Root Pro Key (Never Expires)",
                    }
                }
            }
            self._save_db(default_data)

    def _load_db(self) -> dict:
        data = {"_metadata": {}, "licenses": {}}
        try:
            if self.db_path.exists():
                with open(self.db_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
        except Exception as e:
            print(f"[LICENSE] Error reading local file: {e}")

        # Cloud Sync: Load from Oracle Cloud PostgreSQL (Authoritative Source of Truth)
        try:
            import psycopg2
            if not PG_CONFIG["host"]:
                raise RuntimeError("Cloud database is not configured")
            with psycopg2.connect(**PG_CONFIG) as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        SELECT license_key, client_name, client_email, tier, status, 
                               daily_limit, used_today, expires_at, created_at, 
                               last_active_date, total_extracted, notes, password_hash 
                        FROM admin_licenses;
                    """)
                    rows = cur.fetchall()
                    if rows:
                        cloud_licenses = {}
                        for r in rows:
                            cloud_licenses[r[0]] = {
                                "license_key": r[0],
                                "client_name": r[1] or "",
                                "client_email": r[2] or "",
                                "tier": r[3] or "pro",
                                "status": r[4] or "active",
                                "daily_limit": r[5] if r[5] is not None else 1000,
                                "used_today": r[6] or 0,
                                "expires_at": str(r[7] or "never"),
                                "created_at": str(r[8] or ""),
                                "last_active_date": str(r[9] or ""),
                                "total_extracted": r[10] or 0,
                                "notes": r[11] or "",
                                "password_hash": r[12] or ""
                            }
                        # Overwrite in-memory licenses with authoritative cloud set
                        data["licenses"] = cloud_licenses
                        # Sync local file to match cloud database
                        try:
                            temp_f = self.db_path.with_suffix(".tmp")
                            with open(temp_f, "w", encoding="utf-8") as sf:
                                json.dump(data, sf, indent=2)
                            temp_f.replace(self.db_path)
                        except Exception:
                            pass
        except Exception as e:
            pass
        return data

    def _save_db(self, data: dict):
        data["_metadata"]["updated_at"] = datetime.utcnow().isoformat()
        temp_file = self.db_path.with_suffix(".tmp")
        with open(temp_file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        temp_file.replace(self.db_path)

        # Cloud Sync: Save to Oracle Cloud PostgreSQL
        try:
            import psycopg2
            if not PG_CONFIG["host"]:
                raise RuntimeError("Cloud database is not configured")
            with psycopg2.connect(**PG_CONFIG) as conn:
                with conn.cursor() as cur:
                    for lk, lic in data.get("licenses", {}).items():
                        cur.execute("""
                            INSERT INTO admin_licenses 
                            (license_key, client_name, client_email, tier, status, daily_limit, used_today, expires_at, notes, total_extracted, password_hash)
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                            ON CONFLICT (license_key) DO UPDATE SET
                                client_name = EXCLUDED.client_name,
                                client_email = EXCLUDED.client_email,
                                tier = EXCLUDED.tier,
                                status = EXCLUDED.status,
                                daily_limit = EXCLUDED.daily_limit,
                                used_today = EXCLUDED.used_today,
                                expires_at = EXCLUDED.expires_at,
                                notes = EXCLUDED.notes,
                                total_extracted = EXCLUDED.total_extracted,
                                password_hash = COALESCE(EXCLUDED.password_hash, admin_licenses.password_hash);
                        """, (
                            lk,
                            lic.get("client_name", ""),
                            lic.get("client_email", ""),
                            lic.get("tier", "pro"),
                            lic.get("status", "active"),
                            lic.get("daily_limit", 1000),
                            lic.get("used_today", 0),
                            str(lic.get("expires_at", "never")),
                            lic.get("notes", ""),
                            lic.get("total_extracted", 0),
                            lic.get("password_hash", "")
                        ))

                    # Remove any deleted licenses from PostgreSQL that are no longer in data["licenses"]
                    if data.get("licenses"):
                        valid_keys = tuple(data["licenses"].keys())
                        cur.execute("DELETE FROM admin_licenses WHERE license_key NOT IN %s;", (valid_keys,))

                    conn.commit()
        except Exception:
            pass

    def verify_root_auth(self, password_or_key: str) -> bool:
        """Verifies root credentials."""
        if not password_or_key:
            return False
        db = self._load_db()
        metadata = db.get("_metadata", {})
        stored = metadata.get("root_password_hash", "")
        if stored:
            return verify_password(password_or_key, stored)
        # Preserve an existing installation's password during the hash migration.
        # This accepts only its saved credential, never a built-in default/key.
        configured = DEFAULT_ROOT_PASSWORD or metadata.get("root_password", "")
        if not configured or not secrets.compare_digest(password_or_key, configured):
            return False
        metadata.pop("root_password", None)
        metadata["root_password_hash"] = hash_password(configured)
        self._save_db(db)
        return True

    def update_root_password(self, old_pass: str, new_pass: str) -> Tuple[bool, str]:
        if not self.verify_root_auth(old_pass):
            return False, "Current root password is incorrect."
        if len(new_pass.strip()) < 6:
            return False, "New password must be at least 6 characters long."
        db = self._load_db()
        db["_metadata"].pop("root_password", None)
        db["_metadata"]["root_password_hash"] = hash_password(new_pass.strip())
        self._save_db(db)
        return True, "Root password successfully updated."

    def create_account(
        self,
        name: str,
        email: str,
        tier: str = "trial",
        duration_days: int = 7,
        daily_limit: Optional[int] = None,
        notes: str = "",
        password: Optional[str] = None,
        scistudio_access: bool = True,
        account_type: str = "single",
        org_name: str = "",
        can_invite_users: bool = False,
        seat_limit: Optional[int] = None,
    ) -> dict:
        """
        Creates a new user account and issues a license key.
        - tier: 'trial' or 'pro'
        - duration_days: e.g. 7 for trial, 365 or -1 for Pro lifetime
        - daily_limit: e.g. 1000 for trial, -1 for unlimited
        - account_type: 'org' (Organization/Team) or 'single' (Individual client)
        """
        db = self._load_db()
        tier_clean = tier.strip().lower()
        if tier_clean not in ("trial", "pro"):
            tier_clean = "trial"

        now = datetime.utcnow()
        if duration_days <= 0 or duration_days > 3650:
            expires_at = "never"
        else:
            expires_dt = now + timedelta(days=duration_days)
            expires_at = expires_dt.strftime("%Y-%m-%d %H:%M:%S UTC")

        # Set default limits if not specified
        if daily_limit is None or daily_limit <= 0:
            daily_limit = -1 if tier_clean == "pro" else 1000

        # Generate unique key
        key = _generate_key(tier=tier_clean)
        while key in db["licenses"]:
            key = _generate_key(tier=tier_clean)

        acct_type = "org" if str(account_type).lower() == "org" else "single"
        if seat_limit is None or seat_limit <= 0:
            final_seat_limit = 5 if acct_type == "org" else (1 if not can_invite_users else 3)
        else:
            final_seat_limit = int(seat_limit)

        account = {
            "license_key": key,
            "account_type": acct_type,
            "org_name": org_name.strip() if acct_type == "org" else "",
            "client_name": name.strip() or ("Organization Admin" if acct_type == "org" else "Unnamed Client"),
            "client_email": email.strip().lower() or "client@example.com",
            "tier": tier_clean,
            "status": "active",
            "can_invite_users": bool(can_invite_users or acct_type == "org"),
            "seat_limit": final_seat_limit,
            "members": [],
            "created_at": now.strftime("%Y-%m-%d %H:%M:%S UTC"),
            "expires_at": expires_at,
            "duration_days": duration_days,
            "daily_limit": daily_limit,
            "used_today": 0,
            "last_active_date": now.strftime("%Y-%m-%d"),
            "total_extracted": 0,
            "notes": notes.strip(),
            "password_hash": hash_password(password) if password else "",
            "scistudio_access": bool(scistudio_access),
        }

        db["licenses"][key] = account
        self._save_db(db)
        print(f"[LICENSE] Created {acct_type.upper()} ({tier_clean.upper()}) account for {name} ({key})")
        return account

    def get_account(self, license_key: str) -> Optional[dict]:
        """Returns the raw account record by key."""
        db = self._load_db()
        key_clean = (license_key or "").strip().upper()
        return db.get("licenses", {}).get(key_clean)

    def stop_account(self, license_key: str) -> Tuple[bool, str]:
        """Instantly stops/suspends an account. Client app will be locked out and active sessions revoked."""
        key_clean = (license_key or "").strip().upper()
        db = self._load_db()
        if key_clean not in db.get("licenses", {}):
            return False, "License key not found."
        account = db["licenses"][key_clean]
        account["status"] = "stopped"
        account["stopped_at"] = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
        self._save_db(db)

        # Mark active sessions for this key (and subaccount members) as stopped so real-time checks report suspension
        for s in self._sessions.values():
            u = s.get("user")
            if u:
                u_key = (u.get("license_key") or "").strip().upper()
                p_key = (u.get("parent_license_key") or "").strip().upper()
                if u_key == key_clean or p_key == key_clean:
                    u["status"] = "stopped"
        self._save_sessions()

        print(f"[LICENSE] ⛔ Stopped account {key_clean} ({account.get('client_name')}).")
        return True, f"Account {key_clean} has been suspended."

    def resume_account(self, license_key: str) -> Tuple[bool, str]:
        """Re-activates a suspended account."""
        db = self._load_db()
        if license_key not in db["licenses"]:
            return False, "License key not found."
        account = db["licenses"][license_key]
        account["status"] = "active"
        account.pop("stopped_at", None)
        self._save_db(db)
        print(f"[LICENSE] ▶️ Reactivated account {license_key} ({account.get('client_name')})")
        return True, f"Account {license_key} is now active."

    def extend_account(self, license_key: str, additional_days: int = 7) -> Tuple[bool, str, dict]:
        """Adds more days to an account's expiration."""
        db = self._load_db()
        if license_key not in db["licenses"]:
            return False, "License key not found.", {}
        account = db["licenses"][license_key]

        curr_exp = account.get("expires_at", "never")
        now = datetime.utcnow()
        if curr_exp == "never":
            return True, "Account already has lifetime validity.", account

        try:
            curr_dt = datetime.strptime(curr_exp.replace(" UTC", ""), "%Y-%m-%d %H:%M:%S")
            # If already expired, extend from today
            base_dt = max(curr_dt, now)
        except Exception:
            base_dt = now

        new_dt = base_dt + timedelta(days=additional_days)
        account["expires_at"] = new_dt.strftime("%Y-%m-%d %H:%M:%S UTC")
        # Ensure account is active if it was expired
        if account["status"] == "expired":
            account["status"] = "active"

        self._save_db(db)
        return True, f"Extended account validity by {additional_days} days.", account

    def upgrade_account(self, license_key: str, new_tier: str = "pro", new_limit: int = -1) -> Tuple[bool, str, dict]:
        """Upgrades or modifies an account's tier and limit."""
        db = self._load_db()
        if license_key not in db["licenses"]:
            return False, "License key not found.", {}
        account = db["licenses"][license_key]
        account["tier"] = new_tier.lower()
        if new_tier.lower() == "pro":
            account["daily_limit"] = -1 if new_limit <= 0 else new_limit
            # Default pro accounts to lifetime if previously short trial
            if account.get("duration_days", 7) <= 30:
                account["expires_at"] = "never"
                account["duration_days"] = -1
        else:
            account["daily_limit"] = 1000 if new_limit <= 0 else new_limit

        self._save_db(db)
        return True, f"Account upgraded to {new_tier.upper()}.", account

    def toggle_scistudio_access(self, license_key: str, enable: Optional[bool] = None) -> Tuple[bool, str, dict]:
        """Enables or disables SciStudio (Website Builder) access for an account."""
        db = self._load_db()
        key_clean = (license_key or "").strip().upper()
        if key_clean not in db.get("licenses", {}):
            return False, f"License key '{license_key}' not found.", {}

        acc = db["licenses"][key_clean]
        current = acc.get("scistudio_access", True)
        new_state = (not current) if enable is None else bool(enable)
        acc["scistudio_access"] = new_state
        self._save_db(db)

        # Update active in-memory sessions for this license
        for s in self._sessions.values():
            u = s.get("user")
            if u and u.get("license_key", "").strip().upper() == key_clean:
                u["scistudio_access"] = new_state
        self._save_sessions()

        status_text = "enabled" if new_state else "disabled"
        print(f"[LICENSE] SciStudio access {status_text} for {acc.get('client_name')} ({key_clean})")
        return True, f"SciStudio access successfully {status_text} for {acc.get('client_name')}.", acc

    def delete_account(self, license_key: str) -> Tuple[bool, str]:
        """Permanently deletes an account record locally and from PostgreSQL cloud database."""
        key_clean = (license_key or "").strip().upper()
        if key_clean == "SCIP-PRO-ROOT-MASTER":
            return False, "Cannot delete master root key."

        db = self._load_db()
        found = False

        # 1. Remove from local database dictionary
        for k in list(db.get("licenses", {}).keys()):
            if k.strip().upper() == key_clean:
                del db["licenses"][k]
                found = True

        # 2. Cloud Sync: Delete from Oracle Cloud PostgreSQL
        try:
            import psycopg2
            if not PG_CONFIG["host"]:
                raise RuntimeError("Cloud database is not configured")
            with psycopg2.connect(**PG_CONFIG) as conn:
                with conn.cursor() as cur:
                    cur.execute("DELETE FROM admin_licenses WHERE UPPER(license_key) = %s;", (key_clean,))
                    if cur.rowcount > 0:
                        found = True
                    conn.commit()
        except Exception as e:
            print(f"[LICENSE] Error deleting {key_clean} from PostgreSQL: {e}")

        if found:
            self._save_db(db)
            # Revoke any active session tokens for this license
            tokens_to_remove = [
                t for t, s in self._sessions.items()
                if s.get("user", {}).get("license_key", "").strip().upper() == key_clean
            ]
            for t in tokens_to_remove:
                self._sessions.pop(t, None)
            if tokens_to_remove:
                self._save_sessions()
            return True, f"Account {key_clean} deleted successfully."

        return False, "License key not found."

    def list_accounts(self, search: str = "", filter_tier: str = "all", filter_status: str = "all") -> List[dict]:
        """Returns all accounts sorted by creation date with status and remaining days calculated."""
        db = self._load_db()
        accounts = []
        now = datetime.utcnow()

        for key, acc in db.get("licenses", {}).items():
            acc_copy = dict(acc)
            # Calculate dynamic status & days left
            expires_at = acc_copy.get("expires_at", "never")
            days_left = "Lifetime"
            is_expired = False

            if expires_at != "never":
                try:
                    exp_dt = datetime.strptime(expires_at.replace(" UTC", ""), "%Y-%m-%d %H:%M:%S")
                    diff = exp_dt - now
                    if diff.total_seconds() <= 0:
                        is_expired = True
                        days_left = "Expired"
                        if acc_copy["status"] == "active":
                            acc_copy["status"] = "expired"
                    else:
                        days_num = max(0, diff.days)
                        hours_num = int(diff.seconds / 3600)
                        days_left = f"{days_num}d {hours_num}h" if days_num < 3 else f"{days_num} days"
                except Exception:
                    days_left = "Unknown"

            acc_copy["days_left"] = days_left
            acc_copy["is_expired"] = is_expired
            acc_copy["scistudio_access"] = acc_copy.get("scistudio_access", True)

            acc_copy["account_type"] = acc_copy.get("account_type", "single")
            acc_copy["org_name"] = acc_copy.get("org_name", "")
            acc_copy["can_invite_users"] = acc_copy.get("can_invite_users", acc_copy["account_type"] == "org")
            acc_copy["seat_limit"] = acc_copy.get("seat_limit", 5 if acc_copy["account_type"] == "org" else 1)
            acc_copy["members"] = acc_copy.get("members", [])
            acc_copy["member_count"] = len(acc_copy["members"])

            # Apply filters
            if filter_tier != "all" and acc_copy.get("tier") != filter_tier:
                continue
            if filter_status != "all" and acc_copy.get("status") != filter_status:
                continue
            if search:
                query = search.lower()
                matches = (
                    query in acc_copy.get("client_name", "").lower()
                    or query in acc_copy.get("client_email", "").lower()
                    or query in acc_copy.get("license_key", "").lower()
                    or query in acc_copy.get("notes", "").lower()
                    or query in acc_copy.get("org_name", "").lower()
                )
                if not matches:
                    continue

            accounts.append(acc_copy)

        # Sort: Most recently created first
        accounts.sort(key=lambda x: x.get("created_at", ""), reverse=True)
        return accounts

    def add_org_member(
        self,
        parent_key: str,
        name: str,
        email: str,
        role: str = "editor",
        scistudio_access: bool = True,
        password: Optional[str] = None
    ) -> Tuple[bool, str, Optional[dict]]:
        """Adds a team member/user to an Organization or Client account."""
        db = self._load_db()
        key_clean = (parent_key or "").strip().upper()
        if key_clean not in db.get("licenses", {}):
            return False, "Parent account / Organization not found.", None

        parent = db["licenses"][key_clean]
        members = parent.setdefault("members", [])
        seat_limit = parent.get("seat_limit", 5 if parent.get("account_type") == "org" else 1)

        if seat_limit != -1 and len(members) >= seat_limit:
            return False, f"Team seat limit reached ({seat_limit} seats). Upgrade limit in Admin Console.", None

        clean_email = email.strip().lower()
        if not clean_email or "@" not in clean_email:
            return False, "A valid member email address is required.", None

        if any(m.get("email", "").lower() == clean_email for m in members):
            return False, f"Member with email '{clean_email}' already exists in this team.", None

        import uuid
        member_id = f"mem-{uuid.uuid4().hex[:8]}"
        new_member = {
            "member_id": member_id,
            "name": name.strip() or "Team Member",
            "email": clean_email,
            "role": role if role in ("admin", "editor", "viewer") else "editor",
            "scistudio_access": bool(scistudio_access),
            "created_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC"),
            "password_hash": hash_password(password) if password else "",
        }
        members.append(new_member)
        self._save_db(db)
        return True, f"Member '{new_member['name']}' successfully added.", new_member

    def remove_org_member(self, parent_key: str, member_id: str) -> Tuple[bool, str]:
        """Removes a team member from an Organization or Client account."""
        db = self._load_db()
        key_clean = (parent_key or "").strip().upper()
        if key_clean not in db.get("licenses", {}):
            return False, "Parent account / Organization not found."

        parent = db["licenses"][key_clean]
        members = parent.get("members", [])
        initial_len = len(members)
        parent["members"] = [m for m in members if m.get("member_id") != member_id]
        if len(parent["members"]) == initial_len:
            return False, "Member not found."
        self._save_db(db)
        return True, "Team member successfully removed."

    def toggle_member_scistudio(self, parent_key: str, member_id: str, enable: Optional[bool] = None) -> Tuple[bool, str, Optional[dict]]:
        """Toggles SciStudio access for a specific team member."""
        db = self._load_db()
        key_clean = (parent_key or "").strip().upper()
        if key_clean not in db.get("licenses", {}):
            return False, "Parent account / Organization not found.", None

        parent = db["licenses"][key_clean]
        for m in parent.get("members", []):
            if m.get("member_id") == member_id:
                if enable is None:
                    m["scistudio_access"] = not m.get("scistudio_access", True)
                else:
                    m["scistudio_access"] = bool(enable)
                self._save_db(db)
                status_str = "enabled" if m["scistudio_access"] else "disabled"
                return True, f"SciStudio access {status_str} for member '{m.get('name')}'.", m
        return False, "Member not found.", None

    def get_stats(self) -> dict:
        """Computes summary KPI stats for the Root Dashboard."""
        db = self._load_db()
        licenses = db.get("licenses", {})
        total = len(licenses)
        active_trial = 0
        active_pro = 0
        stopped = 0
        expired = 0
        org_count = 0
        single_count = 0
        scistudio_count = 0
        total_members = 0

        now = datetime.utcnow()

        for acc in licenses.values():
            status = acc.get("status", "active")
            tier = acc.get("tier", "trial")
            expires_at = acc.get("expires_at", "never")
            acct_type = acc.get("account_type", "single")

            if acct_type == "org":
                org_count += 1
            else:
                single_count += 1

            members = acc.get("members", [])
            total_members += len(members)

            if acc.get("scistudio_access", True):
                scistudio_count += 1

            if status == "stopped":
                stopped += 1
                continue

            # Check if expired
            if expires_at != "never":
                try:
                    exp_dt = datetime.strptime(expires_at.replace(" UTC", ""), "%Y-%m-%d %H:%M:%S")
                    if exp_dt <= now:
                        expired += 1
                        continue
                except Exception:
                    pass

            if tier == "pro":
                active_pro += 1
            else:
                active_trial += 1

        return {
            "total_accounts": total,
            "active_trials": active_trial,
            "active_pros": active_pro,
            "stopped_accounts": stopped,
            "expired_accounts": expired,
            "org_count": org_count,
            "single_count": single_count,
            "scistudio_count": scistudio_count,
            "total_members": total_members,
        }

    def validate_license(self, license_key: str) -> dict:
        """
        Validates a license key for client apps.
        Returns:
            {
                "valid": True/False,
                "status": "active" | "stopped" | "expired" | "invalid",
                "tier": "trial" | "pro",
                "client_name": str,
                "days_left": str,
                "daily_limit": int,
                "remaining_today": int,
                "message": str
            }
        """
        if not license_key:
            return {
                "valid": False,
                "status": "invalid",
                "message": "No license key provided.",
            }

        db = self._load_db()
        key_clean = license_key.strip().upper()

        if key_clean not in db.get("licenses", {}):
            # Fallback check for root master
            if key_clean == "SCIP-PRO-ROOT-MASTER":
                return {
                    "valid": True,
                    "status": "active",
                    "tier": "pro",
                    "client_name": "Root Administrator",
                    "days_left": "Unlimited",
                    "daily_limit": "Unlimited",
                    "remaining_today": 999999,
                    "scistudio_access": True,
                    "message": "Full Lifetime Commercial Access (Root Master)",
                }
            return {
                "valid": False,
                "status": "invalid",
                "message": "Invalid license key. Please check your credentials.",
            }

        account = db["licenses"][key_clean]
        status = account.get("status", "active")
        tier = account.get("tier", "trial")
        expires_at = account.get("expires_at", "never")
        client_name = account.get("client_name", "Valued Client")
        daily_limit = account.get("daily_limit", 1000 if tier == "trial" else -1)

        # 1. Check if STOPPED / SUSPENDED by Root
        if status == "stopped":
            return {
                "valid": False,
                "status": "stopped",
                "tier": tier,
                "client_name": client_name,
                "message": "🚨 ACCESS SUSPENDED: Your account is Temporarily stopped. Contact Admin.",
            }

        # 2. Check Expiration
        days_left_str = "Unlimited"
        if expires_at != "never":
            try:
                exp_dt = datetime.strptime(expires_at.replace(" UTC", ""), "%Y-%m-%d %H:%M:%S")
                diff = exp_dt - datetime.utcnow()
                if diff.total_seconds() <= 0:
                    account["status"] = "expired"
                    self._save_db(db)
                    return {
                        "valid": False,
                        "status": "expired",
                        "tier": tier,
                        "client_name": client_name,
                        "message": f"License expired on {expires_at}. Contact root admin to renew.",
                    }
                days_left_str = f"{max(0, diff.days)} days"
            except Exception:
                pass

        # 3. Check Daily Limits
        today_str = datetime.utcnow().strftime("%Y-%m-%d")
        if account.get("last_active_date") != today_str:
            account["last_active_date"] = today_str
            account["used_today"] = 0
            self._save_db(db)

        used_today = account.get("used_today", 0)
        remaining_today = 999999 if daily_limit == -1 else max(0, daily_limit - used_today)

        limit_display = "Unlimited" if daily_limit == -1 else daily_limit

        return {
            "valid": True,
            "status": "active",
            "tier": tier,
            "client_name": client_name,
            "client_email": account.get("client_email", ""),
            "license_key": key_clean,
            "expires_at": expires_at,
            "days_left": days_left_str,
            "daily_limit": limit_display,
            "today_verified": used_today,
            "remaining_verified_today": remaining_today,
            "scistudio_access": account.get("scistudio_access", True),
            "message": f"Active {tier.capitalize()} License for {client_name}",
        }

    def record_usage(self, license_key: str, count: int = 1):
        """Records lead verification usage against the active license."""
        db = self._load_db()
        key_clean = license_key.strip().upper()
        if key_clean in db.get("licenses", {}):
            acc = db["licenses"][key_clean]
            today_str = datetime.utcnow().strftime("%Y-%m-%d")
            if acc.get("last_active_date") != today_str:
                acc["last_active_date"] = today_str
                acc["used_today"] = 0
            acc["used_today"] = acc.get("used_today", 0) + count
            acc["total_extracted"] = acc.get("total_extracted", 0) + count
            self._save_db(db)


# Global singleton instance

    # -------------------------------------------------------------------------
    # Authentication & Session Token Engine
    # -------------------------------------------------------------------------
    def authenticate(self, identifier: str, password: Optional[str] = None) -> Tuple[bool, dict, str]:
        """
        Authenticates a user via Email and Password:
        - The license key is hidden from the user interface and serves as their tracking account ID.
        """
        ident = (identifier or "").strip()
        pwd = (password or "").strip()

        if not ident:
            return False, {}, "Please enter your account email."
        if not pwd:
            return False, {}, "Please enter your password."

        # 1. Root Admin Check (via email or admin handle)
        if ident.lower() in ("admin", "root", "sciprospect", "root@sciprospect.internal"):
            if self.verify_root_auth(pwd):
                user_info = {
                    "license_key": "SCIP-PRO-ROOT-MASTER",
                    "client_name": "Root Administrator",
                    "client_email": "root@sciprospect.internal",
                    "tier": "pro",
                    "is_admin": True,
                    "scistudio_access": True,
                    "daily_limit": "Unlimited",
                    "status": "active"
                }
                return True, user_info, "Logged in as Root Administrator"
            else:
                return False, {}, "Incorrect password."

        # 2. Email + Password Lookup
        db = self._load_db()
        found_acc = None
        found_key = None
        key_upper = ident.upper()

        # Check primary / owner accounts first
        for lk, acc in db.get("licenses", {}).items():
            if acc.get("client_email", "").strip().lower() == ident.lower() or lk == key_upper:
                found_acc = acc
                found_key = lk
                break

        # If not a primary account, check organization subaccount members
        found_member = None
        parent_acc = None
        parent_key = None

        if not found_acc:
            for lk, acc in db.get("licenses", {}).items():
                for mem in acc.get("members", []):
                    if mem.get("email", "").strip().lower() == ident.lower():
                        found_member = mem
                        parent_acc = acc
                        parent_key = lk
                        break
                if found_member:
                    break

        if not found_acc and not found_member:
            return False, {}, "No account found matching this email."

        # Case A: Organization Subaccount Member Login
        if found_member:
            stored_hash = found_member.get("password_hash", "")
            if not stored_hash:
                return False, {}, "Password not set for this account. Contact Organization Admin."
            elif not verify_password(pwd, stored_hash):
                return False, {}, "Incorrect password. Please try again."

            val = self.validate_license(parent_key)
            if not val.get("valid") or val.get("status") == "stopped":
                return False, {}, val.get("message", "🚨 ACCESS SUSPENDED: Your organization account is Temporarily stopped. Contact Admin.")

            user_info = {
                "is_member": True,
                "member_id": found_member.get("member_id", ""),
                "role": found_member.get("role", "editor"),
                "client_name": found_member.get("name", "Team Member"),
                "client_email": found_member.get("email", ident.lower()),
                "parent_license_key": parent_key,
                "license_key": parent_key,
                "org_name": parent_acc.get("org_name", ""),
                "tier": val.get("tier", "pro"),
                "is_admin": False,
                "scistudio_access": bool(found_member.get("scistudio_access", True) and val.get("scistudio_access", True)),
                "daily_limit": val.get("daily_limit", "Unlimited"),
                "status": "active"
            }
            return True, user_info, f"Welcome back, {user_info['client_name']}"

        # Case B: Primary Account / Organization Owner Login
        stored_hash = found_acc.get("password_hash", "")
        if not stored_hash:
            if self.verify_root_auth(pwd):
                pass
            else:
                return False, {}, "Password not set for this account. Contact Admin."
        elif not verify_password(pwd, stored_hash):
            return False, {}, "Incorrect password. Please try again."

        val = self.validate_license(found_key)
        if not val.get("valid") or val.get("status") == "stopped":
            return False, {}, val.get("message", "🚨 ACCESS SUSPENDED: Your account is Temporarily stopped. Contact Admin.")

        user_info = {
            "is_member": False,
            "license_key": found_key,  # Hidden account ID used for tracking and limits
            "client_name": val.get("client_name", "Valued Client"),
            "client_email": val.get("client_email", ""),
            "tier": val.get("tier", "pro"),
            "is_admin": (found_key == "SCIP-PRO-ROOT-MASTER"),
            "scistudio_access": val.get("scistudio_access", True),
            "daily_limit": val.get("daily_limit", "Unlimited"),
            "status": "active"
        }
        return True, user_info, f"Welcome back, {user_info['client_name']}"

    def issue_session(self, user_info: dict) -> str:
        """Issues a secure session token valid for 7 days."""
        token = secrets.token_urlsafe(32)
        now = time.time()
        self._sessions[token] = {
            "user": user_info,
            "created_at": now,
            "expires_at": now + (86400 * 7)
        }
        self._save_sessions()
        return token

    def get_session_info(self, token: Optional[str]) -> Tuple[Optional[dict], Optional[str]]:
        """Validates a session token and returns (user_info, error_reason)."""
        if not token:
            return None, "Not authenticated"

        # Check if disk has newer sessions (e.g. issued by another worker or reloaded after restart)
        if token not in self._sessions and self.sessions_path.exists():
            try:
                mtime = self.sessions_path.stat().st_mtime
                if mtime > getattr(self, "_last_sessions_mtime", 0.0):
                    self._sessions = self._load_sessions()
            except Exception:
                pass

        session = self._sessions.get(token)
        if not session:
            return None, "Not authenticated"
        if time.time() > session.get("expires_at", 0):
            self._sessions.pop(token, None)
            self._save_sessions()
            return None, "Session expired"
        user = session.get("user")
        if not user:
            return None, "Not authenticated"

        # Root admin session is always valid
        if user.get("is_admin"):
            return user, None

        # Real-time license status validation
        key = user.get("parent_license_key") or user.get("license_key")
        if key:
            val = self.validate_license(key)
            if not val.get("valid") or val.get("status") == "stopped" or user.get("status") == "stopped":
                self._sessions.pop(token, None)
                self._save_sessions()
                msg = val.get("message") or "🚨 ACCESS SUSPENDED: Your account is Temporarily stopped. Contact Admin."
                return None, msg

            # If user is a subaccount member, verify membership is still active in parent
            if user.get("is_member") and user.get("member_id"):
                acct = self.get_account(key)
                if not acct:
                    self._sessions.pop(token, None)
                    self._save_sessions()
                    return None, "Organization account not found."
                member = next((m for m in acct.get("members", []) if m.get("member_id") == user["member_id"]), None)
                if not member:
                    self._sessions.pop(token, None)
                    self._save_sessions()
                    return None, "Team member access has been revoked."
                user["role"] = member.get("role", user.get("role", "editor"))
                user["scistudio_access"] = bool(member.get("scistudio_access", True) and val.get("scistudio_access", True))

            # Keep user details synchronized
            user["status"] = val.get("status", "active")
            user["tier"] = val.get("tier", user.get("tier", "pro"))
            user["daily_limit"] = val.get("daily_limit", "Unlimited")
            user["days_left"] = val.get("days_left", "Unlimited")
            if not user.get("is_member"):
                user["scistudio_access"] = val.get("scistudio_access", True)

        return user, None

    def get_session(self, token: Optional[str]) -> Optional[dict]:
        user, _ = self.get_session_info(token)
        return user

    def revoke_session(self, token: Optional[str]) -> bool:
        """Revokes a session token."""
        if not token:
            return False
        if token not in self._sessions and self.sessions_path.exists():
            try:
                mtime = self.sessions_path.stat().st_mtime
                if mtime > getattr(self, "_last_sessions_mtime", 0.0):
                    self._sessions = self._load_sessions()
            except Exception:
                pass
        if token in self._sessions:
            del self._sessions[token]
            self._save_sessions()
            return True
        return False


license_engine = LicenseManager()
