"""API routes for agent management (merge, dismiss, cleanup)."""

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.broadcast_service import broadcast_state
from app.core.event_processor import event_processor
from app.core.transcript_poller import get_transcript_poller

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/agents", tags=["agents"])


class MergeRequest(BaseModel):
    """Request body for merging two agents."""

    source_agent_id: str
    target_agent_id: str
    session_id: str


class DismissRequest(BaseModel):
    """Request body for dismissing an agent."""

    agent_id: str
    session_id: str


class CleanupRequest(BaseModel):
    """Request body for cleaning up all orphaned/stale agents."""

    session_id: str


@router.post("/merge")
async def merge_agents(request: MergeRequest) -> dict[str, str]:
    """Merge source agent into target agent.

    Source agent departs, target agent inherits metadata.
    """
    sm = event_processor.sessions.get(request.session_id)
    if sm is None:
        raise HTTPException(status_code=404, detail="Session not found")

    source = sm.agents.get(request.source_agent_id)
    target = sm.agents.get(request.target_agent_id)
    if source is None:
        raise HTTPException(status_code=404, detail="Source agent not found")
    if target is None:
        raise HTTPException(status_code=404, detail="Target agent not found")

    # Merge metadata: append source task to target
    source_name = source.name or f"Agent-{source.id[-4:]}"
    if source.current_task and target.current_task:
        target.current_task = f"{target.current_task} + {source.current_task}"
    elif source.current_task:
        target.current_task = source.current_task

    # Trigger source departure
    sm.trigger_agent_departure(request.source_agent_id)
    sm.remove_agent(request.source_agent_id)

    # Stop transcript polling for source
    transcript_poller = get_transcript_poller()
    if transcript_poller:
        await transcript_poller.stop_polling(request.source_agent_id)

    sm.whiteboard.add_news_item("agent", f"{source_name} merged into {target.name or 'target'}")
    await broadcast_state(request.session_id, sm)

    logger.info(
        f"Merged agent {request.source_agent_id} into {request.target_agent_id} "
        f"in session {request.session_id}"
    )
    return {"status": "merged"}


@router.post("/dismiss")
async def dismiss_agent(request: DismissRequest) -> dict[str, str]:
    """Manually dismiss a single agent."""
    sm = event_processor.sessions.get(request.session_id)
    if sm is None:
        raise HTTPException(status_code=404, detail="Session not found")

    agent = sm.agents.get(request.agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")

    sm.trigger_agent_departure(request.agent_id)
    sm.remove_agent(request.agent_id)

    transcript_poller = get_transcript_poller()
    if transcript_poller:
        await transcript_poller.stop_polling(request.agent_id)

    await broadcast_state(request.session_id, sm)

    logger.info(f"Dismissed agent {request.agent_id} in session {request.session_id}")
    return {"status": "dismissed"}


@router.post("/cleanup")
async def cleanup_agents(request: CleanupRequest) -> dict[str, int]:
    """Dismiss all orphaned or stale agents in a session."""
    sm = event_processor.sessions.get(request.session_id)
    if sm is None:
        raise HTTPException(status_code=404, detail="Session not found")

    transcript_poller = get_transcript_poller()
    removed = 0

    for agent_id in list(sm.agents.keys()):
        agent = sm.agents.get(agent_id)
        if agent is None:
            continue

        # Skip agents with active transcripts
        if transcript_poller and await transcript_poller.is_polling(agent_id):
            continue

        sm.trigger_agent_departure(agent_id)
        sm.remove_agent(agent_id)
        if transcript_poller:
            await transcript_poller.stop_polling(agent_id)
        removed += 1

    if removed:
        await broadcast_state(request.session_id, sm)

    logger.info(f"Cleaned up {removed} agents in session {request.session_id}")
    return {"removed": removed}
