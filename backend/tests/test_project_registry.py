import pytest

from app.core.project_registry import ProjectRegistry

PROJECT_COLORS = [
    "#3B82F6",
    "#22C55E",
    "#A855F7",
    "#F97316",
    "#EC4899",
    "#06B6D4",
    "#EAB308",
    "#EF4444",
]


def test_register_session_creates_project():
    registry = ProjectRegistry()
    registry.register_session_sync("sess-1", "my-project", "/home/user/my-project")
    project = registry.get_project_for_session("sess-1")
    assert project is not None
    assert project.name == "my-project"
    assert project.key == "my-project"
    assert project.root == "/home/user/my-project"
    assert "sess-1" in project.session_ids
    assert project.color == PROJECT_COLORS[0]


def test_register_multiple_sessions_same_project():
    registry = ProjectRegistry()
    registry.register_session_sync("sess-1", "proj-a", "/path/a")
    registry.register_session_sync("sess-2", "proj-a", "/path/a")
    projects = registry.get_all_projects()
    assert len(projects) == 1
    assert len(projects[0].session_ids) == 2


def test_register_different_projects_get_different_colors():
    registry = ProjectRegistry()
    registry.register_session_sync("s1", "proj-a", "/a")
    registry.register_session_sync("s2", "proj-b", "/b")
    registry.register_session_sync("s3", "proj-c", "/c")
    projects = registry.get_all_projects()
    colors = [p.color for p in projects]
    assert len(set(colors)) == 3


def test_unregister_session():
    registry = ProjectRegistry()
    registry.register_session_sync("s1", "proj-a", "/a")
    registry.register_session_sync("s2", "proj-a", "/a")
    registry.unregister_session("s1")
    project = registry.get_project_for_session("s2")
    assert project is not None
    assert "s1" not in project.session_ids


def test_unregister_last_session_keeps_project():
    """Projects persist even when all sessions are removed (DB-backed)."""
    registry = ProjectRegistry()
    registry.register_session_sync("s1", "proj-a", "/a")
    registry.unregister_session("s1")
    # Project still exists (persisted), just has no sessions
    projects = registry.get_all_projects()
    assert len(projects) == 1
    assert projects[0].session_ids == []


def test_normalize_project_key():
    registry = ProjectRegistry()
    registry.register_session_sync("s1", "My Project!", "/a")
    project = registry.get_project_for_session("s1")
    assert project is not None
    assert project.key == "my-project"
