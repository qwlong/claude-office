"""REST API endpoints for multi-project management."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.event_processor import event_processor
from app.db.database import get_db
from app.db.models import ProjectRecord

router = APIRouter(prefix="/projects", tags=["projects"])


class ProjectUpdate(BaseModel):
    """Fields that can be updated on a project."""

    name: str | None = None
    color: str | None = None
    label: str | None = None
    icon: str | None = None
    description: str | None = None
    sequence: int | None = None


def _project_to_dict(p: ProjectRecord, session_count: int = 0) -> dict:
    return {
        "id": p.id,
        "key": p.key,
        "name": p.name,
        "color": p.color,
        "label": p.label,
        "icon": p.icon,
        "description": p.description,
        "path": p.path,
        "sequence": p.sequence,
        "session_count": session_count,
    }


@router.get("")
async def list_projects():
    """List all projects with session counts (from in-memory cache)."""
    projects = event_processor.project_registry.get_all_projects()
    return [
        {
            "id": p.id,
            "key": p.key,
            "name": p.name,
            "color": p.color,
            "root": p.root,
            "session_count": len(p.session_ids),
        }
        for p in projects
    ]


@router.get("/{key}")
async def get_project(key: str):
    """Get a single project's details."""
    project = event_processor.project_registry.get_project(key)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return {
        "id": project.id,
        "key": project.key,
        "name": project.name,
        "color": project.color,
        "root": project.root,
        "session_ids": project.session_ids,
        "session_count": len(project.session_ids),
    }


@router.get("/{key}/sessions")
async def get_project_sessions(key: str):
    """Get all sessions for a project."""
    project = event_processor.project_registry.get_project(key)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"project_key": key, "session_ids": project.session_ids}


@router.patch("/{key}")
async def update_project(
    key: str,
    update: ProjectUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Update a project's editable fields."""
    result = await db.execute(
        select(ProjectRecord).where(ProjectRecord.key == key)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    updates = update.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(project, field, value)
    await db.commit()
    await db.refresh(project)

    # Sync in-memory cache
    event_processor.project_registry.update_cache(key, **updates)

    registry_project = event_processor.project_registry.get_project(key)
    return _project_to_dict(
        project,
        session_count=len(registry_project.session_ids) if registry_project else 0,
    )


@router.delete("/{key}")
async def delete_project(key: str, db: Annotated[AsyncSession, Depends(get_db)]):
    """Delete a project and cascade-delete all its sessions and events."""
    result = await db.execute(
        select(ProjectRecord).where(ProjectRecord.key == key)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Remove from in-memory state first
    registry_project = event_processor.project_registry.get_project(key)
    if registry_project:
        # Remove sessions from event_processor.sessions
        for sid in list(registry_project.session_ids):
            event_processor.sessions.pop(sid, None)
    event_processor.project_registry.remove_project(key)

    # Cascade delete from DB
    await db.delete(project)
    await db.commit()

    return {"status": "success", "message": f"Project '{key}' deleted with all sessions"}
