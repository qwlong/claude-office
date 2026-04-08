"""Models for multi-project office state."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from app.models.agents import Agent, Boss, OfficeState
from app.models.common import TodoItem


class ProjectGroup(BaseModel):
    """A project room containing agents from all sessions of that project."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    key: str
    name: str
    color: str
    root: str | None
    agents: list[Agent]
    boss: Boss
    session_count: int
    todos: list[TodoItem] = Field(default_factory=list)


class MultiProjectGameState(BaseModel):
    """Complete state grouped by project for the multi-room view."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    session_id: str = "__all__"
    projects: list[ProjectGroup]
    office: OfficeState
    last_updated: datetime
