"""
app.py
======
FastAPI backend for SciProspect Scientific Lead Prospecting & Outreach Suite.
Supports both Unrestricted Full Production Mode and Evaluation Trial Mode.
"""

import asyncio
import csv
import json
import os
import re
import subprocess
import sys
import threading
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

import requests
from app_config import get_data_dir, set_data_dir
from license_manager import license_engine

ACTIVE_LICENSE_FILE = Path(__file__).resolve().parent / ".active_license"

def get_current_license_key() -> str:
    if ACTIVE_LICENSE_FILE.exists():
        try:
            k = ACTIVE_LICENSE_FILE.read_text(encoding="utf-8").strip()
            if k:
                return k
        except Exception:
            pass
    return "SCIP-PRO-ROOT-MASTER"

def set_current_license_key(key: str):
    try:
        ACTIVE_LICENSE_FILE.write_text(key.strip(), encoding="utf-8")
    except Exception:
        pass


# -----------------------------------------------------------------------------
# License & Trial Manager Engine
# -----------------------------------------------------------------------------
# If trial_manager is available (e.g. Inno Setup evaluation package), load it;
# Otherwise, automatically operate in Full Production Mode (Unlimited lifetime access).
try:
    from trial_manager import trial_engine
except ImportError:
    _test_app_dir = Path(__file__).resolve().parent / "test_app"
    if (_test_app_dir / "trial_manager.py").exists() and str(_test_app_dir) not in sys.path:
        sys.path.insert(0, str(_test_app_dir))
    try:
        from trial_manager import trial_engine
    except ImportError:
        trial_engine = None

if trial_engine is None:
    class UnlimitedLicenseEngine:
        """Full Unlimited Production Engine (Lifetime Commercial License)."""
        def check_status(self):
            return {
                "active": True,
                "is_trial": False,
                "days_left": "Unlimited",
                "trial_days_left": "Unlimited",
                "verified_today": 0,
                "today_verified": 0,
                "daily_verified_limit": "Unlimited",
                "remaining_verified_today": 999999,
                "license": "SciProspect Professional (Lifetime)",
                "expires_on": "Never (Lifetime License)",
                "message": "SciProspect Professional — Full Lifetime Access"
            }

        def record_extracted_candidates(self, count):
            pass

        def record_verified_lead(self):
            pass

    trial_engine = UnlimitedLicenseEngine()

BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR.parent
DATA_DIR = get_data_dir()

# Auto-detect static folder whether running as source or packaged executable
if (BASE_DIR / "static").exists():
    STATIC_DIR = BASE_DIR / "static"
elif (ROOT_DIR / "static").exists():
    STATIC_DIR = ROOT_DIR / "static"
else:
    STATIC_DIR = BASE_DIR / "static"

DATA_DIR.mkdir(parents=True, exist_ok=True)

def normalize_date_str(date_str: str, default: str) -> str:
    if not date_str:
        return default
    date_str = str(date_str).strip()
    m_iso = re.match(r"^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$", date_str)
    if m_iso:
        y, m, d = m_iso.groups()
        return f"{y}-{int(m):02d}-{int(d):02d}"
    m_eu = re.match(r"^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$", date_str)
    if m_eu:
        d, m, y = m_eu.groups()
        return f"{y}-{int(m):02d}-{int(d):02d}"
    return date_str

app = FastAPI(title="SciProspect - Scientific Lead Prospecting & Data Suite")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

main_loop: Optional[asyncio.AbstractEventLoop] = None

@app.on_event("startup")
async def on_startup():
    global main_loop
    main_loop = asyncio.get_running_loop()

current_process: Optional[subprocess.Popen] = None
process_lock = threading.Lock()
log_queue = asyncio.Queue()
process_state = {
    "status": "idle",
    "current_stage": "",
    "script_name": "",
    "start_time": None,
    "exit_code": None,
    "lines": [],
}


def broadcast_log(line: str, stage: str = "", status: str = "running"):
    timestamp = datetime.now().strftime("%H:%M:%S")
    entry = {"time": timestamp, "text": line, "stage": stage, "status": status}
    process_state["lines"].append(entry)
    if len(process_state["lines"]) > 1500:
        process_state["lines"].pop(0)
    if main_loop and main_loop.is_running():
        try:
            asyncio.run_coroutine_threadsafe(log_queue.put(entry), main_loop)
        except Exception:
            pass


class LogStream:
    def __init__(self, stage):
        self.stage = stage
        self.buf = ""

    def write(self, s):
        if not s:
            return 0
        self.buf += str(s)
        while "\n" in self.buf:
            line, self.buf = self.buf.split("\n", 1)
            clean = line.rstrip()
            if clean:
                broadcast_log(clean, stage=self.stage, status="running")
        return len(s)

    def flush(self):
        if self.buf.strip():
            broadcast_log(self.buf.strip(), stage=self.stage, status="running")
            self.buf = ""


def run_pipeline_worker(action: str, params: dict, script_name: str, stage_name: str):
    global current_process
    process_state["status"] = "running"
    process_state["script_name"] = script_name
    process_state["current_stage"] = stage_name
    process_state["start_time"] = datetime.now().isoformat()
    process_state["lines"] = []
    process_state["exit_code"] = None

    broadcast_log(f"Starting {stage_name}...", stage=stage_name, status="running")

    py_exe = sys.executable
    script_path = BASE_DIR / script_name

    if action == "openalex":
        cmd = [
            py_exe, "-u", str(script_path),
            str(params.get("keyword", "Physical Chemistry")),
            str(params.get("pages", 25)),
            str(params.get("from_date", "2026-01-01")),
            str(params.get("to_date", "2026-01-31")),
        ]
    elif action == "scholarly":
        cmd = [
            py_exe, "-u", str(script_path),
            str(params.get("input_file") or ""),
            str(params.get("target_leads", 1000)),
        ]
    elif action == "nih":
        cmd = [
            py_exe, "-u", str(script_path),
            str(params.get("keyword", "cell biology")),
            str(params.get("target_leads", 100)),
        ]
    elif action in ("unified", "openalex_unified"):
        cmd = [
            py_exe, "-u", str(script_path),
            str(params.get("keyword", "cell biology")),
            str(params.get("target_leads", 1000)),
            str(params.get("min_score", 50)),
            str(params.get("from_date", "2025-01-01")),
            str(params.get("to_date", "2026-12-31")),
        ]
    elif action == "biorxiv":
        cmd = [
            py_exe, "-u", str(script_path),
            str(params.get("keyword", "cell biology")),
            str(params.get("target_leads", 1000)),
            str(params.get("min_score", 50)),
            str(params.get("from_date", "2025-01-01")),
            str(params.get("to_date", "2026-12-31")),
        ]
    else:
        cmd = [py_exe, "-u", str(script_path)]

    try:
        with process_lock:
            current_process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                cwd=str(BASE_DIR),
                universal_newlines=True,
            )

        for line in iter(current_process.stdout.readline, ""):
            clean_line = line.rstrip()
            if clean_line:
                broadcast_log(clean_line, stage=stage_name, status="running")

        current_process.stdout.close()
        return_code = current_process.wait()
        process_state["exit_code"] = return_code

        if return_code == 0:
            process_state["status"] = "completed"
            broadcast_log(f"COMPLETED: {stage_name} finished successfully (exit code 0)", stage=stage_name, status="completed")
        else:
            if process_state["status"] != "stopped":
                process_state["status"] = "error"
                broadcast_log(f"FAILED: {stage_name} exited with code {return_code}", stage=stage_name, status="error")
    except Exception as e:
        process_state["status"] = "error"
        process_state["exit_code"] = 1
        broadcast_log(f"Execution error: {e}", stage=stage_name, status="error")
    finally:
        with process_lock:
            current_process = None


# -----------------------------------------------------------------------------
# Root Admin Console & Client License Endpoints
# -----------------------------------------------------------------------------

@app.get("/admin")
async def get_admin_portal():
    """Serves the Root Admin Licensing Command Center."""
    admin_path = STATIC_DIR / "admin.html"
    if admin_path.exists():
        return FileResponse(admin_path)
    raise HTTPException(status_code=404, detail="Admin portal template not found.")


@app.get("/api/trial/status")
@app.get("/api/license/status")
async def get_license_status(request: Request):
    """Returns license status, validation, and active limits for the current user."""
    user = _get_current_user_from_request(request)
    curr_key = user.get("license_key") if user else get_current_license_key()
    val = license_engine.validate_license(curr_key)
    is_trial = (val.get("tier") == "trial")

    return {
        "active": val.get("valid", False),
        "status": val.get("status", "active"),
        "is_trial": is_trial,
        "tier": val.get("tier", "pro"),
        "license_key": curr_key,
        "client_name": val.get("client_name", "Root Administrator"),
        "client_email": val.get("client_email", ""),
        "days_left": val.get("days_left", "Unlimited"),
        "trial_days_left": val.get("days_left", "Unlimited"),
        "today_verified": val.get("today_verified", 0),
        "verified_today": val.get("today_verified", 0),
        "daily_limit": val.get("daily_limit", "Unlimited"),
        "daily_verified_limit": val.get("daily_limit", "Unlimited"),
        "remaining_verified_today": val.get("remaining_verified_today", 999999),
        "license": f"SciProspect {val.get('tier', 'pro').upper()}",
        "expires_on": val.get("expires_at", "Never (Lifetime License)"),
        "message": val.get("message", "SciProspect Professional — Full Lifetime Access")
    }


@app.post("/api/license/activate")
async def activate_license(request: Request):
    """Allows a user to activate a new Trial or Pro license key."""
    body = await request.json()
    key = body.get("license_key", "").strip()
    if not key:
        raise HTTPException(status_code=400, detail="License key cannot be empty.")
    
    val = license_engine.validate_license(key)
    if not val.get("valid"):
        raise HTTPException(status_code=400, detail=val.get("message", "Invalid license key."))
    
    set_current_license_key(key)
    return {
        "status": "success",
        "message": f"Activated {val.get('tier', 'pro').upper()} license for {val.get('client_name')}.",
        "license": val
    }


# --- ROOT ADMIN APIS ---

def _verify_admin_auth(request: Request):
    auth_header = request.headers.get("X-Root-Auth", "").strip()
    if auth_header and license_engine.verify_root_auth(auth_header):
        return
    # Check session cookie or token
    user = _get_current_user_from_request(request)
    if user and user.get("is_admin"):
        return
    raise HTTPException(status_code=401, detail="Invalid Root Master Password.")



# -------------------------------------------------------------------------
# Unified User Authentication API (/api/auth)
# -------------------------------------------------------------------------

def _get_current_user_from_request(request: Request) -> Optional[dict]:
    """Extracts and validates the current user from session cookie or headers."""
    token = request.cookies.get("scip_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:].strip()
    if not token:
        token = request.headers.get("X-Auth-Token", "").strip()

    if token:
        user = license_engine.get_session(token)
        if user:
            return user
    return None


@app.post("/api/auth/login")
async def api_auth_login(request: Request):
    """
    Unified sign-in endpoint for:
    - License Key Instant Sign-In
    - Email + Password Sign-In
    - Root Admin Sign-In
    """
    body = await request.json()
    identifier = (body.get("identifier") or body.get("license_key") or body.get("email") or "").strip()
    password = (body.get("password") or "").strip()

    if not identifier and not password:
        raise HTTPException(status_code=400, detail="Please enter your License Key or Email and Password.")

    ok, user, msg = license_engine.authenticate(identifier, password if password else None)
    if not ok:
        raise HTTPException(status_code=401, detail=msg)

    token = license_engine.issue_session(user)
    if user.get("license_key"):
        set_current_license_key(user["license_key"])

    res = JSONResponse(content={
        "status": "ok",
        "authenticated": True,
        "token": token,
        "user": user,
        "message": msg
    })
    res.set_cookie(
        key="scip_token",
        value=token,
        max_age=86400 * 7,
        httponly=True,
        samesite="lax",
        secure=False
    )
    return res


@app.get("/api/auth/me")
async def api_auth_me(request: Request):
    """Returns the currently authenticated user or 401 if unauthenticated or suspended."""
    user = _get_current_user_from_request(request)
    if user:
        return {"authenticated": True, "user": user}
    raise HTTPException(
        status_code=401,
        detail="🚨 ACCESS SUSPENDED: Your account is Temporarily stopped. Contact Admin."
    )


@app.post("/api/auth/logout")
async def api_auth_logout(request: Request):
    """Logs out the user and revokes their active session."""
    token = request.cookies.get("scip_token") or request.headers.get("X-Auth-Token", "").strip()
    if token:
        license_engine.revoke_session(token)
    res = JSONResponse(content={"status": "ok", "message": "Signed out successfully."})
    res.delete_cookie(key="scip_token")
    return res


@app.post("/api/admin/login")
async def admin_login(request: Request):
    body = await request.json()
    pwd = body.get("password", "").strip()
    if license_engine.verify_root_auth(pwd):
        return {"status": "ok", "message": "Root console unlocked."}
    raise HTTPException(status_code=401, detail="Incorrect Root Password.")


@app.get("/api/admin/stats")
async def admin_get_stats(request: Request):
    _verify_admin_auth(request)
    return license_engine.get_stats()


@app.get("/api/admin/licenses")
async def admin_list_licenses(
    request: Request,
    search: str = Query(""),
    tier: str = Query("all"),
    status: str = Query("all")
):
    _verify_admin_auth(request)
    return license_engine.list_accounts(search=search, filter_tier=tier, filter_status=status)


@app.post("/api/admin/licenses/create")
async def admin_create_license(request: Request):
    _verify_admin_auth(request)
    body = await request.json()
    name = (body.get("name") or "").strip()
    email = (body.get("email") or "").strip()
    tier = (body.get("tier") or "trial").strip()
    duration = int(body.get("duration_days") or 7)
    limit = int(body.get("daily_limit") if body.get("daily_limit") is not None else (-1 if tier == "pro" else 1000))
    notes = (body.get("notes") or "").strip()

    if not name or not email:
        raise HTTPException(status_code=400, detail="Client name and email are required.")

    password = (body.get("password") or "").strip() or None
    created = license_engine.create_account(
        name=name, email=email, tier=tier, duration_days=duration, daily_limit=limit, notes=notes, password=password
    )
    return created


@app.post("/api/admin/licenses/stop")
async def admin_stop_license(request: Request):
    """Instant Remote Kill Switch."""
    _verify_admin_auth(request)
    body = await request.json()
    key = (body.get("license_key") or "").strip()
    if not key:
        raise HTTPException(status_code=400, detail="License key is required.")
    ok, msg = license_engine.stop_account(key)
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    return {"status": "ok", "message": msg}


@app.post("/api/admin/licenses/resume")
async def admin_resume_license(request: Request):
    """Reactivate suspended license."""
    _verify_admin_auth(request)
    body = await request.json()
    key = (body.get("license_key") or "").strip()
    if not key:
        raise HTTPException(status_code=400, detail="License key is required.")
    ok, msg = license_engine.resume_account(key)
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    return {"status": "ok", "message": msg}


@app.post("/api/admin/licenses/extend")
async def admin_extend_license(request: Request):
    _verify_admin_auth(request)
    body = await request.json()
    key = (body.get("license_key") or "").strip()
    if not key:
        raise HTTPException(status_code=400, detail="License key is required.")
    days = int(body.get("additional_days") or 7)
    ok, msg, acc = license_engine.extend_account(key, days)
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    return {"status": "ok", "message": msg, "account": acc}


@app.post("/api/admin/licenses/upgrade")
async def admin_upgrade_license(request: Request):
    _verify_admin_auth(request)
    body = await request.json()
    key = (body.get("license_key") or "").strip()
    if not key:
        raise HTTPException(status_code=400, detail="License key is required.")
    tier = (body.get("new_tier") or "pro").strip()
    limit = int(body.get("new_limit") if body.get("new_limit") is not None else -1)
    ok, msg, acc = license_engine.upgrade_account(key, tier, limit)
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    return {"status": "ok", "message": msg, "account": acc}


@app.delete("/api/admin/licenses/{license_key}")
async def admin_delete_license(license_key: str, request: Request):
    _verify_admin_auth(request)
    ok, msg = license_engine.delete_account(license_key)
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    if get_current_license_key().strip().upper() == license_key.strip().upper():
        set_current_license_key("SCIP-PRO-ROOT-MASTER")
    return {"status": "ok", "message": msg}



@app.get("/api/config")
async def get_app_config():
    data_dir = get_data_dir()
    return {"data_dir": str(data_dir)}


@app.post("/api/config/data-dir")
async def update_data_dir(request: Request):
    body = await request.json()
    new_dir = body.get("data_dir", "").strip()
    if not new_dir:
        raise HTTPException(status_code=400, detail="Data directory cannot be empty.")
    saved = set_data_dir(new_dir)
    return {"status": "ok", "data_dir": str(saved)}


@app.get("/api/stats")
async def get_stats(request: Request):
    user = _get_current_user_from_request(request)
    curr_key = user.get("license_key") if user else get_current_license_key()
    val = license_engine.validate_license(curr_key)
    is_trial = (val.get("tier") == "trial")

    status = trial_engine.check_status()
    today_str = datetime.now().strftime("%Y-%m-%d")
    data_dir = get_data_dir()
    today_dir = data_dir / today_str

    verified_count = 0
    if today_dir.exists():
        for f in today_dir.glob("*found*.csv"):
            try:
                with open(f, "r", encoding="utf-8", errors="replace") as cf:
                    verified_count += max(0, sum(1 for _ in cf) - 1)
            except Exception:
                pass

    queue_files = []
    pool_count = 0
    for qf in data_dir.glob("*_needto_extract.csv"):
        try:
            with open(qf, "r", encoding="utf-8", errors="replace") as cf:
                c = max(0, sum(1 for _ in cf) - 1)
            pool_count += c
            if c > 0:
                rel = qf.name
                topic_label = qf.stem.replace("_needto_extract", "").replace("_", " ")
                queue_files.append({"path": rel, "name": qf.name, "topic": topic_label, "count": c})
        except Exception:
            pass

    return {
        "central_master_leads": verified_count,
        "today_verified_leads": verified_count,
        "master_pool_total": pool_count,
        "master_pool_unprocessed": pool_count,
        "available_queues": queue_files,
        "today_date": today_str,
        "is_trial": is_trial,
        "license": f"SciProspect {val.get('tier', 'pro').upper()}",
        "trial_days_left": val.get("days_left", "Unlimited") if is_trial else "Unlimited",
        "trial_expires_on": val.get("expires_at", "Never") if is_trial else "Never (Lifetime)",
        "today_verified_used": val.get("today_verified", 0),
        "today_verified_limit": val.get("daily_limit", "Unlimited"),
        "account_status": val.get("status", "active"),
        "data_dir": str(data_dir),
    }


@app.get("/api/datasets")
async def list_datasets():
    data_dir = get_data_dir()
    files = []
    seen_names = set()
    import re

    # Scan both user-configured data_dir and local workspace data folder
    dirs_to_scan = [data_dir]
    local_data = BASE_DIR / "data"
    if local_data.exists() and local_data.resolve() != data_dir.resolve():
        dirs_to_scan.append(local_data)

    csv_items = []
    for d in dirs_to_scan:
        try:
            for p in d.rglob("*.csv"):
                csv_items.append((p, d))
        except Exception:
            pass

    csv_items.sort(key=lambda x: x[0].stat().st_mtime, reverse=True)

    for p, parent_root in csv_items:
        try:
            if p.name in seen_names:
                continue
            seen_names.add(p.name)
            stat = p.stat()
            rel_path = str(p.relative_to(parent_root)).replace("\\", "/")
            
            # Topic & Date identification
            stem = p.stem
            topic = stem.replace("_needto_extract", "").replace("_found", "").replace("_", " ")
            parent_name = p.parent.name
            if re.match(r"^\d{4}-\d{2}-\d{2}$", parent_name):
                date_str = parent_name
            else:
                date_str = datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d")

            files.append({
                "path": rel_path,
                "abs_path": str(p),
                "name": p.name,
                "topic": topic,
                "date": date_str,
                "size_kb": round(stat.st_size / 1024, 1),
                "modified": datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M"),
                "is_queue": "_needto_extract" in p.name,
            })
        except Exception:
            continue
    return {
        "datasets": files,
        "data_dir": str(data_dir)
    }


@app.get("/api/leads")
async def get_leads(file: Optional[str] = Query(None), page: int = Query(1, ge=1), page_size: int = Query(50, ge=10, le=100)):
    data_dir = get_data_dir()
    target = None
    if file:
        candidates = []
        for d in [data_dir, BASE_DIR / "data"]:
            if d and d.exists():
                exact = d / Path(file).name
                if exact.exists() and exact.is_file() and exact.resolve() not in candidates:
                    candidates.append(exact.resolve())
                for match in d.rglob(Path(file).name):
                    if match.exists() and match.is_file() and match.resolve() not in candidates:
                        candidates.append(match.resolve())
        candidates.append(Path(file).resolve())

        for c in candidates:
            if c.exists() and c.is_file():
                target = c
                break

    if not target:
        all_csvs = list(data_dir.rglob("*.csv")) + list((BASE_DIR / "data").rglob("*.csv"))
        all_csvs = [p for p in all_csvs if p.is_file()]
        all_csvs.sort(key=lambda x: x.stat().st_mtime, reverse=True)
        if all_csvs:
            target = all_csvs[0]

    if not target or not target.exists():
        return {"leads": [], "rows": [], "total": 0, "page": 1, "page_size": page_size, "total_pages": 0, "file": None, "current_file": None, "data_dir": str(data_dir)}

    rows = []
    with open(target, "r", encoding="utf-8-sig", errors="replace") as f:
        reader = csv.DictReader(f)
        for r in reader:
            rows.append(r)

    total = len(rows)
    start = (page - 1) * page_size
    end = start + page_size
    paged_rows = rows[start:end]

    file_label = str(target.relative_to(data_dir)).replace("\\", "/") if target.is_relative_to(data_dir) else target.name

    return {
        "leads": paged_rows,
        "rows": paged_rows,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
        "file": file_label,
        "current_file": file_label,
        "data_dir": str(data_dir)
    }


@app.get("/api/leads/export")
async def export_leads(file: Optional[str] = Query(None)):
    data_dir = get_data_dir()
    if not file:
        raise HTTPException(status_code=400, detail="Missing file parameter")
    target = (data_dir / file).resolve()
    if not target.exists() or not target.is_relative_to(data_dir):
        raise HTTPException(status_code=404, detail="Dataset not found")
    return FileResponse(target, filename=target.name, media_type="text/csv")


@app.post("/api/open-folder")
async def open_data_folder():
    data_dir = get_data_dir()
    try:
        import subprocess
        subprocess.Popen(["explorer.exe", str(data_dir)])
        return {"status": "success", "path": str(data_dir)}
    except Exception as e:
        return {"status": "error", "error": str(e)}


@app.post("/api/leads/merge-deduplicate")
async def merge_and_deduplicate_endpoint():
    data_dir = get_data_dir()
    target_files = []
    for p in data_dir.rglob("*.csv"):
        if "_needto_extract" in p.name:
            continue
        if any(token in p.name.lower() for token in ["found", "verified", "nih", "master", "send_ready"]):
            target_files.append(p)

    unified = {}
    total_scanned = 0
    duplicates_count = 0

    preferred_fields = [
        "researcher_name", "professional_email", "affiliations_seen_on_matching_papers",
        "matched_search_terms", "orcid", "example_papers", "example_paper_dois",
        "email_source_url", "review_status", "email_status"
    ]

    for f in target_files:
        try:
            with open(f, "r", encoding="utf-8-sig", errors="replace") as cf:
                reader = csv.DictReader(cf)
                for row in reader:
                    email = (row.get("professional_email") or row.get("email") or "").strip().lower()
                    if not email or "@" not in email:
                        continue
                    total_scanned += 1

                    if email in unified:
                        duplicates_count += 1
                        existing = unified[email]
                        for k in ["orcid", "affiliations_seen_on_matching_papers", "example_paper_dois", "example_papers"]:
                            if not existing.get(k) and row.get(k):
                                existing[k] = row.get(k)
                    else:
                        unified[email] = {k: row.get(k, "") for k in preferred_fields}
                        unified[email]["professional_email"] = email
                        if not unified[email]["review_status"]:
                            unified[email]["review_status"] = "found"
        except Exception:
            continue

    master_path = data_dir / "central_master_leads.csv"
    if unified:
        with open(master_path, "w", encoding="utf-8-sig", newline="") as mf:
            writer = csv.DictWriter(mf, fieldnames=preferred_fields)
            writer.writeheader()
            for r in unified.values():
                writer.writerow(r)

    return {
        "status": "success",
        "files_scanned": len(target_files),
        "total_leads_scanned": total_scanned,
        "duplicates_removed": duplicates_count,
        "unique_master_leads": len(unified),
        "output_file": master_path.name,
    }


@app.post("/api/leads/clear-all")
async def clear_all_leads():
    """Wipes old generated CSV lead files and resets central master to give a fresh, clean slate."""
    data_dir = get_data_dir()
    deleted = []
    clean_master_hdr = (
        "researcher_name,professional_email,match_score,match_rating,data_source,"
        "matched_paper_title,affiliation,orcid,score_breakdown,publication_year,doi,"
        "search_keyword,review_status\n"
    )

    for d in [data_dir, BASE_DIR / "data"]:
        if d.exists():
            for p in list(d.rglob("*.csv")):
                try:
                    if p.name == "central_master_leads.csv":
                        p.write_text(clean_master_hdr, encoding="utf-8-sig")
                    elif "_needto_extract" in p.name:
                        p.write_text("author_name,orcid,paper_title,doi,publication_year,institutions,is_corresponding,search_keyword\n", encoding="utf-8-sig")
                    else:
                        p.unlink(missing_ok=True)
                    deleted.append(p.name)
                except Exception:
                    pass
            # Also clean date subfolders
            for sub in list(d.glob("*")):
                if sub.is_dir() and re.match(r"^\d{4}-\d{2}-\d{2}$", sub.name):
                    try:
                        import shutil
                        shutil.rmtree(sub, ignore_errors=True)
                    except Exception:
                        pass

    # Ensure central_master_leads.csv exists in both data folders with clean header
    for d in [data_dir, BASE_DIR / "data"]:
        mf = d / "central_master_leads.csv"
        if not mf.exists():
            try:
                d.mkdir(parents=True, exist_ok=True)
                mf.write_text(clean_master_hdr, encoding="utf-8-sig")
            except Exception:
                pass

    return {
        "status": "success",
        "message": f"Successfully cleared {len(deleted)} old dataset files. System is completely clean and ready.",
        "deleted_files": len(deleted)
    }



@app.post("/api/pipeline/run")
@app.post("/api/pipeline/start")
async def start_pipeline(request: Request):
    if process_state["status"] == "running":
        raise HTTPException(status_code=400, detail="A task is already actively running.")

    # Enforce Root License Validation & Remote Kill-Switch
    curr_key = get_current_license_key()
    val = license_engine.validate_license(curr_key)
    if not val.get("valid"):
        broadcast_log(f"🚨 ACCESS BLOCKED: {val.get('message')}", status="error")
        raise HTTPException(
            status_code=403,
            detail=val.get("message", "🚨 ACCESS SUSPENDED: Your account is Temporarily stopped. Contact Admin.")
        )

    body = await request.json()
    action = body.get("action", "openalex")
    keyword = body.get("keyword", "Physical Chemistry").strip()
    pages = int(body.get("pages", 25))
    from_date = body.get("from_date", "2026-01-01").strip()
    to_date = body.get("to_date", "2026-01-31").strip()

    params = {
        "keyword": keyword,
        "pages": pages,
        "from_date": from_date,
        "to_date": to_date,
    }

    if action == "openalex":
        script_name = "01_extract_researchers.py"
        stage_name = f"OpenAlex Discovery ({keyword} | {from_date} to {to_date})"

    elif action == "scholarly":
        target_leads = int(body.get("target_leads", 1000))
        input_file = body.get("input_file", "").strip()
        params["input_file"] = input_file
        params["target_leads"] = target_leads
        script_name = "02_collect_scholarly_emails.py"
        stage_name = f"Scholarly Verification ({Path(input_file).name if input_file else 'Active Queue'} | Target: {target_leads})"

    elif action == "nih":
        keyword = body.get("keyword", "cell biology").strip()
        leads = int(body.get("target_leads", 100))
        params["keyword"] = keyword
        params["target_leads"] = leads
        script_name = "04_extract_nih_researchers.py"
        stage_name = f"NIH Funded PIs ({keyword} | Target: {leads})"

    elif action in ("unified", "openalex_unified"):
        keyword = body.get("keyword", "cell biology").strip()
        target_leads = int(body.get("target_leads", 1000))
        min_score = int(body.get("min_score", 50))
        from_date = normalize_date_str(body.get("from_date"), "2025-01-01")
        to_date = normalize_date_str(body.get("to_date"), "2026-12-31")
        params["keyword"] = keyword
        params["target_leads"] = target_leads
        params["min_score"] = min_score
        params["from_date"] = from_date
        params["to_date"] = to_date
        script_name = "03_unified_lead_pipeline.py"
        stage_name = f"Source 1: OpenAlex Pipeline ({keyword} | {from_date} to {to_date} | Target: {target_leads:,} | Score >= {min_score})"

    elif action == "biorxiv":
        keyword = body.get("keyword", "cell biology").strip()
        target_leads = int(body.get("target_leads", 1000))
        min_score = int(body.get("min_score", 50))
        from_date = normalize_date_str(body.get("from_date"), "2025-01-01")
        to_date = normalize_date_str(body.get("to_date"), "2026-12-31")
        params["keyword"] = keyword
        params["target_leads"] = target_leads
        params["min_score"] = min_score
        params["from_date"] = from_date
        params["to_date"] = to_date
        script_name = "06_extract_biorxiv_researchers.py"
        stage_name = f"Source 2: bioRxiv Pipeline ({keyword} | {from_date} to {to_date} | Target: {target_leads:,} | Score >= {min_score})"
    else:
        raise HTTPException(status_code=400, detail=f"Action '{action}' is not supported.")

    worker = threading.Thread(
        target=run_pipeline_worker,
        args=(action, params, script_name, stage_name),
        daemon=True
    )
    worker.start()
    return {"status": "started", "stage": stage_name, "script": script_name}


@app.post("/api/pipeline/stop")
async def stop_pipeline():
    global current_process
    with process_lock:
        if current_process is not None and current_process.poll() is None:
            try:
                current_process.terminate()
            except Exception:
                pass
    process_state["status"] = "stopped"
    broadcast_log("Pipeline stopped by user request.", status="stopped")
    return {"status": "stopped"}


@app.get("/api/pipeline/status")
async def get_pipeline_status():
    return {
        "status": process_state["status"],
        "stage": process_state["current_stage"],
        "script": process_state["script_name"],
        "recent_logs": process_state["lines"][-80:],
    }


@app.get("/api/pipeline/stream")
async def stream_logs(request: Request):
    async def event_generator():
        for entry in process_state["lines"][-30:]:
            yield f"data: {json.dumps(entry)}\n\n"
        while True:
            if await request.is_disconnected():
                break
            try:
                entry = await asyncio.wait_for(log_queue.get(), timeout=2.0)
                yield f"data: {json.dumps(entry)}\n\n"
            except (asyncio.TimeoutError, TimeoutError):
                yield "data: {\"type\": \"heartbeat\"}\n\n"
            except (asyncio.CancelledError, GeneratorExit):
                break

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"}
    )


# -----------------------------------------------------------------------------
# GitHub Auto-Updater Endpoints
# -----------------------------------------------------------------------------
def load_app_version() -> str:
    candidates = [
        BASE_DIR / "version.json",
        ROOT_DIR / "version.json",
        BASE_DIR / "_internal" / "version.json",
    ]
    if getattr(sys, "frozen", False):
        exe_dir = Path(sys.executable).parent
        candidates.extend([exe_dir / "version.json", exe_dir / "_internal" / "version.json"])
    for p in candidates:
        if p.exists():
            try:
                data = json.loads(p.read_text(encoding="utf-8"))
                v = data.get("latest_version")
                if v:
                    return v.strip()
            except Exception:
                pass
    return "1.0.1"


CURRENT_VERSION = load_app_version()
GITHUB_REPO = "nandunddh/researcher_tool"

download_state = {
    "status": "idle",
    "percent": 0,
    "downloaded_bytes": 0,
    "total_bytes": 0,
    "file_path": None,
    "error": None,
}


def parse_version_tuple(v_str: str):
    clean = re.sub(r"[^\d.]", "", str(v_str).strip())
    parts = [int(p) for p in clean.split(".") if p.isdigit()]
    while len(parts) < 3:
        parts.append(0)
    return tuple(parts[:3])


@app.get("/api/update/check")
async def check_for_updates():
    raw_url = f"https://raw.githubusercontent.com/{GITHUB_REPO}/main/version.json"
    api_url = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"

    headers = {"User-Agent": "SciProspect-Updater/1.0"}

    manifest = None
    try:
        r = requests.get(raw_url, headers=headers, timeout=5)
        if r.status_code == 200:
            manifest = r.json()
    except Exception:
        pass

    if not manifest:
        try:
            r = requests.get(api_url, headers=headers, timeout=5)
            if r.status_code == 200:
                rel = r.json()
                tag = rel.get("tag_name", "").lstrip("v")
                dl_url = f"https://github.com/{GITHUB_REPO}/releases/latest/download/SciProspect_Setup.exe"
                for asset in rel.get("assets", []):
                    if asset.get("name") == "SciProspect_Setup.exe":
                        dl_url = asset.get("browser_download_url")
                        break
                manifest = {
                    "latest_version": tag,
                    "release_date": rel.get("published_at", "")[:10],
                    "download_url": dl_url,
                    "changelog": [line.strip("- ") for line in rel.get("body", "").split("\n") if line.strip()],
                    "mandatory": False,
                }
        except Exception:
            pass

    # Fallback to local version.json for testing if offline
    if not manifest:
        candidate_paths = [
            BASE_DIR / "version.json",
            ROOT_DIR / "version.json",
            Path("version.json").resolve(),
        ]
        if getattr(sys, "frozen", False):
            exe_dir = Path(sys.executable).parent
            candidate_paths.extend([
                exe_dir / "version.json",
                exe_dir / "_internal" / "version.json"
            ])
        for p in candidate_paths:
            if p.exists():
                try:
                    manifest = json.loads(p.read_text(encoding="utf-8"))
                    break
                except Exception:
                    pass

    if not manifest:
        return {
            "current_version": CURRENT_VERSION,
            "latest_version": CURRENT_VERSION,
            "update_available": False,
            "error": "Could not connect to update server. Please check your internet connection.",
        }

    latest_ver = manifest.get("latest_version", CURRENT_VERSION)
    current_tuple = parse_version_tuple(CURRENT_VERSION)
    latest_tuple = parse_version_tuple(latest_ver)

    is_newer = latest_tuple > current_tuple

    return {
        "current_version": CURRENT_VERSION,
        "latest_version": latest_ver,
        "update_available": is_newer,
        "release_date": manifest.get("release_date", ""),
        "download_url": manifest.get("download_url", ""),
        "changelog": manifest.get("changelog", []),
        "mandatory": manifest.get("mandatory", False),
    }


@app.post("/api/update/download")
async def download_update(request: Request):
    body = await request.json()
    url = body.get("download_url")
    if not url:
        raise HTTPException(status_code=400, detail="Missing download_url")

    def download_worker(dl_url):
        import tempfile
        download_state["status"] = "downloading"
        download_state["percent"] = 0
        download_state["error"] = None
        try:
            temp_dir = Path(tempfile.gettempdir()) / "SciProspectUpdate"
            temp_dir.mkdir(parents=True, exist_ok=True)
            installer_path = temp_dir / "SciProspect_Setup.exe"

            # If download URL is local or remote
            if dl_url.startswith("http"):
                resp = requests.get(dl_url, stream=True, timeout=60)
                total_size = int(resp.headers.get("content-length", 0))
                download_state["total_bytes"] = total_size

                downloaded = 0
                with open(installer_path, "wb") as f:
                    for chunk in resp.iter_content(chunk_size=65536):
                        if chunk:
                            f.write(chunk)
                            downloaded += len(chunk)
                            download_state["downloaded_bytes"] = downloaded
                            if total_size > 0:
                                download_state["percent"] = min(99, int((downloaded / total_size) * 100))
            else:
                src = Path(dl_url)
                if src.exists():
                    import shutil
                    shutil.copyfile(src, installer_path)

            download_state["percent"] = 100
            download_state["file_path"] = str(installer_path)
            download_state["status"] = "ready"
        except Exception as e:
            download_state["status"] = "error"
            download_state["error"] = str(e)

    threading.Thread(target=download_worker, args=(url,), daemon=True).start()
    return {"status": "started"}


@app.get("/api/update/progress")
async def get_update_progress():
    return download_state


@app.post("/api/update/install")
async def launch_installer():
    path = download_state.get("file_path")
    if not path or not Path(path).exists():
        raise HTTPException(status_code=400, detail="No downloaded installer found.")
    try:
        subprocess.Popen([path])
        return {"status": "launched"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Mount static assets
if STATIC_DIR.exists():
    app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=False)
