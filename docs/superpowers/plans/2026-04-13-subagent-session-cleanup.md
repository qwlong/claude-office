# Subagent Session Cleanup — Plan

### Task 1: Hide completed subagent sessions from list (TDD)

- [ ] Write test: build_session_list excludes completed sessions with no projectKey
- [ ] Modify build_session_list to skip completed sessions where projectKey is null
- [ ] Run test, verify pass
- [ ] Commit

### Task 2: Subagent sessions inherit parent project (TDD)

- [ ] Write test: subagent session_start with different project_root inherits parent projectKey
- [ ] In event_processor._persist_event, when SESSION_START has a project_root that's a subdirectory of an existing active session's project_root, use the parent's project_name
- [ ] Run test, verify pass
- [ ] Commit + tag
