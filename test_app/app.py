"""
app.py (Evaluation Edition)
===========================
FastAPI backend for local testing with strict 7-day trial and 1,000/day email verification enforcement.
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
from trial_manager import trial_engine

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

app = FastAPI(title="SciProspect - Scientific Lead Prospecting (7-Day Evaluation Edition)")

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
    process_state["status"] = "running"
    process_state["script_name"] = script_name
    process_state["current_stage"] = stage_name
    process_state["start_time"] = datetime.now().isoformat()
    process_state["lines"] = []
    process_state["exit_code"] = None

    broadcast_log(f"Starting {stage_name}...", stage=stage_name, status="running")

    old_stdout = sys.stdout
    old_stderr = sys.stderr
    stream = LogStream(stage_name)
    sys.stdout = stream
    sys.stderr = stream

    try:
        import importlib
        if action == "openalex":
            mod = importlib.import_module("01_extract_researchers_test")
            mod.run(
                keyword=params.get("keyword", "Physical Chemistry"),
                pages=params.get("pages", 25),
                from_date=params.get("from_date", "2026-01-01"),
                to_date=params.get("to_date", "2026-01-31"),
            )
        elif action == "scholarly":
            mod = importlib.import_module("02_collect_scholarly_emails_test")
            mod.run(
                input_file=params.get("input_file"),
                target_leads=params.get("target_leads", 1000),
            )
        elif action == "nih":
            mod = importlib.import_module("04_extract_nih_researchers_test")
            mod.run(
                keyword=params.get("keyword", "cell biology"),
                target_leads=params.get("target_leads", 100),
            )
        elif action in ("unified", "openalex_unified"):
            mod = importlib.import_module("03_unified_lead_pipeline_test")
            mod.run(
                keyword=params.get("keyword", "cell biology"),
                target_leads=params.get("target_leads", 1000),
                min_score=params.get("min_score", 50),
                from_date=params.get("from_date", "2025-01-01"),
                to_date=params.get("to_date", "2026-12-31"),
            )
        elif action == "biorxiv":
            mod = importlib.import_module("06_extract_biorxiv_researchers_test")
            mod.run(
                keyword=params.get("keyword", "cell biology"),
                target_leads=params.get("target_leads", 1000),
                min_score=params.get("min_score", 50),
                from_date=params.get("from_date", "2025-01-01"),
                to_date=params.get("to_date", "2026-12-31"),
            )
        stream.flush()
        process_state["status"] = "completed"
        process_state["exit_code"] = 0
        broadcast_log(f"{stage_name} completed successfully.", stage=stage_name, status="completed")
    except Exception as e:
        stream.flush()
        process_state["status"] = "error"
        process_state["exit_code"] = 1
        broadcast_log(f"Execution failed: {e}", stage=stage_name, status="error")
    finally:
        sys.stdout = old_stdout
        sys.stderr = old_stderr


# -----------------------------------------------------------------------------
# Trial Endpoints
# -----------------------------------------------------------------------------

@app.get("/api/trial/status")
async def get_trial_status():
    """Returns trial countdown, today's verified quota, and active limits."""
    return trial_engine.check_status()


@app.post("/api/trial/reset")
@app.get("/api/trial/reset")
async def reset_trial_limits():
    """Admin/Developer endpoint to instantly reset trial limits and daily quota."""
    status = trial_engine.reset_trial()
    return {
        "status": "success",
        "message": "Trial limits and today's verification quota successfully reset to 0/1,000.",
        "trial_status": status
    }



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
async def get_stats():
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
        "trial_days_left": status.get("days_left", 0),
        "trial_expires_on": status.get("expires_on", ""),
        "today_verified_used": status.get("today_verified", 0),
        "today_verified_limit": status.get("daily_verified_limit", 1000),
        "data_dir": str(data_dir),
    }


@app.get("/api/datasets")
async def list_datasets():
    data_dir = get_data_dir()
    files = []
    import re
    for p in sorted(data_dir.rglob("*.csv"), key=lambda x: x.stat().st_mtime, reverse=True):
        try:
            stat = p.stat()
            rel_path = str(p.relative_to(data_dir)).replace("\\", "/")
            
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
        for d in [data_dir, BASE_DIR.parent / "data", BASE_DIR / "data"]:
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
        csvs = sorted(data_dir.rglob("*.csv"), key=lambda x: x.stat().st_mtime, reverse=True)
        if csvs:
            target = csvs[0]

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

    for d in [data_dir, BASE_DIR.parent / "data", BASE_DIR / "data"]:
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
            for sub in list(d.glob("*")):
                if sub.is_dir() and re.match(r"^\d{4}-\d{2}-\d{2}$", sub.name):
                    try:
                        import shutil
                        shutil.rmtree(sub, ignore_errors=True)
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
    status = trial_engine.check_status()
    if not status["active"]:
        raise HTTPException(
            status_code=403,
            detail=status.get("reason", "Your access has been suspended or expired. Please contact support.")
        )

    if process_state["status"] == "running":
        raise HTTPException(status_code=400, detail="A task is already actively running.")

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
        script_name = "01_extract_researchers_test.py"
        stage_name = f"OpenAlex Discovery ({keyword} | 5k-10k pool)"

    elif action == "scholarly":
        rem = status["remaining_verified_today"]
        if rem <= 0:
            raise HTTPException(
                status_code=429,
                detail="Daily trial limit reached (1,000/1,000 verified leads used today). Resets tomorrow!"
            )
        target_leads = min(int(body.get("target_leads", 1000)), rem)
        input_file = body.get("input_file", "").strip()
        params["input_file"] = input_file
        params["target_leads"] = target_leads
        script_name = "02_collect_scholarly_emails_test.py"
        stage_name = f"Scholarly Verification (Remaining Today: {rem} leads)"

    elif action == "nih":
        rem = status["remaining_verified_today"]
        if rem <= 0:
            raise HTTPException(
                status_code=429,
                detail="Daily trial limit reached (1,000/1,000 verified leads used today). Resets tomorrow!"
            )
        keyword = body.get("keyword", "cell biology").strip()
        leads = min(int(body.get("target_leads", 100)), rem)
        params["keyword"] = keyword
        params["target_leads"] = leads
        script_name = "04_extract_nih_researchers_test.py"
        stage_name = f"NIH Funded PIs ({keyword} | Target: {leads})"
    elif action in ("unified", "openalex_unified"):
        rem = status["remaining_verified_today"]
        if rem <= 0:
            raise HTTPException(
                status_code=429,
                detail="Daily trial limit reached (1,000/1,000 verified leads used today). Resets tomorrow!"
            )
        keyword = body.get("keyword", "cell biology").strip()
        leads = min(int(body.get("target_leads", 1000)), rem)
        min_score = int(body.get("min_score", 50))
        from_date = normalize_date_str(body.get("from_date"), "2025-01-01")
        to_date = normalize_date_str(body.get("to_date"), "2026-12-31")
        params["keyword"] = keyword
        params["target_leads"] = leads
        params["min_score"] = min_score
        params["from_date"] = from_date
        params["to_date"] = to_date
        script_name = "03_unified_lead_pipeline_test.py"
        stage_name = f"Source 1: OpenAlex Pipeline ({keyword} | {from_date} to {to_date} | Target: {leads} | Score >= {min_score})"

    elif action == "biorxiv":
        rem = status["remaining_verified_today"]
        if rem <= 0:
            raise HTTPException(
                status_code=429,
                detail="Daily trial limit reached (1,000/1,000 verified leads used today). Resets tomorrow!"
            )
        keyword = body.get("keyword", "cell biology").strip()
        leads = min(int(body.get("target_leads", 1000)), rem)
        min_score = int(body.get("min_score", 50))
        from_date = normalize_date_str(body.get("from_date"), "2025-01-01")
        to_date = normalize_date_str(body.get("to_date"), "2026-12-31")
        params["keyword"] = keyword
        params["target_leads"] = leads
        params["min_score"] = min_score
        params["from_date"] = from_date
        params["to_date"] = to_date
        script_name = "06_extract_biorxiv_researchers_test.py"
        stage_name = f"Source 2: bioRxiv Pipeline ({keyword} | {from_date} to {to_date} | Target: {leads} | Score >= {min_score})"
    else:
        raise HTTPException(status_code=400, detail=f"Action '{action}' is disabled in trial edition.")

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
    try:
        import sys
        for mod_name in ["01_extract_researchers_test", "02_collect_scholarly_emails_test", "04_extract_nih_researchers_test"]:
            if mod_name in sys.modules and hasattr(sys.modules[mod_name], "request_stop"):
                sys.modules[mod_name].request_stop()
    except Exception:
        pass

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
async def stream_logs():
    async def event_generator():
        for entry in process_state["lines"][-30:]:
            yield f"data: {json.dumps(entry)}\n\n"
        while True:
            try:
                entry = await asyncio.wait_for(log_queue.get(), timeout=2.0)
                yield f"data: {json.dumps(entry)}\n\n"
            except asyncio.TimeoutError:
                yield f"data: {json.dumps({'type': 'heartbeat', 'status': process_state['status']})}\n\n"

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
