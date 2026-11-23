import logging
import os
import time
from datetime import date
from threading import Lock, Thread
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, Response
from typing import Literal

from pydantic import BaseModel, Field
from psycopg2.errors import UniqueViolation
import collector_archive as archive
import collector_saved as saved
from email_check import STATUSES
from public_site import FormRateLimit


class CollectionRequest(BaseModel):
    topic: str = Field(min_length=1, max_length=200)
    target: int = Field(default=100, ge=1, le=50000)
    min_score: int = Field(default=50, ge=0, le=100)
    from_date: date
    to_date: date
    country: str = Field(default="", pattern=r"^([A-Za-z]{2})?$")  # ISO 3166-1 alpha-2, e.g. US
    institution: str = Field(default="", max_length=120)
    kind: Literal["publications", "nih"] = "publications"


class SaveSearchRequest(CollectionRequest):
    name: str = Field(default="", max_length=200)
    frequency: Literal["off", "daily", "weekly"] = "off"


class UpdateSearchRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    frequency: Literal["off", "daily", "weekly"] | None = None


log = logging.getLogger(__name__)


class RenameRequest(BaseModel):
    topic: str = Field(min_length=1, max_length=200)


class CheckRequest(BaseModel):
    after: str = Field(default="", max_length=320)


def collector_owner_key(user):
    """The archive a signed-in user collects into: their workspace (owner email) or root's. Members have none."""
    if user.get("is_member"):
        raise HTTPException(403, "Collector access requires a workspace owner.")
    email = (user.get("client_email") or "").strip().lower()
    if user.get("is_admin"):
        return "admin:" + (email or "root")
    if not email:
        raise HTTPException(403, "Workspace identity unavailable.")
    return "owner:" + email


def collector_router(require_user, licenses):
    router = APIRouter(prefix="/api/collector")
    batch_limit = FormRateLimit(limit=60, seconds=60)
    limit_lock = Lock()

    def owner(request: Request):
        return collector_owner_key(require_user(request))

    @router.post("/contacts/check")
    def check_contacts(body: CheckRequest = CheckRequest(), key: str = Depends(owner)):
        with limit_lock:
            if not batch_limit.allow(key):
                raise HTTPException(429, "Email check limit reached. Try again in a minute.", headers={"Retry-After": "60"})
        return archive.recheck_contacts(key, body.after)

    def daily_limit(request: Request):
        """The license's contacts-per-day limit, or None when unlimited (root, Pro)."""
        user = require_user(request)
        if user.get("is_admin"):
            return None
        limit = licenses.validate_license(user.get("license_key") or "").get("daily_limit")
        return limit if isinstance(limit, int) and limit >= 0 else None

    @router.get("/stats")
    def stats(request: Request, key: str = Depends(owner)):
        counts = archive.stats(key)
        limit = daily_limit(request)
        return {**counts, "daily_limit": limit, "remaining_today": None if limit is None else max(0, limit - counts["today"])}

    @router.get("/contacts")
    def contacts(offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=251), delivery_status: str | None = None,
                 q: str = Query("", max_length=200), sort: str = "name", order: str = "asc", key: str = Depends(owner)):
        """All contacts in the workspace's central archive (deduplicated across collections)."""
        if delivery_status is not None and delivery_status not in STATUSES:
            raise HTTPException(400, "Unknown delivery status.")
        if sort not in archive.ALL_SORTS or order not in ("asc", "desc"):
            raise HTTPException(400, "Unknown sort.")
        return archive.all_contacts(key, limit, offset, delivery_status, q, sort, order)

    @router.get("/contacts/export")
    def contacts_export(key: str = Depends(owner)):
        return Response(archive.all_contacts_csv(key), media_type="text/csv",
                        headers={"Content-Disposition": 'attachment; filename="all-contacts.csv"', "Cache-Control": "private, no-store"})

    @router.get("/runs")
    def runs(key: str = Depends(owner)):
        return archive.history(key)

    def license_limit(license_key, is_admin=False):
        """(valid, contacts-per-day limit or None for unlimited) for a license."""
        if is_admin:
            return True, None
        info = licenses.validate_license(license_key or "")
        limit = info.get("daily_limit")
        return bool(info.get("valid")), (limit if isinstance(limit, int) and limit >= 0 else None)

    def begin(key, license_key, is_admin, *, topic, target, min_score, from_date, to_date, country, institution, kind, clamp=False):
        """Starts a collection after the license and daily-limit checks. clamp=True (scheduled runs) lowers the target to
        what is left today instead of refusing. Returns the run id; raises HTTPException with a user-facing message."""
        valid, limit = license_limit(license_key, is_admin)
        if not valid:
            raise HTTPException(403, "An active license is required.")
        if not topic.strip() or from_date > to_date:
            raise HTTPException(400, "Enter a topic and a valid date range.")
        if limit is not None:
            remaining = max(0, limit - archive.stats(key)["today"])
            if remaining == 0:
                raise HTTPException(429, f"You've reached today's limit of {limit} contacts. It resets at midnight (UTC); upgrade your plan for unlimited collection.")
            if target > remaining:
                if not clamp:
                    raise HTTPException(400, f"You can collect {remaining} more contacts today (your limit is {limit} a day).")
                target = remaining
        try:
            return archive.create(key, topic.strip(), target, min_score, from_date, to_date, country.upper(), institution.strip(), kind)
        except UniqueViolation:
            raise HTTPException(409, "A collection is already running in this workspace.")

    @router.post("/runs", status_code=202)
    def start(body: CollectionRequest, tasks: BackgroundTasks, request: Request, key: str = Depends(owner)):
        user = require_user(request)
        run_id = begin(key, user.get("license_key") or "", bool(user.get("is_admin")), topic=body.topic, target=body.target,
                       min_score=body.min_score, from_date=body.from_date, to_date=body.to_date, country=body.country,
                       institution=body.institution, kind=body.kind)
        tasks.add_task(run_and_record, key, run_id, user.get("license_key") or "")
        return {"id": run_id}

    def run_and_record(key, run_id, license_key):
        """Runs the collection, then counts it on the license (the dashboards show "extracted today")."""
        archive.execute(key, run_id)
        collected = next((r["collected"] for r in archive.history(key) if str(r["id"]) == str(run_id)), 0)
        if license_key and collected:
            licenses.record_usage(license_key, int(collected))

    @router.delete("/runs/{run_id}", status_code=204)
    def delete_run(run_id: UUID, key: str = Depends(owner)):
        try:
            archive.delete_run(key, str(run_id))
        except KeyError:
            raise HTTPException(404, "Collection not found.")
        except ValueError as exc:
            raise HTTPException(409, str(exc))
        return Response(status_code=204)

    @router.patch("/runs/{run_id}")
    def rename_run(run_id: UUID, body: RenameRequest, key: str = Depends(owner)):
        if not body.topic.strip():
            raise HTTPException(400, "Enter a name.")
        try:
            archive.rename_run(key, str(run_id), body.topic.strip())
        except KeyError:
            raise HTTPException(404, "Collection not found.")
        return {"status": "ok"}

    @router.post("/runs/{run_id}/stop")
    def stop(run_id: UUID, key: str = Depends(owner)):
        if not archive.stop(key, str(run_id)):
            raise HTTPException(404, "Active collection not found.")
        return {"status": "stopped"}

    @router.get("/runs/{run_id}/results")
    def rows(run_id: UUID, offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=251),
             delivery_status: str | None = None, q: str = Query("", max_length=200),
             sort: str = "email", order: str = "asc", key: str = Depends(owner)):
        if delivery_status is not None and delivery_status not in STATUSES:
            raise HTTPException(400, "Unknown delivery status.")
        if sort not in archive.SORTS or order not in ("asc", "desc"):
            raise HTTPException(400, "Unknown sort.")
        try:
            return archive.results(key, str(run_id), limit, offset, delivery_status, q, sort, order)
        except KeyError:
            raise HTTPException(404, "Collection not found.")

    @router.get("/runs/{run_id}/export")
    def export(run_id: UUID, key: str = Depends(owner)):
        try:
            data = archive.csv_export(key, str(run_id))
        except KeyError:
            raise HTTPException(404, "Collection not found.")
        return Response(data, media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="collection-{run_id}.csv"', "Cache-Control":"private, no-store"})

    # ---------- Saved searches and schedules ----------
    @router.get("/searches")
    def searches(key: str = Depends(owner)):
        return saved.list_searches(key)

    @router.post("/searches", status_code=201)
    def save_search(body: SaveSearchRequest, request: Request, key: str = Depends(owner)):
        if not body.topic.strip() or body.from_date > body.to_date:
            raise HTTPException(400, "Enter a topic and a valid date range.")
        user = require_user(request)
        search_id = saved.save(key, name=(body.name.strip() or body.topic.strip())[:200], kind=body.kind, topic=body.topic.strip(),
                               target=body.target, min_score=body.min_score, window_days=(body.to_date - body.from_date).days,
                               country=body.country.upper(), institution=body.institution.strip(), frequency=body.frequency,
                               license_key=user.get("license_key") or "")
        return {"id": search_id}

    @router.patch("/searches/{search_id}")
    def update_search(search_id: UUID, body: UpdateSearchRequest, request: Request, key: str = Depends(owner)):
        user = require_user(request)
        try:
            # Turning a schedule on runs it under the license of whoever did it, so a renewed license is picked up.
            saved.update(key, str(search_id), name=body.name.strip() if body.name else None, frequency=body.frequency,
                         license_key=(user.get("license_key") or "") if body.frequency else None)
        except KeyError:
            raise HTTPException(404, "Saved search not found.")
        return {"status": "ok"}

    @router.delete("/searches/{search_id}", status_code=204)
    def delete_search(search_id: UUID, key: str = Depends(owner)):
        try:
            saved.delete(key, str(search_id))
        except KeyError:
            raise HTTPException(404, "Saved search not found.")
        return Response(status_code=204)

    @router.post("/searches/{search_id}/run", status_code=202)
    def run_search(search_id: UUID, tasks: BackgroundTasks, request: Request, key: str = Depends(owner)):
        try:
            item = saved.get(key, str(search_id))
        except KeyError:
            raise HTTPException(404, "Saved search not found.")
        user = require_user(request)
        start_day, end_day = saved.run_window(item["window_days"])
        run_id = begin(key, user.get("license_key") or "", bool(user.get("is_admin")), topic=item["topic"], target=item["target"],
                       min_score=item["min_score"], from_date=start_day, to_date=end_day, country=item["country"],
                       institution=item["institution"], kind=item["kind"])
        saved.record(key, str(search_id), run_id)
        tasks.add_task(run_and_record, key, run_id, user.get("license_key") or "")
        return {"id": run_id}

    def run_due_searches():
        """One scheduler pass: start each due saved search in turn (one collection at a time per workspace)."""
        for item in saved.claim_due():
            key, sid = item["owner_key"], str(item["id"])
            start_day, end_day = saved.run_window(item["window_days"])
            try:
                run_id = begin(key, item["license_key"], key.startswith("admin:"), topic=item["topic"], target=item["target"],
                               min_score=item["min_score"], from_date=start_day, to_date=end_day, country=item["country"],
                               institution=item["institution"], kind=item["kind"], clamp=True)
            except HTTPException as exc:
                if exc.status_code == 409:
                    saved.retry_soon(key, sid)
                saved.record(key, sid, error=str(exc.detail))
                continue
            saved.record(key, sid, run_id)
            run_and_record(key, run_id, item["license_key"])

    def scheduler_loop():
        while True:
            try:
                run_due_searches()
            except Exception:
                log.exception("Collector scheduler pass failed")
            time.sleep(60)

    # Off unless asked for: local development shares the production database, so only the server sets
    # SCIPROSPECT_SCHEDULER=on (one uvicorn worker). claim_due() is atomic, so a second process would not double-run.
    if os.environ.get("SCIPROSPECT_SCHEDULER", "").lower() == "on":
        Thread(target=scheduler_loop, name="collector-scheduler", daemon=True).start()
    router.run_due_searches = run_due_searches  # used by tests
    return router
