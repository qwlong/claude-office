# Spec: State Snapshot Persistence for Cold Start Recovery

**Date:** 2026-04-11
**Status:** Draft
**Author:** Architecture Agent

---

## Problem Statement

When the Claude Office Visualizer backend restarts, all `StateMachine` instances
are lost.  Sessions exist in the database but have no in-memory state.  Frontend
clients that connect to `/ws/all` or `/ws/projects` receive empty data until new
hook events arrive for each session.

The existing `_restore_session()` method replays every `EventRecord` row for a
session to reconstruct its `StateMachine`.  This approach has three issues:

1. **Slow.** A session with 2,000 events replays all 2,000.
2. **Incomplete trigger coverage.** Restoration only runs lazily inside
   `get_project_grouped_state()` and `get_current_state()`.  The primary
   `/ws/all` endpoint calls `get_merged_state()`, which does *not* trigger
   restoration -- it simply returns `None` when `self.sessions` is empty.
3. **Per-session cost.** With 10--20 active sessions, sequential restoration
   at startup can block the first WebSocket response for several seconds.

## Design Goals

| ID | Goal |
|----|------|
| G1 | On cold start, the last known state for all active sessions is available within 1 second. |
| G2 | `/ws/all` and `/ws/projects` serve restored state immediately after startup. |
| G3 | Snapshots are persisted periodically, not on every event (SQLite single-writer constraint). |
| G4 | No new database engine -- uses existing SQLite via SQLAlchemy async + aiosqlite. |
| G5 | Restoring from a snapshot + trailing events is strictly faster than full replay. |
| G6 | Hot-path latency (event processing + WebSocket broadcast) is not degraded. |

---

## 1. Database Schema Changes

### New table: `state_snapshots`

```python
class StateSnapshot(Base):
    """Point-in-time serialized StateMachine state for fast cold-start recovery."""

    __tablename__ = "state_snapshots"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(
        String, ForeignKey("sessions.id", ondelete="CASCADE"), index=True
    )
    event_id: Mapped[int] = mapped_column(Integer, nullable=False)
    snapshot_data: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
```

Column semantics:

- **session_id** -- FK to `sessions.id`.  One row per session (upserted, not
  appended -- see Section 3).
- **event_id** -- The `EventRecord.id` of the last event included in the
  snapshot.  Used as the replay watermark: on restore, only events with
  `id > event_id` need to be replayed.
- **snapshot_data** -- JSON string produced by serializing the `StateMachine`
  (see Section 4 for format).

A unique constraint on `session_id` ensures at most one snapshot per session.
The upsert pattern (`INSERT ... ON CONFLICT DO UPDATE`) keeps only the latest.

### Migration strategy

The project does not use Alembic.  Schema changes are applied via
`Base.metadata.create_all` during startup (see `lifespan()` in `main.py`).
Adding a new ORM model to `app/db/models.py` and importing it before
`create_all` is sufficient.  No manual migration is needed -- SQLAlchemy's
`create_all` creates missing tables without altering existing ones.

---

## 2. Snapshot Format

The snapshot serializes the minimal state needed to reconstruct a `StateMachine`
without replaying events.  It is a JSON object with the following top-level
keys:

```
{
  "version": 1,
  "phase": "working",
  "boss_state": "idle",
  "boss_bubble": { ... } | null,
  "boss_current_task": "..." | null,
  "elevator_state": "closed",
  "agents": {
    "<agent_id>": {
      "id": "...",
      "native_id": "...",
      "name": "...",
      "color": "#3B82F6",
      "number": 1,
      "state": "working",
      "desk": 1,
      "current_task": "..."
    }
  },
  "arrival_queue": ["..."],
  "handin_queue": ["..."],
  "total_input_tokens": 12345,
  "total_output_tokens": 6789,
  "tool_uses_since_compaction": 42,
  "session_label": "claude-office/co-7",
  "todos": [ ... ],
  "whiteboard": {
    "tool_usage": { "Read": 15, "Bash": 8 },
    "task_completed_count": 3,
    "bug_fixed_count": 1,
    "coffee_break_count": 0,
    "code_written_count": 5,
    "recent_error_count": 0,
    "recent_success_count": 4,
    "consecutive_successes": 4,
    "last_incident_time": null,
    "agent_lifespans": [ ... ],
    "news_items": [ ... ],
    "coffee_cups": 0,
    "file_edits": { ... },
    "background_tasks": [ ... ]
  },
  "history": [ ... ],           // last 100 entries (trimmed)
  "conversation": [ ... ]       // last 100 entries (trimmed)
}
```

### What is excluded

- **`departed_agents`** -- Ephemeral; these expire after 60 seconds anyway.
  On cold start (which implies > 60 seconds downtime), they are irrelevant.
- **`print_report`** -- Transient UI flag, defaults to `False`.
- Full history/conversation beyond the last 100 entries -- the snapshot is for
  visual state, not for a complete audit log.  Full history is still available
  via the replay endpoint.

### Serialization / deserialization

Add two methods to `StateMachine`:

```python
def to_snapshot_dict(self) -> dict[str, Any]:
    """Serialize state to a JSON-compatible dict for DB persistence."""

def from_snapshot_dict(data: dict[str, Any]) -> "StateMachine":
    """Reconstruct a StateMachine from a snapshot dict."""
```

`to_snapshot_dict` converts enums to their string values, agents to dicts via
`Agent.model_dump()`, and whiteboard state via `WhiteboardTracker` accessors.
`from_snapshot_dict` is a `@staticmethod` that reverses the process.

The `"version"` field enables forward-compatible schema evolution.  If a future
change adds fields, the deserializer can handle missing keys with defaults.
If a breaking change is needed, bumping the version lets the code fall back to
full event replay for snapshots with an older version.

### Size estimate

A session with 8 agents, 10 tool-usage entries, 5 agent lifespans, 10 news
items, 100 history entries, and 100 conversation entries serializes to
approximately 30--80 KB of JSON.  Well under the 1 MB target.

---

## 3. When to Snapshot

Snapshots are written asynchronously, off the hot path, using three triggers:

### 3a. Periodic timer (primary)

A background `asyncio.Task` runs every **30 seconds**.  On each tick it
iterates all sessions in `self.sessions` and writes a snapshot for any session
whose state has changed since its last snapshot.

Change detection: maintain a per-session monotonically increasing counter
(`_snapshot_seq`) that increments on every `sm.transition()` call.  The
snapshot task records the last-written seq.  If the current seq is higher,
a new snapshot is written.

```python
# In EventProcessor.__init__
self._snapshot_seqs: dict[str, int] = {}       # session_id -> current seq
self._last_snapshotted: dict[str, int] = {}    # session_id -> last written seq
self._snapshot_task: asyncio.Task | None = None
```

This batches multiple events into one write, reducing SQLite write pressure.
At 30-second intervals with 20 sessions, worst case is 20 UPSERTs every 30
seconds -- trivial for SQLite.

### 3b. Session end

When a `session_end` event is processed, write a final snapshot immediately.
This ensures the terminal state is captured even if the periodic timer has not
fired yet.  Because session_end is infrequent, the extra write is negligible.

### 3c. Graceful shutdown

During `lifespan()` teardown (the `yield` exit path), write snapshots for all
dirty sessions.  This handles `SIGTERM` / `Ctrl-C` gracefully and minimizes
the gap between the last snapshot and the actual shutdown state.

### Write implementation

All snapshot writes go through a single async function:

```python
async def _write_snapshot(self, session_id: str, sm: StateMachine) -> None:
    """Upsert a state snapshot for the given session."""
    async with AsyncSessionLocal() as db:
        # Get the max event ID for this session
        result = await db.execute(
            select(func.max(EventRecord.id))
            .where(EventRecord.session_id == session_id)
        )
        max_event_id = result.scalar() or 0

        snapshot_json = json.dumps(sm.to_snapshot_dict())

        # Upsert: insert or replace
        existing = await db.execute(
            select(StateSnapshot).where(StateSnapshot.session_id == session_id)
        )
        row = existing.scalar_one_or_none()
        if row:
            row.event_id = max_event_id
            row.snapshot_data = snapshot_json
            row.created_at = datetime.now(UTC)
        else:
            db.add(StateSnapshot(
                session_id=session_id,
                event_id=max_event_id,
                snapshot_data=snapshot_json,
            ))
        await db.commit()
```

---

## 4. Cold Start Restoration Flow

### Current flow (before)

```
lifespan() starts
  -> create_all tables
  -> migrate_projects()
  -> load project registry from DB
  -> (no session state loaded)

/ws/all connects
  -> get_merged_state() -> self.sessions is empty -> returns None
  -> frontend gets empty state
```

### New flow (after)

```
lifespan() starts
  -> create_all tables (includes state_snapshots)
  -> migrate_projects()
  -> load project registry from DB
  -> restore_all_active_sessions()       <-- NEW
  -> start snapshot background task       <-- NEW

/ws/all connects
  -> get_merged_state() -> self.sessions is populated -> returns merged state
  -> frontend immediately renders agents
```

### `restore_all_active_sessions()` implementation

```python
async def restore_all_active_sessions(self) -> None:
    """Restore state for all active sessions from snapshots + trailing events."""
    async with AsyncSessionLocal() as db:
        # 1. Load all active session IDs
        result = await db.execute(
            select(SessionRecord.id).where(SessionRecord.status == "active")
        )
        active_ids = [row[0] for row in result.all()]

        if not active_ids:
            self._db_sessions_restored = True
            return

        # 2. Load snapshots for these sessions
        snap_result = await db.execute(
            select(StateSnapshot).where(
                StateSnapshot.session_id.in_(active_ids)
            )
        )
        snapshots = {s.session_id: s for s in snap_result.scalars().all()}

        # 3. For each active session, restore from snapshot + trailing events
        for sid in active_ids:
            snap = snapshots.get(sid)
            if snap:
                await self._restore_from_snapshot(sid, snap, db)
            else:
                await self._restore_session(sid)

    self._db_sessions_restored = True
    logger.info(
        f"Restored {len(self.sessions)} sessions "
        f"({len(snapshots)} from snapshots, "
        f"{len(active_ids) - len(snapshots)} from full replay)"
    )
```

### `_restore_from_snapshot()` implementation

```python
async def _restore_from_snapshot(
    self, session_id: str, snap: StateSnapshot, db: AsyncSession
) -> None:
    """Restore a StateMachine from a snapshot plus any events after it."""
    try:
        data = json.loads(snap.snapshot_data)
        sm = StateMachine.from_snapshot_dict(data)
    except Exception:
        logger.warning(
            f"Failed to deserialize snapshot for {session_id}, "
            f"falling back to full replay"
        )
        await self._restore_session(session_id)
        return

    # Replay only events after the snapshot watermark
    result = await db.execute(
        select(EventRecord)
        .where(
            EventRecord.session_id == session_id,
            EventRecord.id > snap.event_id,
        )
        .order_by(EventRecord.timestamp.asc())
    )
    trailing_events = result.scalars().all()

    for rec in trailing_events:
        try:
            evt = Event(
                event_type=EventType(rec.event_type),
                session_id=rec.session_id,
                timestamp=rec.timestamp,
                data=EventData.model_validate(rec.data) if rec.data else EventData(),
            )
            sm.transition(evt)
        except Exception as e:
            logger.warning(f"Skipping event {rec.id} during snapshot restore: {e}")

    self.sessions[session_id] = sm
    logger.info(
        f"Restored session {session_id} from snapshot "
        f"(watermark={snap.event_id}, +{len(trailing_events)} trailing events)"
    )
```

This design means:
- If a snapshot exists and covers all events, zero replays are needed.
- If 30 events arrived after the last snapshot, only those 30 are replayed.
- If no snapshot exists (new session or pre-migration), full replay is the
  fallback.

---

## 5. Impact on Existing Code

### `app/db/models.py`

Add the `StateSnapshot` model class (see Section 1).

### `app/core/state_machine.py`

Add `to_snapshot_dict()` instance method and `from_snapshot_dict()` static
method.  No changes to `transition()` or `to_game_state()`.

### `app/core/event_processor.py`

| Area | Change |
|------|--------|
| `__init__` | Add `_snapshot_seqs`, `_last_snapshotted`, `_snapshot_task` fields. |
| `_process_event_internal` | After `sm.transition(event)`, increment `_snapshot_seqs[session_id]`. |
| `get_merged_state` | Remove the early `if not self.sessions: return None` guard -- sessions will be populated at startup. |
| `get_project_grouped_state` | Remove the inline DB restoration block (`if not self.sessions and not self._db_sessions_restored`).  Move to startup. |
| New: `restore_all_active_sessions` | See Section 4. |
| New: `_restore_from_snapshot` | See Section 4. |
| New: `_write_snapshot` | See Section 3. |
| New: `_snapshot_loop` | Background task that runs every 30 seconds. |
| New: `start_snapshot_task` | Called during lifespan startup. |
| New: `flush_snapshots` | Called during lifespan shutdown. |

### `app/core/broadcast_service.py`

No changes.  The broadcast functions already work correctly when
`self.sessions` is populated -- the issue was that sessions were empty.

### `app/main.py` (`lifespan`)

Add two calls inside the lifespan startup block:

```python
await event_processor.restore_all_active_sessions()
event_processor.start_snapshot_task()
```

And in the shutdown path (after `yield`):

```python
await event_processor.flush_snapshots()
```

### `app/api/websocket.py`

No changes.

### `app/api/routes/sessions.py` (replay endpoint)

No changes.  The replay endpoint reads raw events from DB -- it is unaffected
by the snapshot layer.

---

## 6. Snapshot Lifecycle and Cleanup

### Snapshot retention

Only one snapshot per session is kept (upsert pattern).  Old snapshots are
overwritten in place.

### Ended sessions

When a session ends (`status = "completed"`), the final snapshot is written
and then left in the database.  It serves no restoration purpose (ended sessions
are not restored on cold start) but is cheap to retain and could be useful for
debugging.

Optional: a periodic cleanup job can delete snapshots for sessions that ended
more than 7 days ago:

```sql
DELETE FROM state_snapshots
WHERE session_id IN (
    SELECT id FROM sessions
    WHERE status != 'active'
    AND updated_at < datetime('now', '-7 days')
);
```

This is not critical for the initial implementation.

### Orphaned snapshots

If a session record is deleted (CASCADE), the snapshot row is also deleted via
the FK `ON DELETE CASCADE`.

---

## 7. Performance Analysis

### Cold start time

| Scenario | Before (full replay) | After (snapshot + trailing) |
|----------|---------------------|-----------------------------|
| 10 sessions, 500 events each | ~5,000 event replays | 10 snapshot loads + ~10 trailing events |
| 20 sessions, 2,000 events each | ~40,000 event replays | 20 snapshot loads + ~20 trailing events |

Snapshot deserialization is a single `json.loads()` + model construction, which
takes < 5 ms per session.  The DB query for trailing events uses the indexed
`event_id` column and returns a small result set.  Total cold-start time for
20 sessions should be < 200 ms.

### Hot path impact

Event processing (`_process_event_internal`) gains one integer increment
(`_snapshot_seqs[sid] += 1`).  Cost: negligible.

Snapshot writes happen in a background task on a 30-second interval, completely
decoupled from the event processing and broadcast path.  SQLite WAL mode
(the aiosqlite default) allows concurrent reads during writes, so WebSocket
broadcasts are not blocked.

### Storage cost

One JSON blob per active session, 30--80 KB each.  With 20 sessions: < 2 MB
total in the database.

---

## 8. Error Handling and Fallbacks

| Failure mode | Behavior |
|-------------|----------|
| Snapshot deserialization fails (corrupt data, version mismatch) | Log warning, fall back to full event replay for that session. |
| Snapshot write fails (disk full, SQLite locked) | Log error, skip this cycle.  Next cycle will retry.  Worst case: cold start falls back to full replay. |
| Snapshot version mismatch after code upgrade | `from_snapshot_dict` checks `version` field.  Unknown versions trigger full replay fallback. |
| No snapshot exists for a session | Full event replay (current behavior, unchanged). |
| Event replay after snapshot fails for one event | Skip the event with a warning (existing behavior in `_restore_session`). |

---

## 9. Testing Strategy

### Unit tests

1. **`StateMachine.to_snapshot_dict` / `from_snapshot_dict` round-trip:**
   Create a `StateMachine`, run several events through it, serialize to dict,
   deserialize, and assert the two instances produce identical `GameState`.

2. **Snapshot write and restore:** Use an in-memory SQLite database. Process
   events, write a snapshot, add more events, then call
   `_restore_from_snapshot`.  Assert the final state matches running all events
   through a fresh `StateMachine`.

3. **Version fallback:** Create a snapshot with `"version": 999`, call
   `_restore_from_snapshot`, assert it falls back to full replay.

4. **Empty session:** Ensure `_restore_from_snapshot` handles sessions with
   snapshots but zero trailing events.

### Integration tests

5. **Cold start simulation:** Populate DB with events and a snapshot for a
   session.  Create a fresh `EventProcessor`, call
   `restore_all_active_sessions`, then call `get_merged_state` and assert it
   returns populated state.

6. **Snapshot loop:** Verify the background task writes snapshots only for
   dirty sessions (check `_snapshot_seqs` vs `_last_snapshotted`).

---

## 10. Implementation Plan

| Phase | Task | Files |
|-------|------|-------|
| 1 | Add `StateSnapshot` model | `backend/app/db/models.py` |
| 1 | Add `to_snapshot_dict` / `from_snapshot_dict` to `StateMachine` | `backend/app/core/state_machine.py` |
| 1 | Unit tests for serialization round-trip | `backend/tests/test_state_snapshots.py` |
| 2 | Add `_write_snapshot`, `_snapshot_loop`, `start_snapshot_task`, `flush_snapshots` to `EventProcessor` | `backend/app/core/event_processor.py` |
| 2 | Add seq increment to `_process_event_internal` | `backend/app/core/event_processor.py` |
| 2 | Write snapshot on session_end | `backend/app/core/event_processor.py` |
| 3 | Add `restore_all_active_sessions` and `_restore_from_snapshot` | `backend/app/core/event_processor.py` |
| 3 | Remove lazy restoration from `get_project_grouped_state` | `backend/app/core/event_processor.py` |
| 3 | Hook startup and shutdown in `lifespan()` | `backend/app/main.py` |
| 4 | Integration tests | `backend/tests/test_state_snapshots.py` |
| 4 | Manual testing: restart backend, verify `/ws/all` serves state immediately | -- |

---

## 11. Open Questions

1. **Snapshot interval tuning.** 30 seconds is a starting point.  If SQLite
   write contention becomes an issue (unlikely at this scale), increase to
   60 seconds.  If data loss on crash matters more, decrease to 15 seconds.

2. **Conversation and history trimming.** The spec trims to the last 100
   entries in the snapshot.  Should the full conversation be stored?  At
   100 entries per session the size is manageable, but sessions with heavy
   conversation could grow.  An alternative is to store only agent/boss/office
   state in the snapshot and rebuild conversation from events on demand.

3. **Concurrent session restoration.** The current design restores sessions
   sequentially in `restore_all_active_sessions`.  If cold start latency
   becomes a problem with many sessions, restoration could use
   `asyncio.gather` to parallelize DB reads.  However, SQLite's single-reader
   concurrency may limit the benefit.  Profile before optimizing.
