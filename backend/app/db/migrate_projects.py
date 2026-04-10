"""One-time migration: create ProjectRecord entries from existing sessions."""

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.project_registry import PROJECT_COLORS, normalize_project_key
from app.db.models import ProjectRecord, SessionRecord

logger = logging.getLogger(__name__)


async def migrate_projects(db: AsyncSession) -> int:
    """Backfill projects table from sessions.project_name.

    Idempotent: skips projects that already exist in DB.
    Returns number of new projects created.
    """
    # Find distinct project names from sessions
    result = await db.execute(
        select(SessionRecord.project_name, SessionRecord.project_root)
        .where(SessionRecord.project_name.isnot(None))
        .distinct()
    )
    rows = result.all()

    created = 0
    key_to_id: dict[str, str] = {}

    # Load existing projects to avoid duplicates
    existing = await db.execute(select(ProjectRecord))
    for p in existing.scalars().all():
        key_to_id[p.key] = p.id

    # Create missing projects
    for project_name, project_root in rows:
        key = normalize_project_key(project_name)
        if key in key_to_id:
            continue
        color = PROJECT_COLORS[created % len(PROJECT_COLORS)]
        record = ProjectRecord(key=key, name=project_name, color=color, path=project_root)
        db.add(record)
        await db.flush()
        key_to_id[key] = record.id
        created += 1

    # Backfill session.project_id for sessions that don't have one
    sessions = await db.execute(
        select(SessionRecord).where(
            SessionRecord.project_name.isnot(None),
            SessionRecord.project_id.is_(None),
        )
    )
    backfilled = 0
    for session in sessions.scalars().all():
        key = normalize_project_key(session.project_name)
        if key in key_to_id:
            session.project_id = key_to_id[key]
            backfilled += 1

    await db.commit()

    if created > 0 or backfilled > 0:
        logger.info(
            f"Migration: created {created} projects, backfilled {backfilled} session project_ids"
        )

    return created
