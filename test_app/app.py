"""
app.py (Evaluation Edition)
===========================
FastAPI backend for local testing with strict 7-day trial and 1,000/day email verification enforcement.
"""

import asyncio
import csv
import json
import os
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
        cand = (data_dir / file).resolve()
        if cand.exists() and cand.is_relative_to(data_dir):
            target = cand
        elif Path(file).exists():
            target = Path(file).resolve()

    if not target:
        csvs = sorted(data_dir.rglob("*.csv"), key=lambda x: x.stat().st_mtime, reverse=True)
        if csvs:
            target = csvs[0]

    if not target or not target.exists():
        return {"rows": [], "total": 0, "page": 1, "page_size": page_size, "total_pages": 0, "file": None, "data_dir": str(data_dir)}

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
        "rows": paged_rows,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
        "file": file_label,
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


@app.post("/api/pipeline/run")
@app.post("/api/pipeline/start")
async def start_pipeline(request: Request):
    status = trial_engine.check_status()
    if not status["active"]:
        raise HTTPException(
            status_code=403,
            detail="Your 7-day evaluation trial has ended. Please contact support to upgrade."
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
    with process_lock:
        if current_process is not None and current_process.poll() is None:
            try:
                current_process.terminate()
                process_state["status"] = "stopped"
                broadcast_log("Pipeline stopped by user request.", status="stopped")
                return {"status": "stopped"}
            except Exception as e:
                return {"status": "error", "error": str(e)}
    return {"status": "not_running"}


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


# Mount static assets
if STATIC_DIR.exists():
    app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=False)
