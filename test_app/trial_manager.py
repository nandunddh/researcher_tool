r"""
trial_manager.py
================
Enterprise-grade 7-Day Evaluation Trial Controller for SciProspect.

Anti-Abuse Protections:
1. Anti-Reinstall: Persists across app uninstallation and directory deletion via:
   - Windows Registry (HKCU\Software\SciProspect)
   - Hidden LocalAppData storage (%LOCALAPPDATA%\SciProspect\.sciprospect_token)
   - Hidden ProgramData storage (C:\ProgramData\SciProspect\.sciprospect_sys)
2. Hardware Locking: Cryptographically bound to the computer's unique MachineGuid / MAC.
3. Anti-Tamper: SHA-256 HMAC-style signature verification.
4. Anti-Rollback: Real network UTC time verification against Google/NTP header.
5. Strict Quotas:
   - Tool 01 (Extraction Pool): Up to 10,000 researcher candidate records.
   - Tool 02 (Verification & Enrichment): Up to 1,000 verified emails PER CALENDAR DAY.
   - Duration: 7 Days from first launch.
"""

import hashlib
import json
import os
import platform
import sys
import urllib.request
import uuid
from datetime import datetime, timedelta
from pathlib import Path

# Evaluation Quotas
TRIAL_DURATION_DAYS = 7
TOOL_01_MAX_TOTAL_RECORDS = 10000
TOOL_02_DAILY_VERIFIED_LIMIT = 1000

SECRET_SALT = "SciProspect_2026_EnterpriseAntiAbuse_v4"
REG_SUBKEY = r"Software\SciProspect"

BASE_DIR = Path(__file__).resolve().parent
LOCAL_STATE_FILE = BASE_DIR / ".license_cache"


def _get_machine_fingerprint() -> str:
    """Reads permanent Windows MachineGuid or hardware UUID to bind trial to this PC."""
    guid = ""
    if sys.platform == "win32":
        try:
            import winreg
            with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Cryptography") as key:
                guid, _ = winreg.QueryValueEx(key, "MachineGuid")
        except Exception:
            pass
    if not guid:
        guid = f"{platform.node()}-{uuid.getnode()}"
    return hashlib.sha256((guid + SECRET_SALT).encode("utf-8")).hexdigest()[:32]


MACHINE_ID = _get_machine_fingerprint()


def _generate_signature(data_str: str) -> str:
    """Generates a cryptographic SHA-256 signature for data payload."""
    token = f"{data_str}::{SECRET_SALT}::{MACHINE_ID}"
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def get_current_date() -> datetime:
    """Fetches real network UTC date to prevent PC clock rollback tampering.
    Falls back to local date if completely offline."""
    try:
        req = urllib.request.Request(
            "https://www.google.com",
            headers={"User-Agent": "Mozilla/5.0"},
            method="HEAD"
        )
        with urllib.request.urlopen(req, timeout=3) as resp:
            date_str = resp.headers.get("Date")
            if date_str:
                return datetime.strptime(date_str[:25], "%a, %d %b %Y %H:%M:%S")
    except Exception:
        pass
    return datetime.utcnow()


# ---------------------------------------------------------------------------
# Storage Providers: Windows Registry & Hidden System Folders
# ---------------------------------------------------------------------------

def _read_registry_token():
    if sys.platform != "win32":
        return None
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, REG_SUBKEY) as key:
            val, _ = winreg.QueryValueEx(key, "TrialData")
            return json.loads(val)
    except Exception:
        return None


def _write_registry_token(payload: dict):
    if sys.platform != "win32":
        return
    try:
        import winreg
        key = winreg.CreateKey(winreg.HKEY_CURRENT_USER, REG_SUBKEY)
        winreg.SetValueEx(key, "TrialData", 0, winreg.REG_SZ, json.dumps(payload))
        winreg.CloseKey(key)
    except Exception:
        pass


def _get_appdata_file() -> Path:
    local_app = os.environ.get("LOCALAPPDATA")
    if local_app:
        folder = Path(local_app) / "SciProspect"
    else:
        folder = Path.home() / ".sciprospect"
    folder.mkdir(parents=True, exist_ok=True)
    return folder / ".sciprospect_token"


def _get_programdata_file() -> Path:
    prog_data = os.environ.get("PROGRAMDATA", "C:\\ProgramData")
    folder = Path(prog_data) / "SciProspect"
    try:
        folder.mkdir(parents=True, exist_ok=True)
    except Exception:
        pass
    return folder / ".sciprospect_sys"


# ---------------------------------------------------------------------------
# Trial Manager Engine
# ---------------------------------------------------------------------------

class TrialManager:
    def __init__(self):
        self.state = self._load_or_init_state()

    def _load_or_init_state(self) -> dict:
        now = get_current_date()
        today_str = now.strftime("%Y-%m-%d")
        now_iso = now.isoformat()

        # Gather state candidates from all persistent storage locations
        candidates = []

        # 1. Registry
        reg_payload = _read_registry_token()
        if reg_payload and self._verify_payload(reg_payload):
            candidates.append(reg_payload["data"])

        # 2. LocalAppData
        appdata_file = _get_appdata_file()
        if appdata_file.exists():
            try:
                with open(appdata_file, "r", encoding="utf-8") as f:
                    p = json.load(f)
                if self._verify_payload(p):
                    candidates.append(p["data"])
            except Exception:
                pass

        # 3. ProgramData
        programdata_file = _get_programdata_file()
        if programdata_file.exists():
            try:
                with open(programdata_file, "r", encoding="utf-8") as f:
                    p = json.load(f)
                if self._verify_payload(p):
                    candidates.append(p["data"])
            except Exception:
                pass

        # 4. Local App Folder (.license_cache)
        if LOCAL_STATE_FILE.exists():
            try:
                with open(LOCAL_STATE_FILE, "r", encoding="utf-8") as f:
                    p = json.load(f)
                if self._verify_payload(p):
                    candidates.append(p["data"])
            except Exception:
                pass

        # If a trial record was found in ANY location, enforce the EARLIEST first_run date!
        if candidates:
            # Sort by earliest first_run date
            candidates.sort(key=lambda c: c.get("first_run", now_iso))
            master_data = candidates[0]

            # Anti-tamper clock rollback check
            last_run = datetime.fromisoformat(master_data.get("last_run", master_data["first_run"]))
            if now < (last_run - timedelta(hours=1)):
                master_data["is_expired"] = True
                master_data["expired_reason"] = "System clock rollback detected."
                self._save_state(master_data)
                return master_data

            # Update last run & run count
            master_data["last_run"] = now_iso
            master_data["total_runs"] = master_data.get("total_runs", 0) + 1
            if "daily_usage" not in master_data:
                master_data["daily_usage"] = {}
            if today_str not in master_data["daily_usage"]:
                master_data["daily_usage"][today_str] = 0

            # Synchronize across all locations
            self._save_state(master_data)
            return master_data

        # Brand-new trial initialization (only if NO record exists anywhere)
        fresh_state = {
            "machine_id": MACHINE_ID,
            "first_run": now_iso,
            "last_run": now_iso,
            "total_runs": 1,
            "is_expired": False,
            "days_allowed": TRIAL_DURATION_DAYS,
            "tool_01_total_extracted": 0,
            "daily_usage": {
                today_str: 0
            }
        }
        self._save_state(fresh_state)
        return fresh_state

    def _verify_payload(self, payload: dict) -> bool:
        if not isinstance(payload, dict):
            return False
        sig = payload.get("sig")
        data = payload.get("data")
        if not sig or not isinstance(data, dict):
            return False
        raw_str = json.dumps(data, sort_keys=True)
        return _generate_signature(raw_str) == sig

    def _save_state(self, data: dict):
        raw_str = json.dumps(data, sort_keys=True)
        sig = _generate_signature(raw_str)
        payload = {"data": data, "sig": sig}

        # 1. Windows Registry (survives app uninstall)
        _write_registry_token(payload)

        # 2. LocalAppData (survives app uninstall)
        try:
            with open(_get_appdata_file(), "w", encoding="utf-8") as f:
                json.dump(payload, f, indent=2)
        except Exception:
            pass

        # 3. ProgramData (survives app uninstall)
        try:
            with open(_get_programdata_file(), "w", encoding="utf-8") as f:
                json.dump(payload, f, indent=2)
        except Exception:
            pass

        # 4. Local App Folder
        try:
            with open(LOCAL_STATE_FILE, "w", encoding="utf-8") as f:
                json.dump(payload, f, indent=2)
        except Exception:
            pass

    def check_status(self) -> dict:
        """Returns days remaining, daily verification allowance, and active limits."""
        now = get_current_date()
        today_str = now.strftime("%Y-%m-%d")

        if self.state.get("is_expired"):
            return {
                "active": False,
                "days_left": 0,
                "reason": self.state.get("expired_reason", "Trial period expired."),
                "today_verified": 0,
                "daily_verified_limit": TOOL_02_DAILY_VERIFIED_LIMIT,
                "remaining_verified_today": 0,
                "tool_01_max_pool": TOOL_01_MAX_TOTAL_RECORDS,
                "tool_01_extracted": self.state.get("tool_01_total_extracted", 0)
            }

        first_run = datetime.fromisoformat(self.state["first_run"])
        elapsed = (now - first_run).total_seconds() / 86400.0
        days_left = max(0.0, TRIAL_DURATION_DAYS - elapsed)

        if days_left <= 0:
            self.state["is_expired"] = True
            self.state["expired_reason"] = "7-day evaluation period has ended."
            self._save_state(self.state)
            return {
                "active": False,
                "days_left": 0,
                "reason": "7-day evaluation period has ended.",
                "today_verified": 0,
                "daily_verified_limit": TOOL_02_DAILY_VERIFIED_LIMIT,
                "remaining_verified_today": 0,
                "tool_01_max_pool": TOOL_01_MAX_TOTAL_RECORDS,
                "tool_01_extracted": self.state.get("tool_01_total_extracted", 0)
            }

        daily_usage = self.state.get("daily_usage", {})
        verified_today = daily_usage.get(today_str, 0)
        remaining_today = max(0, TOOL_02_DAILY_VERIFIED_LIMIT - verified_today)

        return {
            "active": True,
            "days_left": round(days_left, 1),
            "first_run": first_run.strftime("%Y-%m-%d"),
            "expires_on": (first_run + timedelta(days=TRIAL_DURATION_DAYS)).strftime("%Y-%m-%d"),
            "today_date": today_str,
            "today_verified": verified_today,
            "daily_verified_limit": TOOL_02_DAILY_VERIFIED_LIMIT,
            "remaining_verified_today": remaining_today,
            "tool_01_max_pool": TOOL_01_MAX_TOTAL_RECORDS,
            "tool_01_extracted": self.state.get("tool_01_total_extracted", 0),
            "message": f"Trial Active: {round(days_left, 1)} days left. Today's verification: {verified_today}/{TOOL_02_DAILY_VERIFIED_LIMIT} leads used."
        }

    def record_verified_lead(self, count: int = 1) -> bool:
        """Records verified leads found today. Returns False if limit exceeded."""
        status = self.check_status()
        if not status["active"]:
            return False

        today_str = status["today_date"]
        daily_usage = self.state.setdefault("daily_usage", {})
        current = daily_usage.get(today_str, 0)

        if current + count > TOOL_02_DAILY_VERIFIED_LIMIT:
            daily_usage[today_str] = TOOL_02_DAILY_VERIFIED_LIMIT
            self._save_state(self.state)
            return False

        daily_usage[today_str] = current + count
        self._save_state(self.state)
        return True

    def record_extracted_candidates(self, count: int):
        """Records candidates fetched into Tool 01 pool."""
        self.state["tool_01_total_extracted"] = self.state.get("tool_01_total_extracted", 0) + count
        self._save_state(self.state)


trial_engine = TrialManager()
