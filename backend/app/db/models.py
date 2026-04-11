from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class ProjectRecord(Base):
    """Database model for projects."""

    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    key: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    color: Mapped[str] = mapped_column(String, nullable=False)
    label: Mapped[str | None] = mapped_column(String, nullable=True, default=None)
    icon: Mapped[str | None] = mapped_column(String, nullable=True, default=None)
    description: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    path: Mapped[str | None] = mapped_column(String, nullable=True, default=None)
    sequence: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    sessions: Mapped[list[SessionRecord]] = relationship(
        "SessionRecord", back_populates="project", cascade="all, delete-orphan"
    )


class SessionRecord(Base):
    """Database model for Claude Code sessions."""

    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    project_name: Mapped[str | None] = mapped_column(String, nullable=True)
    project_root: Mapped[str | None] = mapped_column(String, nullable=True)
    project_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=True, default=None
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )
    status: Mapped[str] = mapped_column(String, default="active")
    label: Mapped[str | None] = mapped_column(String, nullable=True, default=None)

    project: Mapped[ProjectRecord | None] = relationship("ProjectRecord", back_populates="sessions")
    events: Mapped[list[EventRecord]] = relationship(
        "EventRecord", back_populates="session", cascade="all, delete-orphan"
    )
    agents_list: Mapped[list[AgentRecord]] = relationship(
        "AgentRecord", back_populates="session", cascade="all, delete-orphan"
    )


class AgentRecord(Base):
    """Database model for agents within a session."""

    __tablename__ = "agents"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id: Mapped[str] = mapped_column(
        String, ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False
    )
    project_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=True
    )
    external_id: Mapped[str] = mapped_column(String, nullable=False)
    agent_type: Mapped[str] = mapped_column(String, nullable=False)  # "main" / "subagent"
    name: Mapped[str | None] = mapped_column(String, nullable=True)
    state: Mapped[str | None] = mapped_column(String, nullable=True)
    assignment: Mapped[str | None] = mapped_column(String, nullable=True)
    desk: Mapped[int | None] = mapped_column(nullable=True)
    color: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    session: Mapped[SessionRecord] = relationship("SessionRecord", back_populates="agents_list")


class EventRecord(Base):
    """Database model for events within a session."""

    __tablename__ = "events"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(String, ForeignKey("sessions.id"))
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    event_type: Mapped[str] = mapped_column(String)
    data: Mapped[dict[str, Any]] = mapped_column(JSON)

    session: Mapped[SessionRecord] = relationship("SessionRecord", back_populates="events")


class TaskRecord(Base):
    """Database model for tasks within a session.

    Stores tasks from both the TodoWrite tool and the new task file system.
    Tasks are persisted to survive file system cleanup by Claude Code.
    """

    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(String, ForeignKey("sessions.id"), index=True)
    task_id: Mapped[str] = mapped_column(String)  # Original task ID (e.g., "1", "2")
    content: Mapped[str] = mapped_column(String)  # Subject/content of the task
    status: Mapped[str] = mapped_column(String)  # pending, in_progress, completed
    active_form: Mapped[str | None] = mapped_column(String, nullable=True)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    blocks: Mapped[str | None] = mapped_column(String, nullable=True)  # JSON-serialized list
    blocked_by: Mapped[str | None] = mapped_column(String, nullable=True)  # JSON-serialized list
    owner: Mapped[str | None] = mapped_column(String, nullable=True)
    metadata_json: Mapped[str | None] = mapped_column(String, nullable=True)  # JSON-serialized dict
    sort_order: Mapped[int] = mapped_column(default=0)  # For ordering tasks
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )


class AgentSeatPreference(Base):
    """Persists agent desk/color assignments across reconnects."""

    __tablename__ = "agent_seat_preferences"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(String, index=True)
    agent_id: Mapped[str] = mapped_column(String, index=True)
    desk: Mapped[int] = mapped_column()
    color: Mapped[str] = mapped_column(String)
    room_key: Mapped[str] = mapped_column(String)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )


class UserPreference(Base):
    """Database model for user preferences.

    Stores key-value pairs for user preferences. Uses a flexible design
    to support adding new preferences without schema changes.
    """

    __tablename__ = "user_preferences"

    key: Mapped[str] = mapped_column(String, primary_key=True)
    value: Mapped[str] = mapped_column(String)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )


class StateSnapshot(Base):
    """Point-in-time serialized StateMachine state for fast cold-start recovery.

    One row per session (upserted). The event_id watermark indicates the last
    EventRecord included in the snapshot — on restore, only events after this
    ID need to be replayed.
    """

    __tablename__ = "state_snapshots"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(
        String, ForeignKey("sessions.id", ondelete="CASCADE"), unique=True, index=True
    )
    event_id: Mapped[int] = mapped_column(Integer, nullable=False)
    snapshot_data: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
