# Parallel Boss Assignment — Plan

### Task 1: XState — remove guard and claimBoss (TDD)

- [ ] Write test: multiple agents can all receive BOSS_AVAILABLE and advance
- [ ] Remove `guard: "isAtFrontOfQueue"` from both arrival and departure BOSS_AVAILABLE transitions
- [ ] Remove `actions: ["claimBoss"]` from both transitions (keep `leaveQueue`)
- [ ] Run tests, commit

### Task 2: notifyBossAvailable — notify all agents

- [ ] Send BOSS_AVAILABLE to ALL agents in queue, not just front
- [ ] Remove getReadyOccupant check
- [ ] Commit

### Task 3: checkQueueAdvancement — remove boss exclusivity

- [ ] Remove `boss.inUseBy` check and deadlock watchdog
- [ ] Notify when ANY agent in queue is waiting (not just front)
- [ ] Commit

### Task 4: Test end-to-end

- [ ] Spawn 3 agents, verify all walk through arrival simultaneously
- [ ] Verify departure still works
- [ ] Tag v0.26.0
