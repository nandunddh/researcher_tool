import asyncio
import csv
import glob
import json
import os
import re
import signal
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

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
STATIC_DIR = BASE_DIR / "static"

app = FastAPI(title="Researcher Tool - Academic Outreach Hub")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def ensure_initial_topic_queue():
    """Initializes Physical_Chemistry_needto_extract.csv from existing extraction if not yet created."""
    pc_queue = DATA_DIR / "Physical_Chemistry_needto_extract.csv"
    if not pc_queue.exists():
        pc_raw = DATA_DIR / "2026-10-22" / "openalex_researchers_2026-10-22_16-02-49.csv"
        central_file = DATA_DIR / "central_master_leads.csv"
        if pc_raw.exists():
            try:
                central_leads = {}
                if central_file.exists():
                    with open(central_file, "r", encoding="utf-8", errors="replace") as cf:
                        for row in csv.DictReader(cf):
                            aid = (row.get("openalex_author_id") or "").strip()
                            em = (row.get("professional_email") or row.get("email") or "").strip().lower()
                            if aid:
                                central_leads[aid] = row
                            elif em:
                                central_leads[em] = row
                
                with open(pc_raw, "r", encoding="utf-8", errors="replace") as rf, open(pc_queue, "w", encoding="utf-8-sig", newline="") as qf:
                    reader = csv.DictReader(rf)
                    fieldnames = list(reader.fieldnames or [])
                    for extra in ["professional_email", "email_source_url", "review_status", "email_status"]:
                        if extra not in fieldnames:
                            fieldnames.append(extra)
                    writer = csv.DictWriter(qf, fieldnames=fieldnames)
                    writer.writeheader()
                    for r in reader:
                        aid = (r.get("openalex_author_id") or "").strip()
                        em = (r.get("professional_email") or "").strip().lower()
                        match_row = central_leads.get(aid) or (central_leads.get(em) if em else None)
                        if match_row:
                            r["professional_email"] = match_row.get("professional_email") or match_row.get("email") or em
                            r["email_source_url"] = match_row.get("email_source_url") or ""
                            r["review_status"] = "found"
                            r["email_status"] = "Verified Name Match"
                        else:
                            if not r.get("review_status"):
                                r["review_status"] = "needs_review"
                        writer.writerow(r)
            except Exception as e:
                print(f"[Init] Could not auto-initialize pc_queue: {e}")

ensure_initial_topic_queue()


# -----------------------------------------------------------------------------
# Global Process State for Pipeline Execution & SSE Streaming
# -----------------------------------------------------------------------------
current_process: Optional[subprocess.Popen] = None
process_lock = threading.Lock()
log_queue = asyncio.Queue()
process_state = {
    "status": "idle",  # idle | running | completed | stopped | error
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
    if len(process_state["lines"]) > 2000:
        process_state["lines"].pop(0)
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.run_coroutine_threadsafe(log_queue.put(entry), loop)
    except Exception:
        pass


def run_pipeline_worker(cmd: list, script_name: str, stage_name: str):
    global current_process
    process_state["status"] = "running"
    process_state["script_name"] = script_name
    process_state["current_stage"] = stage_name
    process_state["start_time"] = datetime.now().isoformat()
    process_state["lines"] = []
    process_state["exit_code"] = None

    broadcast_log(f"Starting {stage_name}: {' '.join(cmd)}", stage=stage_name, status="running")

    try:
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
            process_state["status"] = "error"
            broadcast_log(f"WARNING: {stage_name} exited with code {return_code}", stage=stage_name, status="error")

    except Exception as e:
        process_state["status"] = "error"
        broadcast_log(f"ERROR: Execution failed: {str(e)}", stage=stage_name, status="error")
    finally:
        current_process = None


# -----------------------------------------------------------------------------
# API Endpoints
# -----------------------------------------------------------------------------

@app.get("/api/stats")
async def get_dashboard_stats():
    """Returns high-level metric counts across central archive and daily datasets."""
    stats = {
        "central_master_leads": 0,
        "today_verified_leads": 0,
        "master_pool_total": 0,
        "master_pool_unprocessed": 0,
        "nih_leads_total": 0,
        "today_date": datetime.now().strftime("%Y-%m-%d"),
        "recent_datasets": [],
    }

    # 1. Central master leads
    central_file = DATA_DIR / "central_master_leads.csv"
    if central_file.exists():
        try:
            with open(central_file, "r", encoding="utf-8", errors="replace") as f:
                reader = csv.reader(f)
                header = next(reader, None)
                stats["central_master_leads"] = sum(1 for _ in reader)
        except Exception:
            pass

    # 2. Today's folder leads
    today_str = datetime.now().strftime("%Y-%m-%d")
    today_dir = DATA_DIR / today_str
    if today_dir.exists():
        daily_files = (
            list(today_dir.glob("*found*.csv"))
            + list(today_dir.glob("daily_verified_leads_*.csv"))
            + list(today_dir.glob("*verified*.csv"))
        )
        seen_daily_emails = set()
        for df in daily_files:
            try:
                with open(df, "r", encoding="utf-8", errors="replace") as f:
                    reader = csv.DictReader(f)
                    for r in reader:
                        em = (r.get("professional_email") or r.get("email") or "").strip().lower()
                        if em and em not in seen_daily_emails:
                            seen_daily_emails.add(em)
                            stats["today_verified_leads"] += 1
            except Exception:
                pass

        # NIH specific today
        nih_today = list(today_dir.glob("nih_funded_leads_*.csv"))
        for nf in nih_today:
            try:
                with open(nf, "r", encoding="utf-8", errors="replace") as f:
                    reader = csv.reader(f)
                    next(reader, None)
                    stats["nih_leads_total"] += sum(1 for _ in reader)
            except Exception:
                pass

    # 3. Topic queue or master pool file
    queue_files = list(DATA_DIR.glob("*_needto_extract.csv"))
    pool_file = queue_files[0] if queue_files else (DATA_DIR / "researchers_master_pool.csv")
    if pool_file.exists():
        try:
            with open(pool_file, "r", encoding="utf-8", errors="replace") as f:
                reader = csv.DictReader(f)
                rows = list(reader)
                stats["master_pool_total"] = len(rows)
                stats["master_pool_unprocessed"] = sum(
                    1 for r in rows
                    if r.get("review_status") != "found" and r.get("email_status") != "Verified Name Match"
                )
        except Exception:
            pass

    return stats


@app.get("/api/datasets")
async def list_datasets():
    """Lists all available CSV files in the data directory with live candidate counts."""
    ensure_initial_topic_queue()
    files = []
    all_csvs = sorted(DATA_DIR.rglob("*.csv"), key=lambda p: p.stat().st_mtime, reverse=True)


    # Also check root level CSVs if any
    for root_csv in BASE_DIR.glob("*.csv"):
        all_csvs.append(root_csv)

    for p in all_csvs:
        try:
            stat = p.stat()
            rel_path = str(p.relative_to(BASE_DIR)).replace("\\", "/")

            # Calculate live candidate counts for queues and extractions
            total_rows = 0
            found_count = 0
            is_queue = ("_needto_extract" in p.name) or ("master_pool" in p.name) or p.name.startswith("openalex_") or ("Physical_Chemistry" in p.name and "_found_" not in p.name)
            clean_topic = p.name.replace("_needto_extract.csv", "").replace("_master_pool.csv", "").replace(".csv", "").replace("_", " ")

            if is_queue and stat.st_size < 50 * 1024 * 1024:
                try:
                    with open(p, "r", encoding="utf-8", errors="replace") as qf:
                        reader = csv.DictReader(qf)
                        for r in reader:
                            total_rows += 1
                            if r.get("review_status") == "found" or r.get("email_status") == "Verified Name Match":
                                found_count += 1
                except Exception:
                    pass

            files.append({
                "path": rel_path,
                "name": p.name,
                "topic": clean_topic,
                "size_kb": round(stat.st_size / 1024, 1),
                "modified": datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M"),
                "total": total_rows,
                "found": found_count,
                "needto_extract": max(0, total_rows - found_count) if is_queue else 0,
                "is_queue": is_queue,
            })
        except Exception:
            continue

    return {"datasets": files}



@app.get("/api/leads")
async def get_leads(
    file: Optional[str] = Query(None),
    search: Optional[str] = Query(""),
    status: Optional[str] = Query("all"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=10, le=500),
):
    """Returns paginated, filtered leads from the selected or default CSV file."""
    target_path = None
    if file:
        candidate = (BASE_DIR / file).resolve()
        if candidate.exists() and candidate.is_relative_to(BASE_DIR):
            target_path = candidate

    if not target_path:
        today_str = datetime.now().strftime("%Y-%m-%d")
        today_verified = DATA_DIR / today_str / f"daily_verified_leads_{today_str}.csv"
        central_file = DATA_DIR / "central_master_leads.csv"
        master_pool = DATA_DIR / "researchers_master_pool.csv"
        
        if today_verified.exists():
            target_path = today_verified
        elif central_file.exists():
            target_path = central_file
        elif master_pool.exists():
            target_path = master_pool
        else:
            all_csvs = sorted(DATA_DIR.rglob("*.csv"), key=lambda p: p.stat().st_mtime, reverse=True)
            if all_csvs:
                target_path = all_csvs[0]

    if not target_path or not target_path.exists():
        return {
            "leads": [],
            "total": 0,
            "page": page,
            "page_size": page_size,
            "columns": [],
            "current_file": None,
        }

    leads = []
    columns = []
    search_lower = search.lower().strip() if search else ""

    try:
        with open(target_path, "r", encoding="utf-8-sig", errors="replace") as f:
            reader = csv.DictReader(f)
            columns = list(reader.fieldnames or [])

            for row in reader:
                # 1. Status filter
                if status and status != "all":
                    row_status = (row.get("review_status") or row.get("email_status") or "").lower()
                    if status == "verified" and "verified" not in row_status and "found" not in row_status:
                        continue
                    elif status == "has_email" and not (row.get("professional_email") or row.get("email")):
                        continue

                # 2. Search filter
                if search_lower:
                    combined = " ".join(str(v) for v in row.values()).lower()
                    if search_lower not in combined:
                        continue

                leads.append(row)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read CSV: {e}")

    total_leads = len(leads)
    start_idx = (page - 1) * page_size
    end_idx = start_idx + page_size
    paginated_leads = leads[start_idx:end_idx]

    rel_name = str(target_path.relative_to(BASE_DIR)).replace("\\", "/")

    return {
        "leads": paginated_leads,
        "total": total_leads,
        "page": page,
        "page_size": page_size,
        "columns": columns,
        "current_file": rel_name,
    }


@app.get("/api/leads/export")
async def export_leads_file(file: str = Query(...)):
    """Downloads the selected CSV file directly."""
    target_path = (BASE_DIR / file).resolve()
    if not target_path.exists() or not target_path.is_relative_to(BASE_DIR):
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(
        path=target_path,
        filename=target_path.name,
        media_type="text/csv",
    )


@app.post("/api/pipeline/run")
async def trigger_pipeline(request: Request):
    """Triggers an extraction or enrichment script in a background thread."""
    global current_process
    with process_lock:
        if current_process is not None and current_process.poll() is None:
            raise HTTPException(status_code=400, detail="A pipeline task is already actively running.")

    body = await request.json()
    action = body.get("action", "openalex")
    keyword = body.get("keyword", "Physical Chemistry").strip()
    pages = str(body.get("pages", 25)).strip()
    from_date = body.get("from_date", "2026-01-01").strip()
    to_date = body.get("to_date", "2026-01-31").strip()
    target_leads = str(body.get("target_leads", 500)).strip()
    input_file = body.get("input_file", "").strip()

    py_exe = sys.executable

    if action == "openalex":
        cmd = [py_exe, "-u", "01_extract_researchers.py", keyword, pages, from_date, to_date]
        script_name = "01_extract_researchers.py"
        stage_name = f"OpenAlex Discovery ({keyword} | {from_date} to {to_date})"


    elif action == "scholarly":
        cmd = [py_exe, "-u", "02_collect_scholarly_emails.py"]
        if input_file:
            cmd.append(input_file)
        else:
            cmd.append("")
        cmd.append(target_leads)
        script_name = "02_collect_scholarly_emails.py"
        file_desc = Path(input_file).name if input_file else "Active Master Pool"
        stage_name = f"Scholarly Email Enrichment ({file_desc} | Target: {target_leads})"


    elif action == "nih":
        cmd = [py_exe, "-u", "04_extract_nih_researchers.py", keyword, target_leads]
        script_name = "04_extract_nih_researchers.py"
        stage_name = f"NIH RePORTER PI Grants ({keyword})"

    elif action == "biorxiv":
        cmd = [py_exe, "-u", "Biorxiv_cellbio_collector_1.py"]
        script_name = "Biorxiv_cellbio_collector_1.py"
        stage_name = "bioRxiv CellBio Preprints Extractor"

    else:
        raise HTTPException(status_code=400, detail=f"Unknown action: {action}")

    worker_thread = threading.Thread(
        target=run_pipeline_worker,
        args=(cmd, script_name, stage_name),
        daemon=True,
    )
    worker_thread.start()

    return {"status": "started", "stage": stage_name, "script": script_name}


@app.post("/api/pipeline/stop")
async def stop_pipeline():
    """Stops the currently running subprocess."""
    global current_process
    with process_lock:
        if current_process is not None and current_process.poll() is None:
            try:
                current_process.terminate()
                process_state["status"] = "stopped"
                broadcast_log("Process stopped by user request.", status="stopped")
                return {"status": "stopped"}
            except Exception as e:
                try:
                    current_process.kill()
                except Exception:
                    pass
                return {"status": "killed", "error": str(e)}
    return {"status": "not_running"}


@app.get("/api/pipeline/status")
async def get_pipeline_status():
    """Returns current execution state and buffered logs."""
    return {
        "status": process_state["status"],
        "stage": process_state["current_stage"],
        "script": process_state["script_name"],
        "start_time": process_state["start_time"],
        "exit_code": process_state["exit_code"],
        "recent_logs": process_state["lines"][-100:],
    }


@app.get("/api/pipeline/stream")
async def stream_pipeline_logs():
    """Server-Sent Events endpoint streaming live stdout/stderr lines."""
    async def event_generator():
        for entry in process_state["lines"][-50:]:
            yield f"data: {json.dumps(entry)}\n\n"

        while True:
            try:
                entry = await asyncio.wait_for(log_queue.get(), timeout=2.0)
                yield f"data: {json.dumps(entry)}\n\n"
            except asyncio.TimeoutError:
                heartbeat = {
                    "type": "heartbeat",
                    "status": process_state["status"],
                    "stage": process_state["current_stage"],
                }
                yield f"data: {json.dumps(heartbeat)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# -----------------------------------------------------------------------------
# Static Files & Frontend Mount
# -----------------------------------------------------------------------------
STATIC_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    print("\n" + "=" * 65)
    print("RESEARCHER TOOL WEB DASHBOARD")
    print("Serving at: http://localhost:8000")
    print("=" * 65 + "\n")
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
