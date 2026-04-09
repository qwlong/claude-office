from app.core.project_registry import ProjectRegistry, PROJECT_COLORS, normalize_project_key


def test_reregister_same_session_is_idempotent():
    """Registering the same session twice should not duplicate it."""
    registry = ProjectRegistry()
    registry.register_session_sync("s1", "proj", "/path")
    registry.register_session_sync("s1", "proj", "/path")
    project = registry.get_project_for_session("s1")
    assert project is not None
    assert project.session_ids.count("s1") == 1


def test_color_wraps_after_palette_exhausted():
    """After 8 projects, colors should cycle back to the beginning."""
    registry = ProjectRegistry()
    for i in range(10):
        registry.register_session_sync(f"s{i}", f"proj-{i}", f"/path/{i}")
    projects = registry.get_all_projects()
    assert projects[0].color == projects[8].color
    assert projects[1].color == projects[9].color


def test_register_with_empty_project_name_uses_unknown():
    """If project_name is empty, key should normalize to 'unknown'."""
    registry = ProjectRegistry()
    registry.register_session_sync("s1", "", "/path")
    project = registry.get_project_for_session("s1")
    assert project is not None
    assert project.key == "unknown"


def test_unregister_nonexistent_session_is_noop():
    """Unregistering a session that was never registered should not raise."""
    registry = ProjectRegistry()
    registry.unregister_session("nonexistent")  # Should not raise


def test_get_project_for_unknown_session_returns_none():
    registry = ProjectRegistry()
    assert registry.get_project_for_session("nope") is None


def test_get_project_returns_none_for_unknown_key():
    registry = ProjectRegistry()
    assert registry.get_project("nope") is None


def test_normalize_project_key_special_chars():
    assert normalize_project_key("My App (v2)") == "my-app-v2"
    assert normalize_project_key("  spaces  ") == "spaces"
    assert normalize_project_key("UPPER-case") == "upper-case"
    assert normalize_project_key("---") == "unknown"
    assert normalize_project_key("a--b--c") == "a-b-c"


def test_multiple_projects_then_remove_one():
    """Removing a session keeps both projects (DB-backed persistence)."""
    registry = ProjectRegistry()
    registry.register_session_sync("s1", "proj-a", "/a")
    registry.register_session_sync("s2", "proj-b", "/b")
    registry.unregister_session("s1")
    # proj-a still exists (persisted), just has no sessions
    assert registry.get_project("proj-a") is not None
    assert registry.get_project("proj-a").session_ids == []
    assert registry.get_project("proj-b") is not None
    assert len(registry.get_all_projects()) == 2
