"""
trial_manager.py
================
Enterprise-grade 7-Day Evaluation Trial Controller for Local Testing.

Specific Evaluation Quotas:
1. Tool 01 (Extraction Pool): Up to 10,000 researcher candidate records.
2. Tool 02 (Verification & Enrichment): Up to 1,000 verified emails PER CALENDAR DAY.
3. Duration: 7 Days from first launch.
4. Anti-Tamper: Real network UTC time check + clock rollback detection + SHA256 signature.
"""

import hashlib
import json
import os
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path

TRIAL_DURATION_DAYS = 7
TOOL_01_MAX_TOTAL_RECORDS = 10000
TOOL_02_DAILY_VERIFIED_LIMIT = 1000

BASE_DIR = Path(__file__).resolve().parent
STATE_FILE = BASE_DIR / ".license_cache"
SECRET_SALT = "SciNexus_2026_SecureTrialToken_v2"


def _generate_signature(data_str: str) -> str:
    return hashlib.sha256((data_str + SECRET_SALT).encode("utf-8")).hexdigest()


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
                # Format: Fri, 23 Oct 2026 09:45:00 GMT
                net_date = datetime.strptime(date_str[:25], "%a, %d %b %Y %H:%M:%S")
                return net_date
    except Exception:
        pass
    return datetime.utcnow()


class TrialManager:
    def __init__(self):
        self.state = self._load_or_init_state()

    def _load_or_init_state(self) -> dict:
        now = get_current_date()
        today_str = now.strftime("%Y-%m-%d")
        now_iso = now.isoformat()

        if not STATE_FILE.exists():
            state = {
                "first_run": now_iso,
                "last_run": now_iso,
                "total_runs": 1,
                "is_expired": False,
                "days_allowed": TRIAL_DURATION_DAYS,
                "tool_01_total_extracted": 0,
                "daily_usage": {
                    today_str: 0  # verified emails today
                }
            }
            self._save_state(state)
            return state

        try:
            with open(STATE_FILE, "r", encoding="utf-8") as f:
                payload = json.load(f)

            sig = payload.get("sig")
            data = payload.get("data", {})
            raw_str = json.dumps(data, sort_keys=True)

            # 1. Manual file tampering check
            if _generate_signature(raw_str) != sig:
                data["is_expired"] = True
                return data

            # 2. Clock rollback check
            last_run = datetime.fromisoformat(data["last_run"])
            if now < (last_run - timedelta(hours=1)):
                data["is_expired"] = True
                return data

            data["last_run"] = now_iso
            data["total_runs"] = data.get("total_runs", 0) + 1
            if "daily_usage" not in data:
                data["daily_usage"] = {}
            if today_str not in data["daily_usage"]:
                data["daily_usage"][today_str] = 0

            self._save_state(data)
            return data
        except Exception:
            return {"is_expired": True, "error": "Corrupted trial state"}

    def _save_state(self, data: dict):
        raw_str = json.dumps(data, sort_keys=True)
        sig = _generate_signature(raw_str)
        with open(STATE_FILE, "w", encoding="utf-8") as f:
            json.dump({"data": data, "sig": sig}, f, indent=2)

    def check_status(self) -> dict:
        """Returns days remaining, daily verification allowance, and active limits."""
        now = get_current_date()
        today_str = now.strftime("%Y-%m-%d")

        if self.state.get("is_expired"):
            return {
                "active": False,
                "days_left": 0,
                "reason": "Trial period expired or clock rollback detected.",
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
