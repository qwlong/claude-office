"""Project registry: groups sessions by project with DB persistence and in-memory cache."""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

PROJECT_COLORS = [
    "#3B82F6",  # Blue
    "#22C55E",  # Green
    "#A855F7",  # Purple
    "#F97316",  # Orange
    "#EC4899",  # Pink
    "#06B6D4",  # Cyan
    "#EAB308",  # Yellow
    "#EF4444",  # Red
]


def normalize_project_key(name: str) -> str:
    """Normalize a project name to a URL-safe key."""
    key = name.lower().strip()
    key = re.sub(r"[^a-z0-9\-]", "-", key)
    key = re.sub(r"-+", "-", key).strip("-")
    return key or "unknown"


@dataclass
class ProjectState:
    """In-memory state for a single project."""

    id: str
    key: str
    name: str
    root: str | None
    color: str
    session_ids: list[str] = field(default_factory=list)


class ProjectRegistry:
    """Maps sessions to projects with DB persistence and in-memory cache."""

    def __init__(self) -> None:
        self._projects: dict[str, ProjectState] = {}  # key -> ProjectState
        self._session_to_project: dict[str, str] = {}  # session_id -> project key
        self._color_index: int = 0

    async def load_from_db(self, db: AsyncSession) -> None:
        """Load all projects and session mappings from DB into memory cache."""
        from app.db.models import ProjectRecord, SessionRecord

        # Load projects
        result = await db.execute(select(ProjectRecord))
        for rec in result.scalars().all():
            self._projects[rec.key] = ProjectState(
                id=rec.id,
                key=rec.key,
                name=rec.name,
                root=rec.path,
                color=rec.color,
                session_ids=[],
            )

        self._color_index = len(self._projects)

        # Load session-to-project mappings
        result = await db.execute(
            select(SessionRecord.id, ProjectRecord.key)
            .join(ProjectRecord, SessionRecord.project_id == ProjectRecord.id)
            .where(SessionRecord.project_id.isnot(None))
        )
        for session_id, project_key in result.all():
            self._session_to_project[session_id] = project_key
            if project_key in self._projects:
                self._projects[project_key].session_ids.append(session_id)

        logger.info(
            f"Loaded {len(self._projects)} projects, "
            f"{len(self._session_to_project)} session mappings from DB"
        )

    async def register_session(
        self, db: AsyncSession, session_id: str, project_name: str, project_root: str | None
    ) -> ProjectState:
        """Register a session under a project. Creates project in DB if new."""
        from app.db.models import ProjectRecord, SessionRecord

        key = normalize_project_key(project_name)

        if key not in self._projects:
            color = PROJECT_COLORS[self._color_index % len(PROJECT_COLORS)]
            self._color_index += 1
            record = ProjectRecord(
                key=key, name=project_name, color=color, path=project_root
            )
            db.add(record)
            await db.flush()
            self._projects[key] = ProjectState(
                id=record.id,
                key=key,
                name=project_name,
                root=project_root,
                color=color,
                session_ids=[],
            )
            logger.info(f"New project created in DB: {key} (color={color})")

        project = self._projects[key]
        if session_id not in project.session_ids:
            project.session_ids.append(session_id)
        self._session_to_project[session_id] = key

        # Update session record's project_id
        result = await db.execute(
            select(SessionRecord).where(SessionRecord.id == session_id)
        )
        session_rec = result.scalar_one_or_none()
        if session_rec and session_rec.project_id != project.id:
            session_rec.project_id = project.id
        await db.commit()

        return project

    def register_session_sync(
        self, session_id: str, project_name: str, project_root: str | None
    ) -> ProjectState:
        """Register a session in memory only (no DB). For use during state building."""
        key = normalize_project_key(project_name)

        if key not in self._projects:
            color = PROJECT_COLORS[self._color_index % len(PROJECT_COLORS)]
            self._color_index += 1
            import uuid
            self._projects[key] = ProjectState(
                id=str(uuid.uuid4()),
                key=key,
                name=project_name,
                root=project_root,
                color=color,
                session_ids=[],
            )
            logger.info(f"New project registered (memory): {key} (color={color})")

        project = self._projects[key]
        if session_id not in project.session_ids:
            project.session_ids.append(session_id)
        self._session_to_project[session_id] = key
        return project

    def unregister_session(self, session_id: str) -> None:
        """Remove a session mapping from cache. Project itself persists."""
        key = self._session_to_project.pop(session_id, None)
        if key and key in self._projects:
            project = self._projects[key]
            if session_id in project.session_ids:
                project.session_ids.remove(session_id)
            # Project stays in cache even with 0 sessions (DB-backed)

    def get_project_for_session(self, session_id: str) -> ProjectState | None:
        """Get the project a session belongs to (from cache)."""
        key = self._session_to_project.get(session_id)
        return self._projects.get(key) if key else None

    def get_all_projects(self) -> list[ProjectState]:
        """Get all projects (from cache)."""
        return list(self._projects.values())

    def get_project(self, key: str) -> ProjectState | None:
        """Get a specific project by key (from cache)."""
        return self._projects.get(key)

    def update_cache(self, key: str, **fields: object) -> None:
        """Update in-memory cache after a DB edit."""
        project = self._projects.get(key)
        if project:
            for field_name, value in fields.items():
                if hasattr(project, field_name):
                    setattr(project, field_name, value)

    def remove_project(self, key: str) -> None:
        """Remove a project from in-memory cache."""
        project = self._projects.pop(key, None)
        if project:
            for sid in project.session_ids:
                self._session_to_project.pop(sid, None)
