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
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse, HTMLResponse, Response, RedirectResponse
from fastapi.staticfiles import StaticFiles

import requests
sys.path.insert(0, str(Path(__file__).resolve().parent))
from app_config import get_data_dir, set_data_dir
from public_site import FormRateLimit, published_page
sys.path.append(str(Path(__file__).resolve().parent.parent / "app" / "main"))
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
    return ""

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
    script_path = ROOT_DIR / "app" / "main" / script_name

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
    elif action in ("unified", "openalex_unified", "auto") :
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
                encoding="utf-8",
                errors="replace",
                env={**os.environ, "PYTHONIOENCODING": "utf-8"},
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
async def get_admin_portal(request: Request):
    """Serves the Root Admin Licensing Command Center."""
    admin_path = STATIC_DIR / "admin.html"
    if admin_path.exists():
        section = request.query_params.get("section")
        if section in ("add", "manage"):
            _verify_admin_auth(request)
            html = admin_path.read_text(encoding="utf-8")
            html = html.replace("</head>", '<link rel="stylesheet" href="/admin-workspace.css?v=10"><style>.admin-header,.console-banner,.kpi-grid{display:none!important}.content-grid{display:block!important}body[data-root-section="add"] .content-grid>.card-panel:nth-child(2),body[data-root-section="manage"] .content-grid>.card-panel:first-child{display:none!important}</style></head>')
            html = html.replace("<body>", '<body data-root-section="' + section + '">')
            return HTMLResponse(html)
        return FileResponse(admin_path)
    raise HTTPException(status_code=404, detail="Admin portal template not found.")


@app.get("/api/trial/status")
@app.get("/api/license/status")
async def get_license_status(request: Request):
    """Returns license status, validation, and active limits for the current user."""
    user = _require_authenticated_user(request)
    curr_key = user.get("license_key") or ""
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

def _extract_token_from_request(request: Request) -> Optional[str]:
    token = request.cookies.get("scip_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:].strip()
    if not token:
        token = request.headers.get("X-Auth-Token", "").strip()
    return token or None

def _get_current_user_from_request(request: Request) -> Optional[dict]:
    """Extracts and validates the current user from session cookie or headers."""
    token = _extract_token_from_request(request)
    if token:
        user = license_engine.get_session(token)
        if user:
            return user
    return None


def _require_authenticated_user(request: Request) -> dict:
    """
    Enforces that the request has an active, valid session.
    If not authenticated, raises HTTP 401.
    If authenticated but account is suspended/stopped/expired, raises HTTP 403.
    """
    token = _extract_token_from_request(request)
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required. Please sign in.")
    
    user, err = license_engine.get_session_info(token)
    if not user:
        if err and "SUSPENDED" in err:
            raise HTTPException(status_code=403, detail="🚨 ACCESS SUSPENDED: Your account is Temporarily stopped. Contact Admin.")
        raise HTTPException(status_code=401, detail="Session expired or invalid. Please sign in.")
    
    # Real-time kill switch verification for non-admin accounts
    if not user.get("is_admin"):
        key = user.get("license_key")
        if key:
            val = license_engine.validate_license(key)
            if not val.get("valid") or val.get("status") == "stopped":
                raise HTTPException(status_code=403, detail="🚨 ACCESS SUSPENDED: Your account is Temporarily stopped. Contact Admin.")
    return user


def _require_page_user(request: Request):
    """Returns authenticated user for HTML workspace routes, or redirects browser navigations to '/'."""
    try:
        return _require_authenticated_user(request), None
    except HTTPException:
        accept = (request.headers.get("accept") or "").lower()
        if "text/html" in accept:
            return None, RedirectResponse(url="/", status_code=307)
        raise


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
        raise HTTPException(status_code=400, detail="Please enter your Email and Password.")

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
    secure_cookie = request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https"
    res.set_cookie(
        key="scip_token",
        value=token,
        max_age=86400 * 7,
        httponly=True,
        samesite="lax",
        secure=secure_cookie
    )
    return res


_reset_rate_limit = FormRateLimit(limit=5, seconds=900)
RESET_SENT = "If an account exists for this email, we've sent a link to reset the password. Check your inbox."


@app.post("/api/auth/forgot-password/request")
async def api_auth_forgot_request(request: Request):
    """Emails a one-time reset link. Same answer whether or not the email exists, so accounts can't be discovered."""
    import password_reset
    client = getattr(request, "client", None)
    if not _reset_rate_limit.allow(client.host if client else "unknown"):
        raise HTTPException(status_code=429, detail="Too many requests. Please try again in a few minutes.")
    try:
        email = str((await request.json()).get("email") or "").strip().lower()
    except Exception:
        raise HTTPException(status_code=400, detail="Please enter your account email.")
    ok, _msg, _code = license_engine.check_password_reset_email(email)
    if ok:
        try:
            password_reset.send_link(email)
        except Exception as exc:  # never reveal delivery problems for a specific address
            print(f"[RESET] Email delivery failed: {type(exc).__name__}")
    return {"status": "ok", "message": RESET_SENT}


@app.post("/api/auth/forgot-password/confirm")
async def api_auth_forgot_confirm(request: Request):
    """Sets a new password with a valid one-time link; signs the account out everywhere."""
    import password_reset
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid request.")
    new_password = str(body.get("new_password") or "").strip()
    if len(new_password) < 8:
        raise HTTPException(status_code=400, detail="Use at least 8 characters for your new password.")
    email = password_reset.use_token(str(body.get("token") or ""))
    if not email:
        raise HTTPException(status_code=400, detail="This reset link is invalid or has expired. Please request a new one.")
    ok, msg, code = license_engine.reset_password_by_email(email, new_password)
    if not ok:
        raise HTTPException(status_code=code, detail=msg)
    return {"status": "ok", "message": "Your password has been updated. You can now sign in."}


@app.get("/api/auth/me")
async def api_auth_me(request: Request):
    """Returns the currently authenticated user or 401 with appropriate reason."""
    token = _extract_token_from_request(request)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    user, err = license_engine.get_session_info(token)
    if user:
        # Both frontends use the server's role decision; never infer tenancy from a URL.
        return {"authenticated": True, "user": {**user, "workspace_namespace": _page_namespace(user)}}

    if err and "SUSPENDED" in err:
        res = JSONResponse(status_code=401, content={"detail": err})
        res.delete_cookie(key="scip_token")
        return res

    res = JSONResponse(status_code=401, content={"detail": err or "Not authenticated"})
    res.delete_cookie(key="scip_token")
    return res


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


@app.get("/root-dashboard")
async def root_dashboard(request: Request):
    user, redirect_resp = _require_page_user(request)
    if redirect_resp:
        return redirect_resp
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Root administrator access required")
    return RedirectResponse(url="/root/dashboard", status_code=307)


@app.get("/api/admin/overview")
async def root_overview(request: Request):
    _verify_admin_auth(request)
    fields = ("client_name", "client_email", "org_name", "account_type", "tier", "status", "expires_at", "daily_limit", "seat_limit", "scistudio_access", "created_at")
    accounts = []
    for account in license_engine.list_accounts():
        item = {key: account.get(key) for key in fields}
        item["is_root"] = account.get("license_key") == "SCIP-PRO-ROOT-MASTER"
        item["members"] = [{key: member.get(key) for key in ("name", "email", "role", "scistudio_access", "created_at")} for member in account.get("members", [])]
        accounts.append(item)
    return {"accounts": accounts}


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
    tier = (body.get("tier") or "trial").strip().lower()

    if not name:
        raise HTTPException(status_code=400, detail="Client name is required.")
    if not email or "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(status_code=400, detail="A valid client email address is required.")
    if tier not in ("trial", "pro"):
        raise HTTPException(status_code=400, detail="Tier must be either 'trial' or 'pro'.")

    account_type = (body.get("account_type") or "single").strip().lower()
    if account_type not in ("single", "org"):
        raise HTTPException(status_code=400, detail="Account type must be 'single' or 'org'.")

    try:
        duration = int(body.get("duration_days") or (30 if tier == "pro" else 7))
        if tier == "trial" and (duration <= 0 or duration > 365):
            raise ValueError()
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Trial duration must be a positive number of days up to 365.")

    raw_limit = body.get("daily_limit")
    try:
        limit = int(raw_limit if raw_limit is not None else (-1 if tier == "pro" else 1000))
        if limit < -1:
            raise ValueError()
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Daily limit must be -1 (unlimited) or a non-negative integer.")

    raw_seats = body.get("seat_limit")
    if account_type == "org":
        try:
            seat_limit = int(raw_seats if raw_seats is not None else 5)
            if seat_limit < 1:
                raise ValueError()
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="Seat limit must be at least 1.")
    else:
        seat_limit = 1

    notes = (body.get("notes") or "").strip()
    scistudio_access = bool(body.get("scistudio_access", True))
    org_name = (body.get("org_name") or "").strip()
    can_invite_users = bool(body.get("can_invite_users", account_type == "org"))

    password = (body.get("password") or "").strip() or None
    try:
        created = license_engine.create_account(
            name=name,
            email=email,
            tier=tier,
            duration_days=duration,
            daily_limit=limit,
            notes=notes,
            password=password,
            scistudio_access=scistudio_access,
            account_type=account_type,
            org_name=org_name,
            can_invite_users=can_invite_users,
            seat_limit=seat_limit,
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    return created


@app.get("/api/admin/licenses/org-members/{license_key}")
async def admin_get_org_members(license_key: str, request: Request):
    _verify_admin_auth(request)
    account = license_engine.get_account(license_key)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found.")
    safe_members = [
        {
            "member_id": m.get("member_id", ""),
            "name": m.get("name", ""),
            "email": m.get("email", ""),
            "role": m.get("role", "viewer"),
            "scistudio_access": bool(m.get("scistudio_access", True)),
            "created_at": m.get("created_at", ""),
        }
        for m in account.get("members", [])
    ]
    return {
        "license_key": license_key,
        "account_type": account.get("account_type", "single"),
        "org_name": account.get("org_name", ""),
        "seat_limit": account.get("seat_limit", 5),
        "members": safe_members,
    }


@app.post("/api/admin/licenses/org-members/add")
async def admin_add_org_member(request: Request):
    _verify_admin_auth(request)
    body = await request.json()
    parent_key = (body.get("license_key") or "").strip()
    name = (body.get("name") or "").strip()
    email = (body.get("email") or "").strip()
    role = (body.get("role") or "editor").strip()
    scistudio_access = bool(body.get("scistudio_access", True))
    password = (body.get("password") or "").strip() or None

    ok, msg, member = license_engine.add_org_member(
        parent_key=parent_key,
        name=name,
        email=email,
        role=role,
        scistudio_access=scistudio_access,
        password=password,
    )
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    return {"status": "ok", "message": msg, "member": member}


@app.post("/api/admin/licenses/org-members/remove")
async def admin_remove_org_member(request: Request):
    _verify_admin_auth(request)
    body = await request.json()
    parent_key = (body.get("license_key") or "").strip()
    member_id = (body.get("member_id") or "").strip()
    ok, msg = license_engine.remove_org_member(parent_key, member_id)
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    return {"status": "ok", "message": msg}


@app.post("/api/admin/licenses/org-members/toggle-scistudio")
async def admin_toggle_member_scistudio(request: Request):
    _verify_admin_auth(request)
    body = await request.json()
    parent_key = (body.get("license_key") or "").strip()
    member_id = (body.get("member_id") or "").strip()
    enabled = body.get("enabled")
    ok, msg, member = license_engine.toggle_member_scistudio(parent_key, member_id, enable=enabled)
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    return {"status": "ok", "message": msg, "member": member}


@app.post("/api/admin/licenses/toggle-scistudio")
async def admin_toggle_scistudio(request: Request):
    """Toggle SciStudio website builder access for a client account."""
    _verify_admin_auth(request)
    body = await request.json()
    key = (body.get("license_key") or "").strip()
    if not key:
        raise HTTPException(status_code=400, detail="License key is required.")
    enabled = body.get("enabled")
    if enabled is not None:
        enabled = bool(enabled)
    ok, msg, acc = license_engine.toggle_scistudio_access(key, enable=enabled)
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    return {"status": "ok", "message": msg, "account": acc}


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
    raw_days = body.get("additional_days")
    try:
        days = int(raw_days if raw_days is not None else 7)
        if days <= 0 or days > 365:
            raise ValueError()
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Additional days must be a positive integer up to 365.")
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
    if key.upper() == "SCIP-PRO-ROOT-MASTER":
        raise HTTPException(status_code=400, detail="Cannot modify tier for root master account.")
    tier = (body.get("new_tier") or "pro").strip().lower()
    if tier not in ("trial", "pro"):
        raise HTTPException(status_code=400, detail="Tier must be either 'trial' or 'pro'.")
    raw_limit = body.get("new_limit")
    try:
        limit = int(raw_limit if raw_limit is not None else -1)
        if limit < -1:
            raise ValueError()
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Daily limit must be -1 (unlimited) or a non-negative integer.")
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


# --- ORGANIZATION OWNER APIS ---

def _require_org_owner(request: Request):
    user = _get_current_user_from_request(request)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required. Please sign in.")
    if user.get("is_admin"):
        return user
    if user.get("is_member"):
        raise HTTPException(status_code=403, detail="Organization owner access required.")
    account = license_engine.get_account(user.get("license_key", ""))
    if not account or account.get("account_type") != "org":
        raise HTTPException(status_code=403, detail="Organization account required.")
    return user


@app.get("/api/organization/overview")
async def organization_overview(request: Request):
    user = _require_org_owner(request)
    key = user.get("license_key", "")
    account = license_engine.get_account(key)
    if not account:
        raise HTTPException(status_code=404, detail="Organization account not found.")

    expires_at = account.get("expires_at", "never")
    days_left = "Lifetime"
    if expires_at != "never":
        try:
            exp_dt = datetime.strptime(expires_at.replace(" UTC", ""), "%Y-%m-%d %H:%M:%S")
            diff = exp_dt - datetime.utcnow()
            days_left = "Expired" if diff.total_seconds() <= 0 else f"{max(0, diff.days)} days"
        except Exception:
            days_left = "Unknown"

    conferences = conference_engine.list_conferences(
        owner_email=user.get("client_email", ""),
        is_admin=False,
        owner_license_key=key
    )

    safe_members = [
        sanitize_member(m) for m in account.get("members", [])
    ]

    return {
        "license_key": key,
        "org_name": account.get("org_name") or account.get("client_name", "Organization"),
        "client_name": account.get("client_name", ""),
        "client_email": account.get("client_email", ""),
        "tier": account.get("tier", "pro"),
        "status": account.get("status", "active"),
        "days_left": days_left,
        "expires_at": expires_at,
        "seat_limit": account.get("seat_limit", 5),
        "daily_limit": account.get("daily_limit", -1),
        "used_today": account.get("used_today", 0),
        "scistudio_access": bool(account.get("scistudio_access", True)),
        "members": safe_members,
        "conferences": conferences,
    }


@app.post("/api/organization/team/add")
async def organization_team_add(request: Request):
    user = _require_org_owner(request)
    key = user.get("license_key", "")
    body = await request.json()
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Member name is required.")
    email = (body.get("email") or "").strip()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="A valid member email address is required.")
    role = (body.get("role") or "editor").strip().lower()
    if role not in ("admin", "editor", "viewer"):
        raise HTTPException(status_code=400, detail="Role must be 'admin', 'editor', or 'viewer'.")
    scistudio_access = bool(body.get("scistudio_access", True))
    password = (body.get("password") or "").strip() or None

    ok, msg, member = license_engine.add_org_member(
        parent_key=key,
        name=name,
        email=email,
        role=role,
        scistudio_access=scistudio_access,
        password=password,
    )
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    return {"status": "ok", "message": msg, "member": member}


@app.post("/api/organization/team/remove")
async def organization_team_remove(request: Request):
    user = _require_org_owner(request)
    key = user.get("license_key", "")
    body = await request.json()
    member_id = (body.get("member_id") or "").strip()
    if not member_id:
        raise HTTPException(status_code=400, detail="Member ID is required.")
    ok, msg = license_engine.remove_org_member(key, member_id)
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    return {"status": "ok", "message": msg}


@app.post("/api/organization/team/toggle-scistudio")
async def organization_team_toggle_studio(request: Request):
    user = _require_org_owner(request)
    key = user.get("license_key", "")
    body = await request.json()
    member_id = (body.get("member_id") or "").strip()
    if not member_id:
        raise HTTPException(status_code=400, detail="Member ID is required.")
    enabled = body.get("enabled")
    ok, msg, member = license_engine.toggle_member_scistudio(key, member_id, enable=enabled)
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    return {"status": "ok", "message": msg, "member": member}


# --- CLIENT (SOLO RESEARCHER) APIS ---

def _require_client_owner(request: Request):
    user = _get_current_user_from_request(request)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required. Please sign in.")
    if user.get("is_admin"):
        return user
    if user.get("is_member"):
        raise HTTPException(status_code=403, detail="Client owner access required.")
    account = license_engine.get_account(user.get("license_key", ""))
    if not account or account.get("account_type") != "single":
        raise HTTPException(status_code=403, detail="Individual client account required.")
    return user


@app.get("/api/client/overview")
async def client_overview(request: Request):
    user = _require_client_owner(request)
    key = user.get("license_key", "")
    account = license_engine.get_account(key)
    if not account:
        raise HTTPException(status_code=404, detail="Client account not found.")

    expires_at = account.get("expires_at", "never")
    days_left = "Lifetime"
    if expires_at != "never":
        try:
            exp_dt = datetime.strptime(expires_at.replace(" UTC", ""), "%Y-%m-%d %H:%M:%S")
            diff = exp_dt - datetime.utcnow()
            days_left = "Expired" if diff.total_seconds() <= 0 else f"{max(0, diff.days)} days"
        except Exception:
            days_left = "Unknown"

    conferences = conference_engine.list_conferences(
        owner_email=user.get("client_email", ""),
        is_admin=False,
        owner_license_key=key
    )

    return {
        "license_key": key,
        "client_name": account.get("client_name", ""),
        "client_email": account.get("client_email", ""),
        "tier": account.get("tier", "trial"),
        "status": account.get("status", "active"),
        "days_left": days_left,
        "expires_at": expires_at,
        "daily_limit": account.get("daily_limit", 1000),
        "used_today": account.get("used_today", 0),
        "scistudio_access": bool(account.get("scistudio_access", True)),
        "conferences": conferences,
    }



@app.get("/api/config")
async def get_app_config(request: Request):
    _require_authenticated_user(request)
    data_dir = get_data_dir()
    return {"data_dir": str(data_dir)}


@app.post("/api/config/data-dir")
async def update_data_dir(request: Request):
    _require_authenticated_user(request)
    body = await request.json()
    new_dir = body.get("data_dir", "").strip()
    if not new_dir:
        raise HTTPException(status_code=400, detail="Data directory cannot be empty.")
    saved = set_data_dir(new_dir)
    return {"status": "ok", "data_dir": str(saved)}


@app.get("/api/stats")
async def get_stats(request: Request):
    user = _require_authenticated_user(request)
    curr_key = user.get("license_key") or ""
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
async def list_datasets(request: Request):
    _require_authenticated_user(request)
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
async def get_leads(request: Request, file: Optional[str] = Query(None), page: int = Query(1, ge=1), page_size: int = Query(50, ge=10, le=100)):
    _require_authenticated_user(request)
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
async def export_leads(request: Request, file: Optional[str] = Query(None)):
    _require_authenticated_user(request)
    data_dir = get_data_dir()
    if not file:
        raise HTTPException(status_code=400, detail="Missing file parameter")
    target = (data_dir / file).resolve()
    if not target.exists() or not target.is_relative_to(data_dir):
        raise HTTPException(status_code=404, detail="Dataset not found")
    return FileResponse(target, filename=target.name, media_type="text/csv")


@app.post("/api/open-folder")
async def open_data_folder(request: Request):
    _require_authenticated_user(request)
    data_dir = get_data_dir()
    try:
        import subprocess
        subprocess.Popen(["explorer.exe", str(data_dir)])
        return {"status": "success", "path": str(data_dir)}
    except Exception as e:
        return {"status": "error", "error": str(e)}


@app.post("/api/leads/merge-deduplicate")
async def merge_and_deduplicate_endpoint(request: Request):
    _require_authenticated_user(request)
    data_dir = get_data_dir()
    target_files = []
    for p in data_dir.rglob("*.csv"):
        if "_needto_extract" in p.name:
            continue
        if any(token in p.name.lower() for token in ["found", "verified", "nih", "master", "send_ready"]):
            target_files.append(p)

    from collector_store import merge_files
    try:
        result = merge_files(data_dir / "central_master_leads.csv", target_files)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return {"status": "success", "files_scanned": len(target_files),
            "output_file": "central_master_leads.csv", **result}


@app.post("/api/leads/clear-all")
async def clear_all_leads(request: Request):
    """Wipes old generated CSV lead files and resets central master to give a fresh, clean slate."""
    _require_authenticated_user(request)
    if process_state["status"] == "running":
        raise HTTPException(status_code=409, detail="Stop collection before clearing datasets.")
    data_dir = get_data_dir()
    from collector_store import clear_archive
    for folder in (data_dir, BASE_DIR / "data"):
        if (folder / "central_master_leads.sqlite3").exists():
            clear_archive(folder / "central_master_leads.csv")
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
    user = _require_authenticated_user(request)
    if process_state["status"] == "running":
        raise HTTPException(status_code=400, detail="A task is already actively running.")

    # Enforce License Validation & Remote Kill-Switch
    curr_key = user.get("license_key") or ""
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

    elif action in ("unified", "openalex_unified", "auto") :
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
        script_name = "collect_all.py" if action == "auto" else "03_unified_lead_pipeline.py"
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
async def stop_pipeline(request: Request):
    _require_authenticated_user(request)
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
async def get_pipeline_status(request: Request):
    _require_authenticated_user(request)
    return {
        "status": process_state["status"],
        "stage": process_state["current_stage"],
        "script": process_state["script_name"],
        "recent_logs": process_state["lines"][-80:],
    }


@app.get("/api/pipeline/stream")
async def stream_logs(request: Request):
    _require_authenticated_user(request)
    async def event_generator():
        for entry in process_state["lines"][-30:]:
            yield f"data: {json.dumps(entry)}\n\n"
        last_keepalive = time.monotonic()
        while True:
            if await request.is_disconnected():
                break
            try:
                entry = await asyncio.wait_for(log_queue.get(), timeout=5.0)
                last_keepalive = time.monotonic()
                yield f"data: {json.dumps(entry)}\n\n"
            except (asyncio.TimeoutError, TimeoutError):
                now = time.monotonic()
                if now - last_keepalive >= 25.0:
                    last_keepalive = now
                    # Use an SSE comment for keepalive so browsers do not emit data events when idle
                    yield ": keepalive\n\n"
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



# -----------------------------------------------------------------------------
# SciStudio Website Builder Module Endpoints (/api/builder)
# -----------------------------------------------------------------------------
from builder_manager import builder_engine
from conference_manager import conference_engine

def _require_scistudio_access(user: dict):
    """Enforces that the user account has SciStudio website builder access enabled."""
    if user.get("is_admin"):
        return
    if user.get("is_member"):
        raise HTTPException(
            status_code=403,
            detail="Subaccounts are restricted from conference and website operations until assignments are configured."
        )
    if not user.get("scistudio_access", True):
        raise HTTPException(
            status_code=403,
            detail="SciStudio access is disabled for your account. Please contact an administrator to request access."
        )

def _require_owned_conference(conference_id: str, user: dict) -> dict:
    if not re.fullmatch(r"conf_[a-f0-9]{8}", conference_id):
        raise HTTPException(status_code=404, detail="Conference not found.")
    conf = conference_engine.get_conference(conference_id)
    if not conf:
        raise HTTPException(status_code=404, detail="Conference not found.")
    if user.get("is_admin"):
        return conf
    if user.get("is_member"):
        raise HTTPException(
            status_code=403,
            detail="Subaccounts are restricted from conference and website operations until assignments are configured."
        )
    user_email = (user.get("client_email") or "").strip().lower()
    owner_email = (conf.get("owner_email") or "").strip().lower()
    user_key = (user.get("license_key") or "").strip().upper()
    owner_key = (conf.get("owner_license_key") or "").strip().upper()

    if (user_email and owner_email == user_email) or (user_key and owner_key == user_key):
        return conf

    raise HTTPException(status_code=404, detail="Conference not found.")

def _require_owned_site(site_id: str, user: dict) -> dict:
    if not re.fullmatch(r"site_[a-f0-9]{8}", site_id):
        raise HTTPException(status_code=404, detail="Website not found.")
    site = builder_engine.get_site(site_id)
    if not site:
        raise HTTPException(status_code=404, detail="Website not found.")
    if user.get("is_admin"):
        return site
    if user.get("is_member"):
        raise HTTPException(
            status_code=403,
            detail="Subaccounts are restricted from conference and website operations until assignments are configured."
        )
    owner = (site or {}).get("user_email", "").strip().lower()
    email = user.get("client_email", "").strip().lower()
    if email and owner == email:
        return site
    conf_id = site.get("conference_id")
    if conf_id:
        try:
            _require_owned_conference(conf_id, user)
            return site
        except HTTPException:
            pass
    raise HTTPException(status_code=404, detail="Website not found.")


@app.get("/api/builder/templates")
async def builder_list_templates():
    return {"templates": builder_engine.list_templates()}


@app.get("/api/builder/templates/{template_id}")
async def builder_template_document(template_id: str):
    from builder_manager import build_template_components
    templates = builder_engine.list_templates()
    template = next((item for item in templates if item["id"] == template_id), None)
    if not template and template_id != "blank":
        raise HTTPException(status_code=404, detail="Template not found")
    name = template["name"] if template else "Your conference"
    components, theme = build_template_components(template_id, name)
    if template_id == "blank":
        components = []
    return {"site_id": "", "name": name, "theme_config": theme, "schema_json": components}


@app.get("/api/builder/conferences")
async def builder_list_conferences(request: Request):
    user = _require_authenticated_user(request)
    _require_scistudio_access(user)
    conferences = conference_engine.list_conferences(
        owner_email=user.get("client_email", ""),
        is_admin=bool(user.get("is_admin")),
        owner_license_key=user.get("license_key", "")
    )
    return {"conferences": conferences}


@app.post("/api/builder/conferences")
async def builder_create_conference(request: Request):
    user = _require_authenticated_user(request)
    _require_scistudio_access(user)
    body = await request.json()
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Conference name is required.")
    description = (body.get("description") or "").strip()
    conf = conference_engine.create_conference(
        name=name,
        owner_email=user.get("client_email", ""),
        owner_license_key=user.get("license_key", ""),
        description=description
    )
    return {"status": "ok", "conference": conf}


@app.get("/api/builder/conferences/{conference_id}")
async def builder_get_conference(conference_id: str, request: Request):
    user = _require_authenticated_user(request)
    _require_scistudio_access(user)
    conf = _require_owned_conference(conference_id, user)
    return {"conference": conf}


@app.put("/api/builder/conferences/{conference_id}")
async def builder_update_conference(conference_id: str, request: Request):
    user = _require_authenticated_user(request)
    _require_scistudio_access(user)
    _require_owned_conference(conference_id, user)
    body = await request.json()
    ok, msg, conf = conference_engine.update_conference(conference_id, body)
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    return {"status": "ok", "conference": conf, "message": msg}


@app.delete("/api/builder/conferences/{conference_id}")
async def builder_delete_conference(conference_id: str, request: Request):
    user = _require_authenticated_user(request)
    _require_scistudio_access(user)
    _require_owned_conference(conference_id, user)
    email = user.get("client_email", "")
    sites = builder_engine.list_sites("admin" if user.get("is_admin") else email, conference_id=conference_id)
    for s in sites:
        builder_engine.update_site(s["site_id"], {"conference_id": None})
    ok, msg = conference_engine.delete_conference(conference_id)
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    return {"status": "ok", "message": msg}


@app.get("/api/builder/sites")
async def builder_list_sites(request: Request, conference_id: Optional[str] = None):
    user = _require_authenticated_user(request)
    _require_scistudio_access(user)
    if conference_id and conference_id != "all":
        _require_owned_conference(conference_id, user)
    email = user.get("client_email", "")
    sites = builder_engine.list_sites("admin" if user.get("is_admin") else email, conference_id=conference_id)
    return {"sites": sites}


@app.post("/api/builder/sites")
async def builder_create_site(request: Request):
    user = _require_authenticated_user(request)
    _require_scistudio_access(user)
    body = await request.json()
    name = (body.get("name") or "New Website").strip()
    slug = (body.get("slug") or "").strip() or None
    template_id = body.get("template_id") or "genomics"
    theme_config = body.get("theme_config") or {}
    custom_options = body.get("custom_options") or {}
    client_brief = body.get("client_brief") or custom_options.get("client_brief") or {}
    if client_brief:
        custom_options["client_brief"] = client_brief
    conf_id = (body.get("conference_id") or "").strip() or None
    if conf_id:
        _require_owned_conference(conf_id, user)
    initial_components = body.get('initial_components')
    if initial_components is not None:
        allowed = {'navbar','hero','about','features','speakers','gallery','pricing','faq','contact','footer','image','custom','content'}
        if not isinstance(initial_components, list) or len(initial_components) > 100:
            raise HTTPException(status_code=400, detail='Choose up to 100 components.')
        ids = set()
        for component in initial_components:
            if not isinstance(component, dict) or component.get('type') not in allowed or not isinstance(component.get('data'), dict):
                raise HTTPException(status_code=400, detail='Invalid component.')
            identifier = component.get('id')
            if not isinstance(identifier, str) or not re.fullmatch(r'[a-zA-Z0-9_-]{1,100}', identifier) or identifier in ids:
                raise HTTPException(status_code=400, detail='Invalid component identifier.')
            ids.add(identifier)
    site = builder_engine.create_site(
        user_email=user.get("client_email", ""),
        name=name,
        slug=slug,
        template_id=template_id,
        theme_config=theme_config,
        custom_options=custom_options,
        conference_id=conf_id,
        initial_components=initial_components
    )
    return {"status": "ok", "site": site}


@app.get("/api/builder/sites/{site_id}")
async def builder_get_site(site_id: str, request: Request):
    user = _require_authenticated_user(request)
    _require_scistudio_access(user)
    _require_owned_site(site_id, user)
    site = builder_engine.get_site(site_id)
    if not site:
        raise HTTPException(status_code=404, detail="Website not found.")
    return site


@app.put("/api/builder/sites/{site_id}")
async def builder_update_site(site_id: str, request: Request):
    user = _require_authenticated_user(request)
    _require_scistudio_access(user)
    _require_owned_site(site_id, user)
    body = await request.json()
    if "conference_id" in body and body["conference_id"]:
        _require_owned_conference(body["conference_id"], user)
    ok, msg, site = builder_engine.update_site(site_id, body)
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    return {"status": "ok", "message": msg, "site": site}


@app.patch("/api/builder/sites/{site_id}/conference")
async def builder_assign_site_conference(site_id: str, request: Request):
    user = _require_authenticated_user(request)
    _require_scistudio_access(user)
    _require_owned_site(site_id, user)
    body = await request.json()
    new_conf_id = (body.get("conference_id") or "").strip() or None
    if new_conf_id:
        _require_owned_conference(new_conf_id, user)
    ok, msg, site = builder_engine.update_site(site_id, {"conference_id": new_conf_id})
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    return {"status": "ok", "site": site, "message": "Website conference updated."}


@app.delete("/api/builder/sites/{site_id}")
async def builder_delete_site(site_id: str, request: Request):
    user = _require_authenticated_user(request)
    _require_scistudio_access(user)
    _require_owned_site(site_id, user)
    ok, msg = builder_engine.delete_site(site_id)
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    return {"status": "ok", "message": msg}


@app.post("/api/builder/sites/{site_id}/publish")
async def builder_publish_site(site_id: str, request: Request):
    user = _require_authenticated_user(request)
    _require_scistudio_access(user)
    _require_owned_site(site_id, user)
    ok, msg, site = builder_engine.update_site(site_id, {"status": "published"})
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    return {"status": "ok", "message": "Website successfully published!", "url": site.get("url")}


@app.get("/api/builder/sites/{site_id}/export")
def builder_export_site(site_id: str, request: Request):
    user = _require_authenticated_user(request)
    _require_scistudio_access(user)
    site = _require_owned_site(site_id, user)
    from react_export import export_zip
    zip_bytes, filename = export_zip(site, _media_dir(site_id))
    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


# -----------------------------------------------------------------------------
# SciStudio media: images uploaded from the editor
# -----------------------------------------------------------------------------
MEDIA_MAX_BYTES = 5 * 1024 * 1024
MEDIA_TYPES = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif"}
MEDIA_EXT_TYPES = {ext: mime for mime, ext in MEDIA_TYPES.items()}


def _media_dir(site_id: str) -> Path:
    from builder_manager import get_websites_dir
    return get_websites_dir() / "media" / site_id


def _sniff_image(data: bytes) -> Optional[str]:
    """Identify the image type from its content; the client's Content-Type is not trusted.
    SVG is deliberately not accepted because it can carry scripts."""
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


@app.post("/api/builder/sites/{site_id}/media")
async def builder_upload_media(site_id: str, request: Request):
    user = _require_authenticated_user(request)
    _require_scistudio_access(user)
    _require_owned_site(site_id, user)
    try:
        declared = int(request.headers.get("content-length") or 0)
    except ValueError:
        declared = 0
    if declared > MEDIA_MAX_BYTES:
        raise HTTPException(status_code=413, detail="This image is larger than 5 MB. Choose a smaller image.")
    data = bytearray()
    async for chunk in request.stream():
        data.extend(chunk)
        if len(data) > MEDIA_MAX_BYTES:
            raise HTTPException(status_code=413, detail="This image is larger than 5 MB. Choose a smaller image.")
    if not data:
        raise HTTPException(status_code=400, detail="This file is empty.")
    mime = _sniff_image(bytes(data[:16]))
    if not mime:
        raise HTTPException(status_code=415, detail="Choose a PNG, JPG, WebP or GIF image.")
    import uuid
    name = f"{uuid.uuid4().hex}.{MEDIA_TYPES[mime]}"
    folder = _media_dir(site_id)
    folder.mkdir(parents=True, exist_ok=True)
    (folder / name).write_bytes(bytes(data))
    builder_engine.record_media(site_id, name, mime, len(data))
    return {"status": "ok", "url": f"/api/builder/media/{site_id}/{name}"}


_form_rate_limit = FormRateLimit()


def _limit_form_requests(request):
    peer = request.client.host if request.client else "unknown"
    if not _form_rate_limit.allow(peer):
        raise HTTPException(status_code=429, detail="Please wait a minute and try again.", headers={"Retry-After": "60"})


@app.post("/api/public/forms/{site_id}/{form_id}")
async def submit_website_form(site_id: str, form_id: str, request: Request):
    """Public: a visitor submits a form on a website. Values are checked against the form's own fields."""
    _limit_form_requests(request)
    import forms
    if not re.fullmatch(r"site_[a-f0-9]{8}", site_id) or not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", form_id):
        raise HTTPException(status_code=404, detail="Form not found.")
    if int(request.headers.get("content-length") or 0) > 64_000:
        raise HTTPException(status_code=413, detail="This message is too long.")
    site = builder_engine.get_site(site_id)
    section, page_id = forms.find_form(site or {}, form_id)
    if not section:
        raise HTTPException(status_code=404, detail="Form not found.")
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid form data.")
    values, problem = forms.clean_submission(section, payload)
    if problem:
        raise HTTPException(status_code=400, detail=problem)
    message = (section.get("data") or {}).get("success_message") or "Thank you! Your message has been sent."
    if section["type"] == "registration":
        order, problem = forms.quote(section, payload)
        if problem:
            raise HTTPException(status_code=400, detail=problem)
        submission_id, token = forms.save_registration(site_id, form_id, page_id, values, order)
        return {"status": "ok", "message": message, "submission_id": submission_id, "payment_token": token, "order": order}
    forms.save_submission(site_id, form_id, section["type"], page_id, values)
    return {"status": "ok", "message": message}


async def _public_form(site_id: str, form_id: str):
    import forms
    if not re.fullmatch(r"site_[a-f0-9]{8}", site_id) or not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", form_id):
        raise HTTPException(status_code=404, detail="Form not found.")
    section, _ = forms.find_form(builder_engine.get_site(site_id) or {}, form_id)
    if not section or section.get("type") != "registration":
        raise HTTPException(status_code=404, detail="Form not found.")
    return section


@app.post("/api/public/forms/{site_id}/{form_id}/quote")
async def quote_registration(site_id: str, form_id: str, request: Request):
    """Public: live price for a registration (category, add-ons, discount code). Computed on the server."""
    _limit_form_requests(request)
    import forms
    section = await _public_form(site_id, form_id)
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid form data.")
    order, problem = forms.quote(section, payload if isinstance(payload, dict) else {})
    if problem:
        raise HTTPException(status_code=400, detail=problem)
    return {"status": "ok", "order": order}


@app.post("/api/public/forms/{site_id}/{form_id}/pay-test/{submission_id}")
async def pay_registration_test(site_id: str, form_id: str, submission_id: int, request: Request):
    """Public: test-mode payment for a registration (stand-in until Stripe is connected)."""
    _limit_form_requests(request)
    import forms
    section = await _public_form(site_id, form_id)
    try:
        token = str((await request.json()).get("payment_token", ""))
    except Exception:
        token = ""
    if not forms.mark_test_payment(site_id, submission_id, token):
        raise HTTPException(status_code=400, detail="This payment could not be completed.")
    message = (section.get("data") or {}).get("success_message") or "Payment received (test mode). Your registration is confirmed."
    return {"status": "ok", "message": message}


@app.get("/api/builder/sites/{site_id}/submissions")
async def builder_list_submissions(site_id: str, request: Request):
    """Owner only: all form submissions for one website, newest first."""
    import forms
    user = _require_authenticated_user(request)
    _require_scistudio_access(user)
    _require_owned_site(site_id, user)
    return {"submissions": forms.list_submissions(site_id)}


@app.get("/api/builder/media/{site_id}/{name}")
async def builder_serve_media(site_id: str, name: str):
    """Public: published pages embed these images. Names are random and unguessable."""
    match = re.fullmatch(r"([a-f0-9]{32})\.(png|jpg|webp|gif)", name)
    if not re.fullmatch(r"site_[a-f0-9]{8}", site_id) or not match:
        raise HTTPException(status_code=404, detail="Image not found.")
    path = _media_dir(site_id) / name
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Image not found.")
    return FileResponse(path, media_type=MEDIA_EXT_TYPES[match.group(2)], headers={
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
    })


@app.get("/api/public/sites/{slug}")
@app.get("/api/public/sites/{slug}/{page_slug}")
async def get_published_page(slug: str, page_slug: Optional[str] = None):
    page = published_page(builder_engine.get_site_by_slug(slug), page_slug)
    if page is None:
        raise HTTPException(status_code=404, detail="This website or page is unavailable.")
    return JSONResponse(page, headers={"Cache-Control": "no-store"})


@app.get("/sites/{slug}")
@app.get("/sites/{slug}/{page_slug}")
async def serve_public_website(slug: str, page_slug: Optional[str] = None):
    from urllib.parse import quote
    path = "/sites/" + quote(slug, safe="")
    return _to_react(path + ("/" + quote(page_slug, safe="") if page_slug else ""))


# -----------------------------------------------------------------------------
# Clean SPA Client Routes (/dashboard, /scistudio, /nih, /explorer, etc.)
# -----------------------------------------------------------------------------
@app.get("/dashboard")
@app.get("/scistudio")
@app.get("/nih")
@app.get("/explorer")
@app.get("/datasets")
async def serve_spa_page(request: Request):
    if request.url.path == "/scistudio":
        user, redirect_resp = _require_page_user(request)
        if redirect_resp:
            return redirect_resp
        _require_scistudio_access(user)
        return _to_react(f"/{_page_namespace(user)}/scistudio")
    index_path = STATIC_DIR / "index.html"
    if index_path.exists():
        return FileResponse(index_path)
    raise HTTPException(status_code=404, detail="Page not found.")


@app.get("/websitebuilder")
@app.get("/builder")
async def redirect_legacy_builder_routes():
    """Redirect legacy website builder URLs to primary /scistudio route."""
    return RedirectResponse(url="/scistudio", status_code=307)


# Pages that exist in the new React app are sent there, so the old UI never shows them.
FRONTEND_ORIGIN = os.environ.get("SCIPROSPECT_FRONTEND_ORIGIN", "http://127.0.0.1:3000").rstrip("/")
REACT_PAGES = {
    "root": {"dashboard", "accounts", "add-account", "scistudio"},
    "organization": {"dashboard", "scistudio"},
    "client": {"dashboard", "scistudio"},
}


def _to_react(path: str) -> RedirectResponse:
    return RedirectResponse(FRONTEND_ORIGIN + path, status_code=307)


@app.get("/scistudio/{site_id}/edit")
@app.get("/{namespace}/scistudio/{site_id}/edit")
async def scistudio_site_edit_page(site_id: str, request: Request, namespace: Optional[str] = None):
    """Direct URL navigation/bookmark into SciStudio editor canvas for a specific website."""
    if namespace and namespace not in ("root", "organization", "client", "conference"):
        raise HTTPException(status_code=404, detail="Page not found")
    user, redirect_resp = _require_page_user(request)
    if redirect_resp:
        return redirect_resp
    if namespace and _page_namespace(user) != namespace:
        raise HTTPException(status_code=403, detail="This workspace belongs to a different account role")
    _require_scistudio_access(user)
    if not re.fullmatch(r"site_[a-f0-9]{8}", site_id):
        raise HTTPException(status_code=404, detail="Website not found.")
    return _to_react(f"/{namespace or _page_namespace(user)}/scistudio/{site_id}/react-edit")


@app.get("/scistudio/{site_id}/preview")
@app.get("/{namespace}/scistudio/{site_id}/preview")
async def scistudio_site_preview_page(site_id: str, request: Request, namespace: Optional[str] = None):
    """Clean user-facing preview route for drafted or published websites."""
    if namespace and namespace not in ("root", "organization", "client", "conference"):
        raise HTTPException(status_code=404, detail="Page not found")
    user, redirect_resp = _require_page_user(request)
    if redirect_resp:
        return redirect_resp
    if namespace and _page_namespace(user) != namespace:
        raise HTTPException(status_code=403, detail="This workspace belongs to a different account role")
    _require_scistudio_access(user)
    _require_owned_site(site_id, user)
    query = f"?{request.url.query}" if request.url.query else ""
    return _to_react(f"/{_page_namespace(user)}/scistudio/{site_id}/preview{query}")


# Role-owned page namespaces. Data APIs continue to enforce resource ownership.
def _page_namespace(user):
    if user.get("is_admin"):
        return "root"
    if user.get("is_member"):
        return "conference"
    account = license_engine.get_account(user.get("license_key", "")) or {}
    return "organization" if account.get("account_type") == "org" else "client"


@app.get("/workspace")
async def workspace_home(request: Request):
    user, redirect_resp = _require_page_user(request)
    if redirect_resp:
        return redirect_resp
    return RedirectResponse("/" + _page_namespace(user) + "/dashboard", status_code=307)


@app.get("/{namespace}/{page}")
async def role_workspace_page(namespace: str, page: str, request: Request):
    if namespace not in ("root", "organization", "client", "conference"):
        raise HTTPException(status_code=404, detail="Page not found")
    user, redirect_resp = _require_page_user(request)
    if redirect_resp:
        return redirect_resp
    if _page_namespace(user) != namespace:
        raise HTTPException(status_code=403, detail="This workspace belongs to a different account role")
    if namespace == "root" and page == "licenses":
        return RedirectResponse("/root/accounts", status_code=307)
    if page in REACT_PAGES.get(namespace, set()):
        if page == "scistudio":
            _require_scistudio_access(user)
        return _to_react(f"/{namespace}/{page}")
    if namespace == "root" and page in ("dashboard", "accounts", "add-account"):
        return FileResponse(STATIC_DIR / "root-dashboard.html")
    if namespace == "conference":
        raise HTTPException(status_code=403, detail="Conference assignments must be configured before this workspace is available")
    if page not in ("dashboard", "collector", "scistudio", "nih", "explorer", "datasets"):
        raise HTTPException(status_code=404, detail="Page not found")
    if page == "scistudio":
        _require_scistudio_access(user)
    return FileResponse(
        STATIC_DIR / "index.html",
        headers={"Cache-Control": "no-cache, no-store, must-revalidate", "Pragma": "no-cache"}
    )


# Mount static assets
if STATIC_DIR.exists():
    app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=False)
