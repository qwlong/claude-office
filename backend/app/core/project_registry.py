"""Project registry: groups sessions by project with color assignment."""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field

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

    key: str
    name: str
    root: str | None
    color: str
    session_ids: list[str] = field(default_factory=list)


class ProjectRegistry:
    """Maps sessions to projects with automatic color assignment."""

    def __init__(self) -> None:
        self._projects: dict[str, ProjectState] = {}  # key -> ProjectState
        self._session_to_project: dict[str, str] = {}  # session_id -> project key
        self._color_index: int = 0

    def register_session(
        self, session_id: str, project_name: str, project_root: str | None
    ) -> ProjectState:
        """Register a session under a project. Creates the project if new."""
        key = normalize_project_key(project_name)

        if key not in self._projects:
            color = PROJECT_COLORS[self._color_index % len(PROJECT_COLORS)]
            self._color_index += 1
            self._projects[key] = ProjectState(
                key=key, name=project_name, root=project_root, color=color
            )
            logger.info(f"New project registered: {key} (color={color})")

        project = self._projects[key]
        if session_id not in project.session_ids:
            project.session_ids.append(session_id)
        self._session_to_project[session_id] = key
        return project

    def unregister_session(self, session_id: str) -> None:
        """Remove a session. If it was the last session, remove the project."""
        key = self._session_to_project.pop(session_id, None)
        if key and key in self._projects:
            project = self._projects[key]
            if session_id in project.session_ids:
                project.session_ids.remove(session_id)
            if not project.session_ids:
                del self._projects[key]
                logger.info(f"Project removed (no sessions left): {key}")

    def get_project_for_session(self, session_id: str) -> ProjectState | None:
        """Get the project a session belongs to."""
        key = self._session_to_project.get(session_id)
        return self._projects.get(key) if key else None

    def get_all_projects(self) -> list[ProjectState]:
        """Get all active projects."""
        return list(self._projects.values())

    def get_project(self, key: str) -> ProjectState | None:
        """Get a specific project by key."""
        return self._projects.get(key)
