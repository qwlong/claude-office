"""Tests for deriving project_name from project_root/working_dir when not provided."""

import pytest
from unittest.mock import patch, AsyncMock, MagicMock

from app.core.event_processor import derive_project_name_from_path, EventProcessor
from app.core.project_registry import ProjectRegistry
from app.models.events import Event, EventData, EventType


class TestDeriveProjectNameFromPath:
    def test_derives_from_simple_path(self):
        assert derive_project_name_from_path("/Users/apple/Projects/my-app") == "my-app"

    def test_derives_from_nested_path(self):
        assert (
            derive_project_name_from_path("/Users/apple/Projects/others/random/claude-office")
            == "claude-office"
        )

    def test_derives_from_startups_path(self):
        """This is the exact case from the bug: sessions in startups dir had no project_name."""
        assert (
            derive_project_name_from_path("/Users/apple/Projects/others/startups/startup-x")
            == "startup-x"
        )

    def test_returns_none_for_empty_string(self):
        assert derive_project_name_from_path("") is None

    def test_returns_none_for_none(self):
        assert derive_project_name_from_path(None) is None

    def test_trailing_slash_stripped(self):
        assert derive_project_name_from_path("/Users/apple/Projects/my-app/") == "my-app"

    def test_root_path(self):
        result = derive_project_name_from_path("/")
        # Root path has no meaningful basename
        assert result is None or result == ""


class TestPersistEventDerivesProjectName:
    """When event has working_dir but no project_name, _persist_event should
    derive project_name from the git root or working_dir."""

    @pytest.mark.asyncio
    async def test_persist_derives_project_name_from_working_dir(self):
        """Session created with working_dir but no project_name should get
        project_name derived from the directory."""
        from datetime import datetime, UTC

        processor = EventProcessor()
        processor.project_registry = ProjectRegistry()
        processor.sessions = {}

        event = Event(
            event_type=EventType.SESSION_START,
            session_id="test-sess-1",
            timestamp=datetime.now(UTC),
            data=EventData(
                project_name=None,
                project_dir="/Users/apple/Projects/others/startups/startup-x",
                working_dir="/Users/apple/Projects/others/startups/startup-x",
            ),
        )

        # Mock DB operations and derive_git_root
        mock_session_record = MagicMock()
        mock_session_record.project_name = None
        mock_session_record.project_root = None

        with (
            patch("app.core.event_processor.AsyncSessionLocal") as mock_db_cls,
            patch(
                "app.core.event_processor.derive_git_root",
                return_value="/Users/apple/Projects/others/startups/startup-x",
            ),
        ):
            mock_db = AsyncMock()
            mock_db_cls.return_value.__aenter__ = AsyncMock(return_value=mock_db)
            mock_db_cls.return_value.__aexit__ = AsyncMock(return_value=False)

            # First query: select SessionRecord -> None (new session)
            mock_result = MagicMock()
            mock_result.scalar_one_or_none.return_value = None
            mock_db.execute.return_value = mock_result

            # merge returns a new record
            merged_rec = MagicMock()
            merged_rec.project_name = None
            merged_rec.project_root = None
            mock_db.merge.return_value = merged_rec

            await processor._persist_event(event)

            # The session record should have project_name set from the path
            assert merged_rec.project_name == "startup-x"


class TestProjectSessionCountIncludesDB:
    """Project session_count should include DB sessions, not just in-memory ones."""

    @pytest.mark.asyncio
    async def test_session_count_includes_db_sessions(self):
        """When DB has more sessions for a project than in-memory, the count
        should reflect the DB total."""
        from app.core.event_processor import event_processor
        from app.core.project_registry import ProjectRegistry
        from app.core.state_machine import StateMachine

        # Clean state
        event_processor.sessions.clear()
        event_processor._db_sessions_restored = True
        event_processor.project_registry = ProjectRegistry()

        # One in-memory session
        sm = StateMachine()
        event_processor.sessions["s1"] = sm
        event_processor.project_registry.register_session_sync("s1", "my-proj", "/path/my-proj")

        # Also register a DB-only session (not in self.sessions)
        event_processor.project_registry.register_session_sync("s2", "my-proj", "/path/my-proj")

        result = await event_processor.get_project_grouped_state()
        assert result is not None
        # session_count should be 2 (from registry), not 1 (from in-memory only)
        proj = result.projects[0]
        assert proj.key == "my-proj"
        assert proj.session_count == 2

        # Cleanup
        event_processor.sessions.clear()
        event_processor.project_registry = ProjectRegistry()
