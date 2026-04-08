"""API routes for task orchestration."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.task_service import get_task_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/tasks", tags=["tasks"])


class SpawnRequest(BaseModel):
    project_id: str
    issue: str


@router.get("/status")
async def get_status() -> dict:
    """Get orchestration connection status."""
    svc = get_task_service()
    return {
        "connected": svc.connected,
        "adapterType": svc.adapter.adapter_type if svc.adapter else None,
        "taskCount": len(svc.tasks),
    }


@router.get("")
async def get_tasks(project_key: str | None = None) -> list[dict]:
    """List all tasks, optionally filtered by project."""
    svc = get_task_service()
    tasks = svc.get_tasks(project_key=project_key)
    return [t.model_dump(by_alias=True, mode="json") for t in tasks]


@router.post("/spawn")
async def spawn_task(req: SpawnRequest) -> dict:
    """Spawn a new task via the orchestration adapter."""
    svc = get_task_service()
    try:
        task = await svc.spawn(req.project_id, req.issue)
        return task.model_dump(by_alias=True, mode="json")
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/projects")
async def get_projects() -> list[dict]:
    """Get projects configured in the external orchestration system."""
    svc = get_task_service()
    if not svc.adapter or not svc.connected:
        return []
    try:
        return await svc.adapter.get_projects()
    except Exception as e:
        logger.warning(f"Failed to fetch AO projects: {e}")
        return []
