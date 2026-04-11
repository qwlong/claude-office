import importlib
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from rich.logging import RichHandler

from app.api.routes import agents, events, preferences, projects, sessions, tasks
from app.api.websocket import manager
from app.config import get_settings
from app.core.event_processor import event_processor
from app.core.summary_service import get_summary_service
from app.db.database import Base, get_engine
from app.services.git_service import git_service

STATIC_DIR = Path(__file__).parent.parent / "static"


logging.basicConfig(
    level=logging.INFO, format="%(message)s", handlers=[RichHandler(rich_tracebacks=True)]
)

settings = get_settings()


def _add_project_id_column_if_missing(connection) -> None:  # type: ignore[no-untyped-def]
    """Add project_id column to sessions table if it doesn't exist (schema migration)."""
    import sqlite3

    raw = connection.connection.dbapi_connection  # type: ignore[attr-defined]
    cursor = raw.cursor()
    cursor.execute("PRAGMA table_info(sessions)")
    columns = {row[1] for row in cursor.fetchall()}
    if "project_id" not in columns:
        cursor.execute("ALTER TABLE sessions ADD COLUMN project_id VARCHAR REFERENCES projects(id)")
        logging.getLogger(__name__).info("Added project_id column to sessions table")


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Manage application startup and shutdown lifecycle."""
    importlib.import_module("app.db.models")
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Add project_id column to sessions if missing (schema migration)
        await conn.run_sync(_add_project_id_column_if_missing)

    # Migrate existing sessions to projects table (idempotent)
    from app.db.database import AsyncSessionLocal
    from app.db.migrate_projects import migrate_projects

    async with AsyncSessionLocal() as db:
        await migrate_projects(db)
        # Load projects into registry cache
        await event_processor.project_registry.load_from_db(db)

    git_service.start()
    event_processor.start_stale_agent_checker()

    # Restore sessions from snapshots for instant cold start
    await event_processor.restore_all_active_sessions()
    event_processor.start_snapshot_task()

    from app.services.task_service import get_task_service

    task_service = get_task_service()
    await task_service.start()

    yield

    # Flush snapshots before shutdown
    await event_processor.flush_snapshots()
    await task_service.stop()
    await git_service.stop()
    await get_engine().dispose()


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(agents.router, prefix=f"{settings.API_V1_STR}")
app.include_router(events.router, prefix=f"{settings.API_V1_STR}")
app.include_router(preferences.router, prefix=f"{settings.API_V1_STR}")
app.include_router(sessions.router, prefix=f"{settings.API_V1_STR}")
app.include_router(projects.router, prefix=f"{settings.API_V1_STR}")
app.include_router(tasks.router, prefix=f"{settings.API_V1_STR}")


@app.get("/health")
async def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/v1/status")
async def get_status() -> dict[str, bool | str | None]:
    """Get server status including AI summary availability."""
    summary_service = get_summary_service()
    return {
        "aiSummaryEnabled": summary_service.enabled,
        "aiSummaryModel": summary_service.model if summary_service.enabled else None,
    }


@app.websocket("/ws/all")
async def websocket_all_endpoint(websocket: WebSocket) -> None:
    """WebSocket that sends merged state from all active sessions."""
    await manager.connect_all(websocket)

    merged_state = await event_processor.get_merged_state()
    if merged_state:
        await manager.send_personal_message(
            {
                "type": "state_update",
                "timestamp": merged_state.last_updated.isoformat(),
                "state": merged_state.model_dump(mode="json", by_alias=True),
            },
            websocket,
        )

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await manager.disconnect_all(websocket)


@app.websocket("/ws/projects")
async def websocket_projects(websocket: WebSocket) -> None:
    """WebSocket that sends project-grouped state from all active sessions."""
    await manager.connect_projects(websocket)

    project_state = await event_processor.get_project_grouped_state()
    if project_state:
        await manager.send_personal_message(
            {
                "type": "project_state",
                "data": project_state.model_dump(by_alias=True, mode="json"),
            },
            websocket,
        )

    # Send initial session list
    from app.api.routes.sessions import build_session_list
    from app.db.database import AsyncSessionLocal
    try:
        async with AsyncSessionLocal() as db:
            sessions = await build_session_list(db)
        await manager.send_personal_message(
            {"type": "sessions_update", "data": sessions},
            websocket,
        )
    except Exception:
        pass  # Non-critical

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await manager.disconnect_projects(websocket)


@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str) -> None:
    await manager.connect(websocket, session_id)

    current_state = await event_processor.get_current_state(session_id)
    if current_state:
        await manager.send_personal_message(
            {
                "type": "state_update",
                "timestamp": current_state.last_updated.isoformat(),
                "state": current_state.model_dump(mode="json", by_alias=True),
            },
            websocket,
        )

    project_root = await event_processor.get_project_root(session_id)
    if project_root:
        git_service.configure(session_id=session_id, project_root=project_root)

    git_status = git_service.get_status()
    if git_status:
        await manager.send_personal_message(
            {
                "type": "git_status",
                "timestamp": git_status.last_updated.isoformat(),
                "gitStatus": git_status.model_dump(mode="json"),
            },
            websocket,
        )

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await manager.disconnect(websocket, session_id)


if STATIC_DIR.exists():
    app.mount("/_next", StaticFiles(directory=STATIC_DIR / "_next"), name="next_static")

    @app.get("/{path:path}")
    async def serve_frontend(path: str) -> FileResponse:
        """Serve static frontend files with SPA fallback routing."""
        file_path = STATIC_DIR / path
        if file_path.is_file():
            return FileResponse(file_path)

        html_path = STATIC_DIR / f"{path}.html"
        if html_path.is_file():
            return FileResponse(html_path)

        index_path = STATIC_DIR / "index.html"
        if index_path.is_file():
            return FileResponse(index_path)

        not_found_path = STATIC_DIR / "404.html"
        if not_found_path.is_file():
            return FileResponse(not_found_path, status_code=404)
        return FileResponse(index_path)

    @app.get("/")
    async def serve_index() -> FileResponse:
        """Serve the index page."""
        return FileResponse(STATIC_DIR / "index.html")
