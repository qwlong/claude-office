"""Agent persistence: DB operations for agent lifecycle."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AgentRecord


class AgentStore:
    """Handles agent CRUD at key lifecycle points."""

    async def create_agent(
        self,
        db: AsyncSession,
        *,
        session_id: str,
        project_id: str | None = None,
        external_id: str,
        agent_type: str,
        name: str | None = None,
        state: str | None = None,
        assignment: str | None = None,
        desk: int | None = None,
        color: str | None = None,
    ) -> AgentRecord:
        now = datetime.now(UTC)
        record = AgentRecord(
            id=str(uuid.uuid4()),
            session_id=session_id,
            project_id=project_id,
            external_id=external_id,
            agent_type=agent_type,
            name=name,
            state=state,
            assignment=assignment,
            desk=desk,
            color=color,
            started_at=now,
        )
        db.add(record)
        await db.commit()
        return record

    async def update_state(self, db: AsyncSession, agent_id: str, state: str) -> None:
        result = await db.execute(select(AgentRecord).where(AgentRecord.id == agent_id))
        agent = result.scalar_one_or_none()
        if agent:
            agent.state = state
            await db.commit()

    async def update_assignment(self, db: AsyncSession, agent_id: str, assignment: str) -> None:
        result = await db.execute(select(AgentRecord).where(AgentRecord.id == agent_id))
        agent = result.scalar_one_or_none()
        if agent:
            agent.assignment = assignment
            await db.commit()

    async def mark_ended(self, db: AsyncSession, agent_id: str, state: str = "completed") -> None:
        result = await db.execute(select(AgentRecord).where(AgentRecord.id == agent_id))
        agent = result.scalar_one_or_none()
        if agent:
            agent.state = state
            agent.ended_at = datetime.now(UTC)
            await db.commit()

    async def get_active_agents(
        self, db: AsyncSession, *, session_id: str | None = None, project_id: str | None = None
    ) -> list[AgentRecord]:
        query = select(AgentRecord).where(AgentRecord.ended_at.is_(None))
        if session_id:
            query = query.where(AgentRecord.session_id == session_id)
        if project_id:
            query = query.where(AgentRecord.project_id == project_id)
        result = await db.execute(query)
        return list(result.scalars().all())

    async def find_by_external_id(
        self, db: AsyncSession, session_id: str, external_id: str
    ) -> AgentRecord | None:
        result = await db.execute(
            select(AgentRecord).where(
                AgentRecord.session_id == session_id,
                AgentRecord.external_id == external_id,
                AgentRecord.ended_at.is_(None),
            )
        )
        return result.scalar_one_or_none()


agent_store = AgentStore()
