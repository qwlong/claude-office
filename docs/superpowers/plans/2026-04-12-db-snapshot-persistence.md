# DB Snapshot Persistence — Implementation Plan

> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cold start restores all active sessions from DB snapshots in <1 second instead of replaying all events.

---

### Task 1: Add StateSnapshot DB model

**Files:**
- Modify: `backend/app/db/models.py`

- [ ] Add `StateSnapshot` class with session_id (FK), event_id (watermark), snapshot_data (JSON Text), created_at
- [ ] Verify `Base.metadata.create_all` picks it up on startup
- [ ] Commit

### Task 2: Add StateMachine serialization methods

**Files:**
- Modify: `backend/app/core/state_machine.py`

- [ ] Add `to_snapshot_dict(self) -> dict` — serialize agents, boss, office state, todos, whiteboard, history (last 100), conversation (last 100)
- [ ] Add `@staticmethod from_snapshot_dict(data: dict) -> StateMachine` — reconstruct from dict
- [ ] Write test: round-trip serialize/deserialize
- [ ] Commit

### Task 3: Add snapshot write/flush to EventProcessor

**Files:**
- Modify: `backend/app/core/event_processor.py`

- [ ] Add `_snapshot_seqs`, `_last_snapshotted`, `_snapshot_task` fields to `__init__`
- [ ] Increment `_snapshot_seqs[session_id]` after every `sm.transition()` in `_process_event_internal`
- [ ] Add `_write_snapshot(session_id, sm)` — upsert to DB
- [ ] Add `_snapshot_loop()` — every 30s, write dirty sessions
- [ ] Add `start_snapshot_task()` / `flush_snapshots()`
- [ ] Write snapshot on `session_end`
- [ ] Commit

### Task 4: Add cold start restoration

**Files:**
- Modify: `backend/app/core/event_processor.py`
- Modify: `backend/app/main.py`

- [ ] Add `restore_all_active_sessions()` — load snapshots, replay trailing events
- [ ] Add `_restore_from_snapshot(session_id, snap, db)` — deserialize + replay trailing
- [ ] Call `restore_all_active_sessions()` in `lifespan()` startup
- [ ] Call `start_snapshot_task()` in `lifespan()` startup
- [ ] Call `flush_snapshots()` in `lifespan()` shutdown
- [ ] Commit

### Task 5: Test and verify

- [ ] Restart backend, verify sessions restore from snapshots
- [ ] Check `/ws/all` immediately returns agent data
- [ ] Check frontend shows agents without waiting for new events
- [ ] Commit + tag
