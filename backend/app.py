"""
app.py
======
FastAPI backend for SciProspect Scientific Lead Prospecting & Outreach Suite.
Supports both Unrestricted Full Production Mode and Evaluation Trial Mode.
"""

import os
import re
import sys
import threading
from urllib.parse import quote, unquote
from html import escape as html_escape
import secrets
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response


sys.path.insert(0, str(Path(__file__).resolve().parent))
from app_config import get_data_dir
from public_site import FormRateLimit, published_page
sys.path.append(str(Path(__file__).resolve().parent / "collector_sources"))  # web collector scripts
from license_manager import license_engine, sanitize_member

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

DATA_DIR.mkdir(parents=True, exist_ok=True)


app = FastAPI(title="SciProspect - Scientific Lead Prospecting & Data Suite")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# -----------------------------------------------------------------------------
# Root Admin Console & Client License Endpoints
# -----------------------------------------------------------------------------


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

# Two-step sign-in is required for every account. Until it is set up, a session can only reach these.
MFA_SETUP_PATHS = {"/api/auth/me", "/api/auth/logout", "/api/auth/mfa", "/api/auth/mfa/setup", "/api/auth/mfa/enable"}


def _mfa_blocked(user: Optional[dict], request: Request) -> bool:
    url = getattr(request, "url", None)
    return bool(user and user.get("mfa_setup_required") and getattr(url, "path", "") not in MFA_SETUP_PATHS)


def _get_current_user_from_request(request: Request) -> Optional[dict]:
    """Extracts and validates the current user from session cookie or headers."""
    token = _extract_token_from_request(request)
    if token:
        user = license_engine.get_session(token)
        if user and not _mfa_blocked(user, request):
            return user
    return None


def _require_authenticated_user(request: Request, allow_expired: bool = False) -> dict:
    """
    Enforces that the request has an active, valid session.
    If not authenticated, raises HTTP 401.
    If authenticated but account is suspended/stopped, raises HTTP 403.
    If the trial or plan has ended, raises HTTP 403 too, except where allow_expired is set (Billing: the owner must be able to pay).
    """
    token = _extract_token_from_request(request)
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required. Please sign in.")
    
    user, err = license_engine.get_session_info(token)
    if not user:
        if err and "SUSPENDED" in err:
            raise HTTPException(status_code=403, detail="🚨 ACCESS SUSPENDED: Your account is Temporarily stopped. Contact Admin.")
        raise HTTPException(status_code=401, detail="Session expired or invalid. Please sign in.")
    
    if _mfa_blocked(user, request):
        raise HTTPException(status_code=403, detail="Set up two-step sign-in to continue.")

    # Real-time kill switch verification for non-admin accounts
    if not user.get("is_admin"):
        key = user.get("license_key")
        if key:
            val = license_engine.validate_license(key)
            if val.get("status") == "expired" and not user.get("is_member"):
                if allow_expired:
                    return user
                raise HTTPException(status_code=403, detail="Your free trial or plan has ended. Choose a plan in Billing to continue.")
            if not val.get("valid") or val.get("status") == "stopped":
                raise HTTPException(status_code=403, detail="🚨 ACCESS SUSPENDED: Your account is Temporarily stopped. Contact Admin.")
    return user


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

    import mfa
    if mfa.is_enabled(_mfa_key(user)):
        challenge = secrets.token_urlsafe(32)
        _drop_old_challenges()
        _mfa_challenges[challenge] = {"user": user, "msg": msg, "expires": time.time() + MFA_CHALLENGE_SECONDS, "tries": 0}
        return {"status": "mfa_required", "mfa_token": challenge}
    return _signed_in(request, {**user, "mfa_setup_required": True}, msg)


# shortcut: password-checked sign-ins waiting for their app code live in this worker's memory; move to the DB if running several workers.
_mfa_challenges: dict = {}
MFA_CHALLENGE_SECONDS = 300


def _drop_old_challenges():
    now = time.time()
    for key in [k for k, c in _mfa_challenges.items() if c["expires"] < now]:
        _mfa_challenges.pop(key, None)


def _mfa_key(user: dict) -> str:
    return "__root__" if user.get("is_admin") else f"{user.get('license_key', '')}:{user.get('member_id', '')}"


@app.post("/api/auth/login/mfa")
async def api_auth_login_mfa(request: Request):
    """Second sign-in step: the 6-digit code from the authenticator app, or a backup code."""
    import mfa
    body = await request.json()
    _drop_old_challenges()
    challenge = _mfa_challenges.get(str(body.get("mfa_token") or ""))
    if not challenge:
        raise HTTPException(status_code=401, detail="This sign-in has expired. Please enter your email and password again.")
    if not mfa.verify(_mfa_key(challenge["user"]), str(body.get("code") or "")):
        challenge["tries"] += 1
        if challenge["tries"] >= 5:
            _mfa_challenges.pop(str(body.get("mfa_token")), None)
            raise HTTPException(status_code=401, detail="Too many wrong codes. Please sign in again.")
        raise HTTPException(status_code=400, detail="That code is not right. Check your authenticator app and try again.")
    _mfa_challenges.pop(str(body.get("mfa_token")), None)
    return _signed_in(request, challenge["user"], challenge["msg"])


_signup_limit = FormRateLimit(limit=5, seconds=900)


@app.post("/api/auth/signup/start")
async def api_signup_start(request: Request):
    """Self sign-up, step 1: check the details and email a 6-digit code. Nothing is created yet."""
    import signup
    client = getattr(request, "client", None)
    if not _signup_limit.allow(client.host if client else "unknown"):
        raise HTTPException(status_code=429, detail="Too many sign-ups from here. Please try again in a few minutes.")
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid request.")
    details, problem = signup.clean(body)
    if problem:
        raise HTTPException(status_code=400, detail=problem)
    if license_engine.account_for_email(details["email"]) or details["email"] == license_engine.root_email():
        raise HTTPException(status_code=409, detail="An account with this email already exists. Log in, or use “Forgot password”.")
    try:
        signup.start(details)
    except Exception as exc:
        print(f"[SIGNUP] Email not sent: {type(exc).__name__}")
        raise HTTPException(status_code=503, detail="We couldn't send the email right now. Please try again in a minute.")
    return {"status": "ok", "message": f"We've sent a 6-digit code to {details['email']}. It can take a minute; check your spam folder too."}


@app.post("/api/auth/signup/verify")
async def api_signup_verify(request: Request):
    """Self sign-up, step 2: the emailed code creates the account (7-day free trial) and signs the person in."""
    import signup
    client = getattr(request, "client", None)
    if not _reset_confirm_limit.allow(client.host if client else "unknown"):
        raise HTTPException(status_code=429, detail="Too many tries. Please wait a few minutes.")
    body = await request.json()
    details, problem = signup.verify(str(body.get("email") or ""), str(body.get("code") or ""))
    if problem:
        raise HTTPException(status_code=400, detail=problem)
    try:
        # Self sign-ups start the 7-day free trial (no permanent free plan); paying for a plan upgrades the license.
        import plans
        trial = _plan_by_id("trial")
        created = license_engine.create_account(name=details["name"], email=details["email"], tier="trial", duration_days=TRIAL_DAYS,
                                      daily_limit=plans.daily_contacts(trial) if trial else 1000,
                                      account_type=details["account_type"], org_name=details["org_name"],
                                      password_hash=details["password_hash"], plan_id="trial", scistudio_access=True, notes="Self sign-up")
        if trial:  # the trial's team size (none) becomes the seat limit
            license_engine.set_plan(created["license_key"], "trial", int(trial["limits"].get("members", 0)))
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    ok, user, msg = license_engine.authenticate(details["email"], str(body.get("password") or ""))
    if not ok:  # e.g. the page was reloaded and the password is gone: the account exists, they just sign in
        return {"status": "ok", "signed_in": False, "message": "Your account is ready. Please sign in."}
    return _signed_in(request, {**user, "mfa_setup_required": True}, "Welcome to SciProspect!")


@app.post("/api/auth/change-password")
async def api_auth_change_password(request: Request):
    """Signed-in users change their own password after confirming the current one. Other sessions are signed out."""
    user = _require_authenticated_user(request)
    client = getattr(request, "client", None)
    if not _reset_confirm_limit.allow(client.host if client else "unknown"):
        raise HTTPException(status_code=429, detail="Too many tries. Please wait a few minutes.")
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid request.")
    current, new = str(body.get("current_password") or ""), str(body.get("new_password") or "").strip()
    if len(new) < 8:
        raise HTTPException(status_code=400, detail="Use at least 8 characters for your new password.")
    if new == current:
        raise HTTPException(status_code=400, detail="Choose a password that is different from your current one.")
    email = str(user.get("client_email") or "")
    ok, _info, _msg = license_engine.authenticate("admin" if user.get("is_admin") else email, current)
    if not ok:
        raise HTTPException(status_code=400, detail="Your current password is not right.")
    if user.get("is_admin"):
        ok, msg = license_engine.update_root_password(current, new)
        if not ok:
            raise HTTPException(status_code=400, detail=msg)
        return {"status": "ok", "message": "Your password has been changed.", "signed_out": False}
    ok, msg, code = license_engine.reset_password_by_email(email, new)
    if not ok:
        raise HTTPException(status_code=code, detail=msg)
    return {"status": "ok", "message": "Your password has been changed. Please sign in again with the new password.", "signed_out": True}


@app.get("/api/auth/mfa")
async def api_auth_mfa_status(request: Request):
    import mfa
    return {"enabled": mfa.is_enabled(_mfa_key(_require_authenticated_user(request)))}


@app.post("/api/auth/mfa/setup")
async def api_auth_mfa_setup(request: Request):
    """Starts setup: a new secret shown as a QR code. Nothing changes until it is confirmed with a code."""
    import mfa
    user = _require_authenticated_user(request)
    setup = mfa.start_setup(_mfa_key(user), user.get("client_email") or "account")
    if not setup:
        raise HTTPException(status_code=409, detail="Two-step sign-in is already on.")
    return setup


@app.post("/api/auth/mfa/enable")
async def api_auth_mfa_enable(request: Request):
    import mfa
    user = _require_authenticated_user(request)
    codes = mfa.enable(_mfa_key(user), str((await request.json()).get("code") or ""))
    if not codes:
        raise HTTPException(status_code=400, detail="That code is not right. Enter the current 6-digit code from the app.")
    if user.get("mfa_setup_required"):
        license_engine.revoke_session(_extract_token_from_request(request))
        clean = {k: v for k, v in user.items() if k != "mfa_setup_required"}
        return _signed_in(request, clean, "Two-step sign-in is on.", {"backup_codes": codes})
    return {"status": "ok", "backup_codes": codes}


@app.post("/api/auth/mfa/disable")
async def api_auth_mfa_disable(request: Request):
    import mfa
    user = _require_authenticated_user(request)
    if not mfa.disable(_mfa_key(user), str((await request.json()).get("code") or "")):
        raise HTTPException(status_code=400, detail="That code is not right. Enter a code from the app or a backup code.")
    return {"status": "ok"}


def _signed_in(request: Request, user: dict, msg: str, extra: Optional[dict] = None) -> JSONResponse:
    token = license_engine.issue_session(user)
    if user.get("license_key"):
        set_current_license_key(user["license_key"])

    res = JSONResponse(content={
        "status": "ok",
        "authenticated": True,
        "token": token,
        "user": user,
        "message": msg,
        **(extra or {}),
    })
    # Nginx sets https; Next.js appends its own hop ("https,http"), so the first value is the visitor's.
    secure_cookie = request.url.scheme == "https" or request.headers.get("x-forwarded-proto", "").split(",")[0].strip() == "https"
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
_reset_confirm_limit = FormRateLimit(limit=10, seconds=900)
# Same wording for every email, so nobody can find out which emails have accounts.
RESET_SENT = ("Check your inbox. We've sent a 6-digit code to {email} if it belongs to a SciProspect account. "
              "It can take a minute; please also check your spam folder.")


@app.post("/api/auth/forgot-password/request")
async def api_auth_forgot_request(request: Request):
    """Emails a one-time reset code. Same answer whether or not the email exists, so accounts can't be discovered."""
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
            password_reset.send_code(email)
        except Exception as exc:  # never reveal delivery problems for a specific address
            print(f"[RESET] Email delivery failed: {type(exc).__name__}")
    return {"status": "ok", "message": RESET_SENT.format(email=email)}


@app.post("/api/auth/forgot-password/confirm")
async def api_auth_forgot_confirm(request: Request):
    """Sets a new password with a valid one-time code; signs the account out everywhere."""
    import password_reset
    client = getattr(request, "client", None)
    if not _reset_confirm_limit.allow(client.host if client else "unknown"):
        raise HTTPException(status_code=429, detail="Too many tries. Please wait a few minutes and request a new code.")
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid request.")
    new_password = str(body.get("new_password") or "").strip()
    if len(new_password) < 8:
        raise HTTPException(status_code=400, detail="Use at least 8 characters for your new password.")
    email = password_reset.use_code(str(body.get("email") or ""), str(body.get("code") or ""))
    if not email:
        raise HTTPException(status_code=400, detail="That code is wrong or has expired. Check the email or request a new code.")
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


@app.get("/api/admin/plans")
async def admin_list_plans(request: Request):
    import plans
    _verify_admin_auth(request)
    return {"plans": plans.list_plans()}


@app.put("/api/admin/plans/{plan_id}")
async def admin_save_plan(plan_id: str, request: Request):
    """Root: edit a plan's name, price and limits. Applies to every account on that plan at once."""
    import plans
    _verify_admin_auth(request)
    try:
        return {"plan": plans.save_plan(plan_id, await request.json())}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/api/admin/licenses/plan")
async def admin_set_plan(request: Request):
    """Root: put an account on a website plan."""
    import plans
    _verify_admin_auth(request)
    body = await request.json()
    plan = next((p for p in plans.list_plans() if p["id"] == body.get("plan_id")), None)
    if not plan:
        raise HTTPException(status_code=400, detail="Choose a plan.")
    ok, msg = license_engine.set_plan(str(body.get("license_key") or ""), plan["id"], int(plan["limits"].get("members", -1)))
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    return {"status": "ok", "message": f"Plan changed to {plan['name']}."}


@app.get("/api/admin/usage")
async def admin_usage(request: Request):
    """Root: each account's website plan and what it uses now."""
    import plans
    _verify_admin_auth(request)
    import billing
    usage, subs, empty = plans.usage_all(), billing.all_subscriptions(), {"websites": 0, "pages": 0, "storage_mb": 0.0, "submissions_month": 0}
    out = {}
    for account in license_engine.list_accounts():
        key = account.get("license_key")
        if key and key != "SCIP-PRO-ROOT-MASTER":
            out[key] = {"plan_id": plans.default_plan_id(account), "usage": usage.get(str(account.get("client_email", "")).strip().lower(), empty),
                        "subscription": subs.get(key), "self_signup": account.get("notes") == "Self sign-up"}
    return {"accounts": out}


@app.get("/api/public/plans")
async def public_plans():
    """Public: the plans shown on the pricing page (read live from the Plans page)."""
    import plans
    return {"plans": plans.public_plans()}


# -----------------------------------------------------------------------------
# Billing (test provider now, Stripe later: see backend/billing.py)
# -----------------------------------------------------------------------------
TRIAL_DAYS = 7


def _plan_by_id(plan_id: str) -> Optional[dict]:
    import plans
    return next((p for p in plans.list_plans() if p["id"] == plan_id), None)


def _billing_hooks() -> dict:
    """What a payment event does to the account: website plan, team seats and the collector license."""
    import plans

    def on_paid(key, plan_id):
        plan = _plan_by_id(plan_id)
        license_engine.set_plan(key, plan_id, int((plan or {}).get("limits", {}).get("members", -1)))
        if (license_engine.get_account(key) or {}).get("tier") == "pro":  # switching plan while subscribed: the new daily limit applies now
            license_engine.upgrade_account(key, "pro", plans.daily_contacts(plan))

    def on_renewed(key, days=30):
        # First payment starts the paid period now; a renewal adds the period (30 days monthly, 365 days yearly) to what is left.
        account = license_engine.get_account(key) or {}
        license_engine.activate_paid(key, days, plans.daily_contacts(_plan_by_id(str(account.get("plan_id") or ""))))

    def on_ended(key):
        # There is no permanent free plan: the account goes back to trial limits and, once the paid period is over, only Billing is open.
        trial = _plan_by_id("trial") or {"limits": {"members": 0}}
        license_engine.set_plan(key, "trial", int(trial["limits"].get("members", 0)))
        license_engine.upgrade_account(key, "trial", plans.daily_contacts(trial))
    def on_invoice(key, inv):
        account = license_engine.get_account(key) or {}
        to = account.get("client_email", "")
        if not to:
            return
        plan = (_plan_by_id(inv["plan_id"]) or {}).get("name", inv["plan_id"])
        url = os.environ.get("SCIPROSPECT_APP_URL", "http://127.0.0.1:3000").rstrip("/") + f"/billing/invoices/{inv['id']}"
        amount = f"{inv['currency']} {inv['amount']:.2f}"
        period = f"{inv['period_start']:%d %b %Y} – {inv['period_end']:%d %b %Y}"
        text = "\n".join([f"Thank you! Your payment for the SciProspect {plan} plan was received.", f"Invoice {inv['number']} · {amount} · {period}",
                           f"View or download your invoice: {url}", "", "This email and invoice were generated automatically by SciProspect."])
        logo = os.environ.get("SCIPROSPECT_APP_URL", "http://127.0.0.1:3000").rstrip("/") + "/branding/sciprospect-a-icon.png"
        html = (f"<p><img src=\"{html_escape(logo, quote=True)}\" alt=\"SciProspect\" width=\"40\" height=\"40\" style=\"vertical-align:middle\"> "
                f"<strong style=\"font-size:18px;vertical-align:middle\">SciProspect</strong></p>"
                f"<p>Thank you! Your payment for the <strong>SciProspect {html_escape(plan)}</strong> plan was received.</p>"
                f"<p>Invoice <strong>{inv['number']}</strong> · <strong>{html_escape(amount)}</strong><br>Period: {html_escape(period)}</p>"
                f"<p><a href=\"{html_escape(url, quote=True)}\" style=\"background:#c8ff4d;color:#0a0a0a;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:700\">View invoice</a></p>"
                f"<p style=\"color:#71717a;font-size:13px\">Manage your plan any time from Billing in your workspace.</p>"
                f"<p style=\"color:#a1a1aa;font-size:12px\">This email and invoice were generated automatically by SciProspect.</p>")
        threading.Thread(target=_send_quietly, args=(to, f"Your SciProspect invoice {inv['number']}", text, html), daemon=True).start()
    return {"on_paid": on_paid, "on_renewed": on_renewed, "on_ended": on_ended, "on_invoice": on_invoice}


def _billing_owner(request: Request):
    user = _require_authenticated_user(request, allow_expired=True)
    if user.get("is_admin"):
        raise HTTPException(status_code=403, detail="The root account has no billing.")
    if user.get("is_member"):
        raise HTTPException(status_code=403, detail="Only the account owner can manage billing.")
    account = license_engine.get_account(user.get("license_key"))
    if not account:
        raise HTTPException(status_code=404, detail="Account not found.")
    return user, account


@app.get("/api/billing")
async def billing_overview(request: Request):
    import billing
    import plans
    _user, account = _billing_owner(request)
    key = account["license_key"]
    if billing.provider() == "test":
        billing.sync_test(key, _billing_hooks())
        account = license_engine.get_account(key) or account
    status = license_engine.validate_license(key)
    return {"provider": billing.provider(), "plan": plans.plan_for(account), "subscription": billing.subscription(key),
            "invoices": billing.invoices(key), "plans": plans.public_plans(),
            "license": {"expired": status.get("status") == "expired", "tier": account.get("tier"), "expires_at": account.get("expires_at"),
                        "days_left": status.get("days_left")}}


@app.post("/api/billing/checkout")
async def billing_checkout(request: Request):
    """Start paying for a plan (or switch between paid plans while subscribed)."""
    import billing
    user, account = _billing_owner(request)
    body = await request.json()
    plan = _plan_by_id(str(body.get("plan_id") or ""))
    interval = str(body.get("interval") or "month")
    if plan and plan["kind"] == "custom":
        raise HTTPException(status_code=400, detail="The Custom plan is set up with us. Please contact us for a quote.")
    if not plan or plan["retired"] or plan["kind"] != "paid" or interval not in billing.INTERVALS or billing.price_for(plan, interval) <= 0:
        raise HTTPException(status_code=400, detail="Choose a paid plan.")
    key = account["license_key"]
    sub = billing.subscription(key)
    if sub and sub["status"] == "active":
        if sub["plan_id"] == plan["id"] and sub["interval"] == interval:
            raise HTTPException(status_code=400, detail="You are already on this plan.")
        try:
            billing.switch_plan(key, sub, plan, interval)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        _billing_hooks()["on_paid"](key, plan["id"])
        return {"changed": True, "message": f"You are now on {plan['name']} ({'yearly' if interval == 'year' else 'monthly'})."}
    try:
        url = billing.create_checkout(key, user.get("client_email", ""), plan, os.environ.get("SCIPROSPECT_APP_URL", "http://127.0.0.1:3000").rstrip("/"), interval)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"url": url}


@app.get("/api/billing/checkout/{session_id}")
async def billing_checkout_session(session_id: str, request: Request):
    import billing
    _user, account = _billing_owner(request)
    found = billing.checkout(session_id, account["license_key"])
    if not found:
        raise HTTPException(status_code=404, detail="This checkout was not found.")
    plan = _plan_by_id(found["plan_id"]) or {}
    return {**found, "plan_name": plan.get("name", found["plan_id"]), "email": account.get("client_email", "")}


@app.post("/api/billing/checkout/{session_id}/pay")
async def billing_test_pay(session_id: str, request: Request):
    """Test provider: the checkout page's Pay button. Behaves like Stripe's test cards (4000 0000 0000 0002 is declined)."""
    import billing
    _user, account = _billing_owner(request)
    if billing.provider() != "test":
        raise HTTPException(status_code=404, detail="Not found.")
    problem = billing.check_test_card(await request.json())
    if problem:
        raise HTTPException(status_code=402 if "declined" in problem else 400, detail=problem)
    if not billing.pay_test_checkout(session_id, account["license_key"], _billing_hooks()):
        raise HTTPException(status_code=400, detail="This checkout is no longer open.")
    return {"status": "ok"}


@app.post("/api/billing/cancel")
async def billing_cancel(request: Request):
    """Cancel at the end of the paid period ({"resume": true} undoes it)."""
    import billing
    _user, account = _billing_owner(request)
    resume = bool((await request.json()).get("resume"))
    if not billing.set_cancel(account["license_key"], not resume, _billing_hooks()):
        raise HTTPException(status_code=400, detail="There is no active subscription.")
    return {"status": "ok"}


@app.get("/api/billing/invoices/{invoice_id}")
async def billing_invoice(invoice_id: int, request: Request):
    import billing
    _user, account = _billing_owner(request)
    found = billing.invoice(account["license_key"], invoice_id)
    if not found:
        raise HTTPException(status_code=404, detail="Invoice not found.")
    plan = _plan_by_id(found["plan_id"]) or {}
    return {**found, "plan_name": plan.get("name", found["plan_id"]), "customer": {
        "name": account.get("client_name", ""), "organization": account.get("org_name", ""), "email": account.get("client_email", "")}}


@app.post("/api/billing/webhook")
async def billing_webhook(request: Request):
    """Stripe calls this after payments, renewals and cancellations. The signature is checked."""
    import billing
    if billing.provider() != "stripe":
        raise HTTPException(status_code=404, detail="Not found.")
    try:
        event = billing.verify_webhook(await request.body(), request.headers.get("stripe-signature", ""))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid signature.")
    billing.handle_event(event, _billing_hooks())
    return {"received": True}


@app.get("/api/plan")
async def my_plan(request: Request):
    """The signed-in account's website plan and usage (for the dashboard)."""
    import plans
    user = _require_authenticated_user(request)
    plan = _user_plan(user)
    if not plan:
        return {"plan": None, "usage": None}
    email = _workspace_email(user)
    return {"plan": plan, "usage": {**plans.usage(email), "data_storage_mb": plans.data_storage_mb(email)}}


@app.get("/api/admin/mfa")
async def admin_mfa_status(request: Request):
    """Root: which accounts and members have two-step sign-in on (keys "<license_key>:<member_id>")."""
    import mfa
    _verify_admin_auth(request)
    return {"enabled": [k for k in mfa.enabled_keys() if k != "__root__"]}


@app.post("/api/admin/mfa/reset")
async def admin_mfa_reset(request: Request):
    """Root: turn off two-step sign-in for a client or team member who lost their phone. They can set it up again."""
    import mfa
    _verify_admin_auth(request)
    body = await request.json()
    key = str(body.get("license_key") or "").strip()
    member_id = str(body.get("member_id") or "").strip()
    if not key or key == "SCIP-PRO-ROOT-MASTER":
        raise HTTPException(status_code=400, detail="Choose a client account.")
    if not mfa.reset(f"{key}:{member_id}"):
        raise HTTPException(status_code=404, detail="Two-step sign-in is not on for this person.")
    return {"status": "ok", "message": "Two-step sign-in was turned off. They can sign in with their password and set it up again."}


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


def _require_team_owner(request: Request):
    """Whoever owns a workspace with seats: an organisation, or a solo account whose plan includes team members."""
    user = _get_current_user_from_request(request)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required. Please sign in.")
    if user.get("is_admin"):
        return user
    if user.get("is_member"):
        raise HTTPException(status_code=403, detail="Only the account owner can manage the team.")
    account = license_engine.get_account(user.get("license_key", ""))
    if not account or account.get("account_type") not in ("org", "single"):
        raise HTTPException(status_code=403, detail="Account owner access required.")
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
    user = _require_team_owner(request)
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
    user = _require_team_owner(request)
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
    user = _require_team_owner(request)
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
        "seat_limit": account.get("seat_limit", 0),
        "members": [sanitize_member(m) for m in account.get("members", [])],
        "conferences": conferences,
    }


# -----------------------------------------------------------------------------
# GitHub Auto-Updater Endpoints
# -----------------------------------------------------------------------------


# -----------------------------------------------------------------------------
# SciStudio Website Builder Module Endpoints (/api/builder)
# -----------------------------------------------------------------------------
from builder_manager import builder_engine
import collector_archive
import event_shortlist
from collector_routes import collector_owner_key
from conference_manager import conference_engine

def _require_scistudio_access(user: dict):
    """Enforces that the user account has SciStudio website builder access enabled."""
    if user.get("is_admin"):
        return
    # Team members are allowed; what they may do on each website depends on their role (_check_member).
    if not user.get("scistudio_access", True):
        raise HTTPException(
            status_code=403,
            detail="SciStudio access is disabled for your account. Please contact an administrator to request access."
        )


# Team members work on their organization's websites. Viewer: open and preview. Editor: also edit and create.
# Admin: also publish, delete, export and see submissions. Billing stays with the account owner.
MEMBER_NEEDS = {"view": {"viewer", "editor", "admin"}, "edit": {"editor", "admin"}, "manage": {"admin"}}


def _workspace_email(user: dict) -> str:
    """The email that owns the workspace's websites: the account owner's, also for their team members."""
    if user.get("is_member"):
        account = license_engine.get_account(user.get("parent_license_key") or user.get("license_key")) or {}
        return str(account.get("client_email") or "").strip().lower()
    return str(user.get("client_email") or "").strip().lower()


def _check_member(user: dict, need: str) -> None:
    if not user.get("is_member"):
        return
    if not user.get("scistudio_access", True):
        raise HTTPException(status_code=403, detail="SciStudio is turned off for your account. Ask your organization admin.")
    if str(user.get("role") or "editor") not in MEMBER_NEEDS.get(need, MEMBER_NEEDS["manage"]):
        raise HTTPException(status_code=403, detail="Your role can't do this. Ask an organization admin." if need == "manage"
                            else "Viewers can open websites but not change them. Ask an organization admin for editor access.")

def _require_owned_conference(conference_id: str, user: dict, need: str = "view") -> dict:
    if not re.fullmatch(r"conf_[a-f0-9]{8}", conference_id):
        raise HTTPException(status_code=404, detail="Conference not found.")
    conf = conference_engine.get_conference(conference_id)
    if not conf:
        raise HTTPException(status_code=404, detail="Conference not found.")
    if user.get("is_admin"):
        return conf
    _check_member(user, need)
    user_email = _workspace_email(user)
    owner_email = (conf.get("owner_email") or "").strip().lower()
    user_key = (user.get("license_key") or "").strip().upper()
    owner_key = (conf.get("owner_license_key") or "").strip().upper()

    if (user_email and owner_email == user_email) or (user_key and owner_key == user_key):
        return conf

    raise HTTPException(status_code=404, detail="Conference not found.")

def _require_owned_site(site_id: str, user: dict, need: str = "view") -> dict:
    if not re.fullmatch(r"site_[a-f0-9]{8}", site_id):
        raise HTTPException(status_code=404, detail="Website not found.")
    site = builder_engine.get_site(site_id)
    if not site:
        raise HTTPException(status_code=404, detail="Website not found.")
    if user.get("is_admin"):
        return site
    _check_member(user, need)
    owner = (site or {}).get("user_email", "").strip().lower()
    email = _workspace_email(user)
    if email and owner == email:
        return site
    conf_id = site.get("conference_id")
    if conf_id:
        try:
            _require_owned_conference(conf_id, user, need)
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


@app.get("/api/library")
async def library_list(request: Request):
    """Imported designs for the Components panel (templates appear in the template gallery)."""
    import design_library
    _require_authenticated_user(request)
    return {"items": design_library.list_items()}


def _require_root(request: Request) -> dict:
    user = _require_authenticated_user(request)
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Only the root administrator can manage the design library.")
    return user


@app.post("/api/library")
async def library_import(request: Request):
    """Imports one design file, or a list of them. Nothing is saved unless every design passes the checks."""
    import design_library
    user = _require_root(request)
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="That is not valid JSON. Copy the whole design file and try again.")
    packs = body if isinstance(body, list) else [body]
    if not 1 <= len(packs) <= 20:
        raise HTTPException(status_code=400, detail="Import between 1 and 20 designs at a time.")
    clean = []
    for i, pack in enumerate(packs):
        try:
            clean.append(design_library.validate(pack))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=f"Design {i + 1}: {exc}" if len(packs) > 1 else str(exc))
    return {"items": [design_library.save(d, user.get("client_email", "")) for d in clean]}


@app.delete("/api/library/{item_id}")
async def library_delete(item_id: str, request: Request):
    import design_library
    _require_root(request)
    if not design_library.delete(item_id):
        raise HTTPException(status_code=404, detail="Design not found.")
    return {"status": "ok"}


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
    _require_owned_conference(conference_id, user, "edit")
    body = await request.json()
    ok, msg, conf = conference_engine.update_conference(conference_id, body)
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    return {"status": "ok", "conference": conf, "message": msg}


@app.delete("/api/builder/conferences/{conference_id}")
async def builder_delete_conference(conference_id: str, request: Request):
    user = _require_authenticated_user(request)
    _require_scistudio_access(user)
    _require_owned_conference(conference_id, user, "manage")
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
    sites = builder_engine.list_sites("admin" if user.get("is_admin") else _workspace_email(user), conference_id=conference_id)
    return {"sites": sites}


def _domain_view(site_id: str, plan: Optional[dict], pointing: bool = False) -> dict:
    """What the Domain dialog shows: whether the plan allows it, and the site's domain with the DNS records to add."""
    import custom_domains
    import plans
    domain = custom_domains.get(site_id)
    return {"allowed": plans.feature_message(plan, "custom_domain") is None, "message": plans.feature_message(plan, "custom_domain"),
            "domain": domain and {"hostname": domain["hostname"], "verified": domain["verified"], "pointing": pointing,
                                  "records": custom_domains.records(domain["hostname"], domain["token"])}}


def _domain_site(request: Request, site_id: str, need: str) -> tuple[dict, Optional[dict]]:
    user = _require_authenticated_user(request)
    _require_scistudio_access(user)
    _require_owned_site(site_id, user, need)
    return user, _user_plan(user)


@app.get("/api/builder/sites/{site_id}/domain")
async def builder_domain(site_id: str, request: Request):
    _, plan = _domain_site(request, site_id, "view")
    return _domain_view(site_id, plan)


@app.put("/api/builder/sites/{site_id}/domain")
async def builder_domain_set(site_id: str, request: Request):
    import custom_domains
    import plans
    _, plan = _domain_site(request, site_id, "manage")
    message = plans.feature_message(plan, "custom_domain")
    if message:
        raise HTTPException(status_code=403, detail=message)
    body = await request.json()
    try:
        hostname = custom_domains.normalize(str(body.get("hostname") or "") if isinstance(body, dict) else "")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    custom_domains.claim(site_id, hostname)
    return _domain_view(site_id, plan)


@app.post("/api/builder/sites/{site_id}/domain/verify")
async def builder_domain_verify(site_id: str, request: Request):
    from starlette.concurrency import run_in_threadpool
    import custom_domains
    _, plan = _domain_site(request, site_id, "manage")
    try:
        result = await run_in_threadpool(custom_domains.verify, site_id)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    if not result:
        raise HTTPException(status_code=404, detail="Add a domain first.")
    return _domain_view(site_id, plan, pointing=result["pointing"])


@app.delete("/api/builder/sites/{site_id}/domain")
async def builder_domain_remove(site_id: str, request: Request):
    import custom_domains
    _domain_site(request, site_id, "manage")
    custom_domains.release(site_id)
    return {"status": "ok"}


def _plan_of_account(account: Optional[dict]) -> Optional[dict]:
    """The website plan for an account; None (no limits) for root, or when the database is not configured (tests)."""
    import db as database
    if not account or account.get("license_key") == "SCIP-PRO-ROOT-MASTER" or not database.is_configured():
        return None
    import plans
    return plans.plan_for(account)


def _enforce_plan(plan: Optional[dict], key: str, new_total: float) -> None:
    import plans
    message = plans.over_limit(plan, key, new_total)
    if message:
        raise HTTPException(status_code=403, detail=message)


def _user_plan(user: dict) -> Optional[dict]:
    return None if user.get("is_admin") else _plan_of_account(license_engine.get_account(user.get("license_key")))


@app.post("/api/builder/sites")
async def builder_create_site(request: Request):
    user = _require_authenticated_user(request)
    _require_scistudio_access(user)
    _check_member(user, "edit")
    plan = _user_plan(user)
    if plan:
        import plans
        _enforce_plan(plan, "websites", plans.usage(_workspace_email(user))["websites"] + 1)
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
        user_email=_workspace_email(user),  # members create websites for their organization
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
    _require_owned_site(site_id, user, "edit")
    body = await request.json()
    if "conference_id" in body and body["conference_id"]:
        _require_owned_conference(body["conference_id"], user)
    if isinstance(body.get("pages"), list):
        _enforce_plan(_user_plan(user), "pages", len(body["pages"]))
    ok, msg, site = builder_engine.update_site(site_id, body)
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    return {"status": "ok", "message": msg, "site": site}


# ---------- Invited speakers: a private shortlist per event website ----------
@app.get("/api/builder/sites/{site_id}/shortlist")
async def builder_shortlist(site_id: str, request: Request):
    user = _require_authenticated_user(request)
    _require_scistudio_access(user)
    _require_owned_site(site_id, user)
    return {"invited": event_shortlist.listing(site_id)}


@app.post("/api/builder/sites/{site_id}/shortlist")
async def builder_shortlist_add(site_id: str, request: Request):
    """Adds researchers from the caller's collector archive to the site's private shortlist (not shown on the website)."""
    user = _require_authenticated_user(request)
    _require_scistudio_access(user)
    _require_owned_site(site_id, user, "edit")
    key = collector_owner_key(user, lambda key: license_engine.get_account(key))
    body = await request.json()
    emails = body.get("emails") if isinstance(body, dict) else None
    if not isinstance(emails, list) or not emails or not all(isinstance(e, str) for e in emails) or len(emails) > event_shortlist.MAX_PER_REQUEST:
        raise HTTPException(status_code=400, detail=f"Send between 1 and {event_shortlist.MAX_PER_REQUEST} email addresses.")
    contacts = collector_archive.contacts_by_email(key, emails)
    added = event_shortlist.add(site_id, contacts)
    return {"added": added, "already_listed": len(contacts) - added, "not_found": len({e.strip().lower() for e in emails}) - len(contacts)}


@app.delete("/api/builder/sites/{site_id}/shortlist/{email}")
async def builder_shortlist_remove(site_id: str, email: str, request: Request):
    user = _require_authenticated_user(request)
    _require_scistudio_access(user)
    _require_owned_site(site_id, user, "edit")
    if not event_shortlist.remove(site_id, email):
        raise HTTPException(status_code=404, detail="That researcher is not on the shortlist.")
    return {"status": "ok"}


@app.patch("/api/builder/sites/{site_id}/conference")
async def builder_assign_site_conference(site_id: str, request: Request):
    user = _require_authenticated_user(request)
    _require_scistudio_access(user)
    _require_owned_site(site_id, user, "edit")
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
    _require_owned_site(site_id, user, "manage")
    ok, msg = builder_engine.delete_site(site_id)
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    return {"status": "ok", "message": msg}


@app.post("/api/builder/sites/{site_id}/publish")
async def builder_publish_site(site_id: str, request: Request):
    user = _require_authenticated_user(request)
    _require_scistudio_access(user)
    _require_owned_site(site_id, user, "manage")
    ok, msg, site = builder_engine.update_site(site_id, {"status": "published"})
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    return {"status": "ok", "message": "Website successfully published!", "url": site.get("url")}


@app.post("/api/builder/sites/{site_id}/unpublish")
async def builder_unpublish_site(site_id: str, request: Request):
    """Takes a website offline; visitors see a "not available" page. Content is kept."""
    user = _require_authenticated_user(request)
    _require_scistudio_access(user)
    _require_owned_site(site_id, user, "manage")
    ok, msg, _site = builder_engine.update_site(site_id, {"status": "draft"})
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    return {"status": "ok", "message": "Your website is offline."}


@app.get("/api/builder/sites/{site_id}/export")
def builder_export_site(site_id: str, request: Request):
    user = _require_authenticated_user(request)
    _require_scistudio_access(user)
    site = _require_owned_site(site_id, user, "manage")
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
    _require_owned_site(site_id, user, "edit")
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
    plan = _user_plan(user)
    if plan:
        import plans
        _enforce_plan(plan, "storage_mb", plans.usage(_workspace_email(user))["storage_mb"] + len(data) / 1_048_576)
    import uuid
    name = f"{uuid.uuid4().hex}.{MEDIA_TYPES[mime]}"
    folder = _media_dir(site_id)
    folder.mkdir(parents=True, exist_ok=True)
    (folder / name).write_bytes(bytes(data))
    builder_engine.record_media(site_id, name, mime, len(data))
    return {"status": "ok", "url": f"/api/builder/media/{site_id}/{name}"}


_form_rate_limit = FormRateLimit()
# Sending a form (message, registration, abstract): unlimited per plan, but at most 10 per 10 minutes per visitor.
_submit_rate_limit = FormRateLimit(limit=10, seconds=600)


def _limit_form_requests(request):
    peer = request.client.host if request.client else "unknown"
    if not _form_rate_limit.allow(peer):
        raise HTTPException(status_code=429, detail="Please wait a minute and try again.", headers={"Retry-After": "60"})


@app.post("/api/public/forms/{site_id}/{form_id}")
async def submit_website_form(site_id: str, form_id: str, request: Request):
    """Public: a visitor submits a form on a website. Values are checked against the form's own fields."""
    _limit_form_requests(request)
    peer = request.client.host if request.client else "unknown"
    if not _submit_rate_limit.allow(peer):
        raise HTTPException(status_code=429, detail="You've sent several forms in a short time. Please wait a few minutes and try again.", headers={"Retry-After": "600"})
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
    owner = (site or {}).get("user_email", "")
    plan = _plan_of_account(license_engine.account_for_email(owner)) if owner else None
    if plan:
        import plans
        _enforce_plan(plan, "submissions_month", plans.usage(owner)["submissions_month"] + 1)
    message = (section.get("data") or {}).get("success_message") or "Thank you! Your message has been sent."
    if section["type"] == "submission":
        paper, problem = forms.clean_paper(section, payload, (site or {}).get("event"))
        if problem:
            raise HTTPException(status_code=400, detail=problem)
        if "_file" in paper and not (_uploads_dir(site_id) / paper["_file"]["id"]).is_file():
            raise HTTPException(status_code=400, detail="The attached file could not be found. Please attach it again.")
        number = forms.save_paper(site_id, form_id, page_id, {**paper, **values}, (section.get("data") or {}).get("id_prefix", ""))
        done = (section.get("data") or {}).get("success_message") or "Thank you! Your submission has been received."
        to = next((str(v["value"]) for v in values.values() if isinstance(v, dict) and forms.EMAIL.match(str(v.get("value") or ""))), "")
        if to:
            title = paper["title"]["value"]
            threading.Thread(target=_send_quietly, daemon=True, args=(to, f"Submission received: {number}",
                f"We received your submission \"{title}\". Your submission ID is {number}. Please keep it for your records.",
                f"<p>We received your submission <strong>{html_escape(title)}</strong>.</p><p>Your submission ID is <strong>{number}</strong>. Please keep it for your records.</p>")).start()
        return {"status": "ok", "message": f"{done} Your submission ID is {number}.", "submission_number": number}
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
    site = builder_engine.get_site(site_id) or {}
    settings = ((site.get("event") or {}).get("receipts") or {}) if isinstance(site.get("event"), dict) else {}
    number = forms.mark_test_payment(site_id, submission_id, token, settings.get("prefix", ""))
    if not number:
        raise HTTPException(status_code=400, detail="This payment could not be completed.")
    message = (section.get("data") or {}).get("success_message") or "Payment received (test mode). Your registration is confirmed."
    link = f"/receipt/{site_id}/{submission_id}?t={quote(token)}"
    threading.Thread(target=_email_receipt, args=(site, submission_id, token, link), daemon=True).start()
    return {"status": "ok", "message": message, "receipt": {"number": number, "url": link}}


def _send_quietly(to: str, subject: str, text: str, html: str) -> None:
    """Background email that never breaks the request that triggered it."""
    if not os.environ.get("SCIPROSPECT_SMTP_HOST"):
        return
    try:
        from mailer import send_mail
        send_mail(to, subject, text, html)
    except Exception as exc:
        print(f"[MAIL] Not sent: {type(exc).__name__}")


UPLOAD_MAX_BYTES = 20 * 1024 * 1024


def _uploads_dir(site_id: str) -> Path:
    """Visitor files (abstracts). Private: only the site owner can download them."""
    from builder_manager import get_websites_dir
    return get_websites_dir() / "uploads" / site_id


@app.post("/api/public/forms/{site_id}/{form_id}/file")
async def upload_form_file(site_id: str, form_id: str, request: Request):
    """Public: attach a PDF, DOCX or DOC (max 20 MB) to a submission form. Returns an id the form sends with the submission."""
    import forms
    import uuid
    _limit_form_requests(request)
    if not re.fullmatch(r"site_[a-f0-9]{8}", site_id) or not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", form_id):
        raise HTTPException(status_code=404, detail="Form not found.")
    section, _ = forms.find_form(builder_engine.get_site(site_id) or {}, form_id)
    if not section or section.get("type") != "submission" or (section.get("data") or {}).get("file_mode") == "off":
        raise HTTPException(status_code=404, detail="Form not found.")
    too_big = HTTPException(status_code=413, detail="This file is larger than 20 MB.")
    try:
        if int(request.headers.get("content-length") or 0) > UPLOAD_MAX_BYTES:
            raise too_big
    except ValueError:
        pass
    data = bytearray()
    async for chunk in request.stream():
        data.extend(chunk)
        if len(data) > UPLOAD_MAX_BYTES:
            raise too_big
    name = re.sub(r"[^\w .()-]", "", unquote(request.headers.get("x-file-name", "")))[:120]  # sent URL-encoded
    kind = forms.sniff_document(bytes(data[:8]))
    if not data or not kind or (kind == "docx" and not name.lower().endswith(".docx")):
        raise HTTPException(status_code=415, detail="Attach a PDF or Word file (.pdf, .docx or .doc).")
    # shortcut: files attached but never submitted stay on disk; add a nightly cleanup if storage grows.
    file_id = f"{uuid.uuid4().hex}.{kind}"
    folder = _uploads_dir(site_id)
    folder.mkdir(parents=True, exist_ok=True)
    (folder / file_id).write_bytes(bytes(data))
    return {"file_id": file_id, "name": name or file_id}


def _email_receipt(site: dict, submission_id: int, token: str, link: str) -> None:
    """Emails the receipt link to the address the person registered with. Never fails the payment."""
    import forms
    from html import escape
    try:
        receipt = forms.receipt(site, submission_id, token)
        to = next((str(v["value"]) for v in (receipt or {}).get("buyer", []) if forms.EMAIL.match(str(v.get("value") or ""))), "")
        if not receipt or not to or not os.environ.get("SCIPROSPECT_SMTP_HOST"):
            return
        from mailer import send_mail
        url = os.environ.get("SCIPROSPECT_APP_URL", "http://127.0.0.1:3000").rstrip("/") + link
        order, event = receipt["order"], receipt["event"]
        total = f"{order.get('currency', '')} {float(order.get('total') or 0):.2f}"
        text = "\n".join([f"Thank you for registering for {event['name']}.", f"Receipt {receipt['number']}, total {total}.",
                          f"View or download your receipt: {url}"])
        html = (f"<p>Thank you for registering for <strong>{escape(event['name'])}</strong>.</p>"
                f"<p>Receipt <strong>{escape(receipt['number'])}</strong> · Total <strong>{escape(total)}</strong></p>"
                f"<p><a href=\"{escape(url, quote=True)}\" style=\"background:#5a45d6;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none\">View or download receipt</a></p>")
        send_mail(to, f"Your receipt {receipt['number']} · {event['name']}", text, html)
    except Exception as exc:  # the payment is already confirmed; a mail problem must not surface as a failure
        print(f"[RECEIPT] Email not sent: {type(exc).__name__}")


@app.get("/api/public/receipts/{site_id}/{submission_id}")
async def public_receipt(site_id: str, submission_id: int, request: Request, t: str = ""):
    """Public: a paid registration's receipt, for whoever holds the link from the confirmation screen or email."""
    import forms
    _limit_form_requests(request)
    if not re.fullmatch(r"site_[a-f0-9]{8}", site_id):
        raise HTTPException(status_code=404, detail="Receipt not found.")
    receipt = forms.receipt(builder_engine.get_site(site_id) or {}, submission_id, t)
    if not receipt:
        raise HTTPException(status_code=404, detail="Receipt not found. Check the link in your email.")
    return receipt


@app.patch("/api/builder/sites/{site_id}/submissions/{submission_id}")
async def builder_set_submission_status(site_id: str, submission_id: int, request: Request):
    """Owner only: move a submission along, e.g. received → under review → accepted."""
    import forms
    user = _require_authenticated_user(request)
    _require_scistudio_access(user)
    _require_owned_site(site_id, user, "manage")
    status = str((await request.json()).get("status") or "")
    if not forms.set_status(site_id, submission_id, status):
        raise HTTPException(status_code=400, detail="That status can't be used.")
    return {"status": "ok"}


@app.get("/api/builder/sites/{site_id}/submissions/{submission_id}/file")
async def builder_submission_file(site_id: str, submission_id: int, request: Request):
    """Owner only: download the file attached to a submission."""
    import forms
    user = _require_authenticated_user(request)
    _require_scistudio_access(user)
    _require_owned_site(site_id, user, "manage")
    meta = forms.submission_file(site_id, submission_id)
    path = _uploads_dir(site_id) / meta["id"] if meta else None
    if not path or not path.is_file():
        raise HTTPException(status_code=404, detail="File not found.")
    return FileResponse(path, filename=meta.get("value") or meta["id"])


@app.get("/api/builder/sites/{site_id}/submissions")
async def builder_list_submissions(site_id: str, request: Request):
    """Owner only: all form submissions for one website, newest first."""
    import forms
    user = _require_authenticated_user(request)
    _require_scistudio_access(user)
    _require_owned_site(site_id, user, "manage")
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


# Role-owned page namespaces. Data APIs continue to enforce resource ownership.
def _page_namespace(user):
    if user.get("is_admin"):
        return "root"
    if user.get("is_member"):
        return "conference"
    account = license_engine.get_account(user.get("license_key", "")) or {}
    return "organization" if account.get("account_type") == "org" else "client"


from collector_routes import collector_router
def _data_storage_message(license_key: str) -> Optional[str]:
    """A message when the account's data storage is over its plan, so a new collection should not start."""
    import plans
    account = license_engine.get_account(license_key) or {}
    plan = _plan_of_account(account)
    if not plan:
        return None
    return plans.over_limit(plan, "data_storage_mb", plans.data_storage_mb(account.get("client_email", "")))


app.include_router(collector_router(_require_authenticated_user, license_engine, _data_storage_message))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=False)
