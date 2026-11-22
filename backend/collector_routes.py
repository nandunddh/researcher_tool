from datetime import date
from threading import Lock
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field
from psycopg2.errors import UniqueViolation
import collector_archive as archive
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


class RenameRequest(BaseModel):
    topic: str = Field(min_length=1, max_length=200)


class CheckRequest(BaseModel):
    after: str = Field(default="", max_length=320)


def collector_router(require_user, licenses):
    router = APIRouter(prefix="/api/collector")
    batch_limit = FormRateLimit(limit=60, seconds=60)
    limit_lock = Lock()

    def owner(request: Request):
        user = require_user(request)
        if user.get("is_member"):
            raise HTTPException(403, "Collector access requires a workspace owner.")
        email = (user.get("client_email") or "").strip().lower()
        if user.get("is_admin"):
            return "admin:" + (email or "root")
        if not email:
            raise HTTPException(403, "Workspace identity unavailable.")
        return "owner:" + email

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

    @router.post("/runs", status_code=202)
    def start(body: CollectionRequest, tasks: BackgroundTasks, request: Request, key: str = Depends(owner)):
        user = require_user(request)
        license_info = licenses.validate_license(user.get("license_key") or "")
        if not license_info.get("valid"):
            raise HTTPException(403, "An active license is required.")
        if not body.topic.strip() or body.from_date > body.to_date:
            raise HTTPException(400, "Enter a topic and a valid date range.")
        limit = daily_limit(request)
        if limit is not None:
            remaining = max(0, limit - archive.stats(key)["today"])
            if remaining == 0:
                raise HTTPException(429, f"You've reached today's limit of {limit} contacts. It resets at midnight (UTC); upgrade your plan for unlimited collection.")
            if body.target > remaining:
                raise HTTPException(400, f"You can collect {remaining} more contacts today (your limit is {limit} a day).")
        try:
            run_id = archive.create(key, body.topic.strip(), body.target, body.min_score, body.from_date, body.to_date,
                                    body.country.upper(), body.institution.strip())
        except UniqueViolation:
            raise HTTPException(409, "A collection is already running in this workspace.")
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

    return router
