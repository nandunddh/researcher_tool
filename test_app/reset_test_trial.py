"""
reset_test_trial.py
===================
Instantly resets the 7-day evaluation trial counter and the 1,000/day verified leads limit
across all local caches, Windows Registry, and system directories.
"""

import hashlib
import json
import os
import sys
from datetime import datetime
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

SECRET_SALT = "SciProspect_2026_EnterpriseAntiAbuse_v4"
REG_SUBKEY = r"Software\SciProspect"


def _get_machine_fingerprint() -> str:
    guid = ""
    if sys.platform == "win32":
        try:
            import winreg
            with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Cryptography") as key:
                guid, _ = winreg.QueryValueEx(key, "MachineGuid")
        except Exception:
            pass
    if not guid:
        guid = "local-machine-id"
    return hashlib.sha256((guid + SECRET_SALT).encode("utf-8")).hexdigest()[:32]


def _generate_signature(data_str: str, machine_id: str) -> str:
    token = f"{data_str}::{SECRET_SALT}::{machine_id}"
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def reset_trial():
    print("=" * 60)
    print("🔄 SCIPROSPECT TRIAL LIMIT RESET UTILITY")
    print("=" * 60)

    now = datetime.utcnow()
    now_iso = now.isoformat()
    today_str = now.strftime("%Y-%m-%d")
    machine_id = _get_machine_fingerprint()

    fresh_data = {
        "machine_id": machine_id,
        "first_run": now_iso,
        "last_run": now_iso,
        "total_runs": 1,
        "is_expired": False,
        "days_allowed": 7,
        "tool_01_total_extracted": 0,
        "daily_usage": {
            today_str: 0
        }
    }

    raw_str = json.dumps(fresh_data, sort_keys=True)
    sig = _generate_signature(raw_str, machine_id)
    payload = {"data": fresh_data, "sig": sig}

    # 1. Reset Local .license_cache
    for cache_path in [BASE_DIR / ".license_cache", BASE_DIR.parent / ".license_cache"]:
        try:
            with open(cache_path, "w", encoding="utf-8") as f:
                json.dump(payload, f, indent=2)
            print(f"✅ Reset cache file: {cache_path}")
        except Exception as e:
            print(f"⚠️ Could not reset {cache_path}: {e}")

    # 2. Reset Windows Registry
    if sys.platform == "win32":
        try:
            import winreg
            key = winreg.CreateKey(winreg.HKEY_CURRENT_USER, REG_SUBKEY)
            winreg.SetValueEx(key, "TrialData", 0, winreg.REG_SZ, json.dumps(payload))
            winreg.CloseKey(key)
            print("✅ Reset Windows Registry (HKCU\\Software\\SciProspect)")
        except Exception as e:
            print(f"⚠️ Registry reset note: {e}")

    # 3. Reset LocalAppData
    local_app = os.environ.get("LOCALAPPDATA")
    if local_app:
        appdata_file = Path(local_app) / "SciProspect" / ".sciprospect_token"
        try:
            appdata_file.parent.mkdir(parents=True, exist_ok=True)
            with open(appdata_file, "w", encoding="utf-8") as f:
                json.dump(payload, f, indent=2)
            print(f"✅ Reset LocalAppData: {appdata_file}")
        except Exception as e:
            print(f"⚠️ LocalAppData note: {e}")

    # 4. Reset ProgramData
    prog_data = os.environ.get("PROGRAMDATA", "C:\\ProgramData")
    prog_file = Path(prog_data) / "SciProspect" / ".sciprospect_sys"
    try:
        prog_file.parent.mkdir(parents=True, exist_ok=True)
        with open(prog_file, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2)
        print(f"✅ Reset ProgramData: {prog_file}")
    except Exception as e:
        print(f"⚠️ ProgramData note: {e}")

    print("\n🎉 TRIAL SUCCESSFULLY RESET!")
    print(f"• Days Remaining: 7.0 Days")
    print(f"• Today's Verified Leads Used: 0 / 1,000 (1,000 Leads Available)")
    print("=" * 60)


if __name__ == "__main__":
    reset_trial()
