"""
app_config.py
==============
Manages configurable data storage directory for SciProspect.
Allows user to choose any custom folder (e.g., C:\\SciProspect Data, D:\\Leads, etc.)
to store only their lead datasets and extraction files.
"""

import json
import os
import sys
from pathlib import Path


def _get_app_root() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


APP_ROOT = _get_app_root()
CONFIG_FILE = APP_ROOT / "config.json"
LOCALAPPDATA_DIR = Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) / "SciProspect"
APPDATA_CONFIG = LOCALAPPDATA_DIR / "config.json"


def get_data_dir() -> Path:
    """Returns the user-selected data directory, or defaults to Documents\\SciProspect Data."""
    # 1. Check APP_ROOT / config.json
    # 2. Check APP_ROOT / _internal / config.json (if frozen)
    # 3. Check %LOCALAPPDATA% / SciProspect / config.json
    candidates = [
        CONFIG_FILE,
        APP_ROOT / "_internal" / "config.json",
        APPDATA_CONFIG,
    ]

    for p in candidates:
        if p.exists():
            try:
                with open(p, "r", encoding="utf-8") as f:
                    cfg = json.load(f)
                    d = cfg.get("data_dir")
                    if d:
                        target = Path(d).resolve()
                        target.mkdir(parents=True, exist_ok=True)
                        return target
            except Exception:
                pass

    # Default fallback: Documents / SciProspect Data
    user_docs = Path(os.environ.get("USERPROFILE", str(Path.home()))) / "Documents" / "SciProspect Data"
    try:
        user_docs.mkdir(parents=True, exist_ok=True)
        return user_docs
    except Exception:
        fallback = APP_ROOT / "data"
        fallback.mkdir(parents=True, exist_ok=True)
        return fallback


def set_data_dir(new_path: str) -> Path:
    """Updates and saves the user-selected data directory."""
    target = Path(new_path).resolve()
    target.mkdir(parents=True, exist_ok=True)
    cfg_data = {"data_dir": str(target)}

    # Save to APP_ROOT
    try:
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(cfg_data, f, indent=2)
    except Exception:
        pass

    # Save to %LOCALAPPDATA% (survives app updates / reinstalls)
    try:
        LOCALAPPDATA_DIR.mkdir(parents=True, exist_ok=True)
        with open(APPDATA_CONFIG, "w", encoding="utf-8") as f:
            json.dump(cfg_data, f, indent=2)
    except Exception:
        pass

    return target
