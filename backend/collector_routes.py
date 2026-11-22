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
        try:
            run_id = archive.create(key, body.topic.strip(), body.target, body.min_score, body.from_date, body.to_date)
        except UniqueViolation:
            raise HTTPException(409, "A collection is already running in this workspace.")
        tasks.add_task(archive.execute, key, run_id)
        return {"id": run_id}

    @router.post("/runs/{run_id}/stop")
    def stop(run_id: UUID, key: str = Depends(owner)):
        if not archive.stop(key, str(run_id)):
            raise HTTPException(404, "Active collection not found.")
        return {"status": "stopped"}

    @router.get("/runs/{run_id}/results")
    def rows(run_id: UUID, offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=100),
             delivery_status: str | None = None, key: str = Depends(owner)):
        if delivery_status is not None and delivery_status not in STATUSES:
            raise HTTPException(400, "Unknown delivery status.")
        try:
            return archive.results(key, str(run_id), limit, offset, delivery_status)
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
