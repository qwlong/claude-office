# Multi-Boss Project Room View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Project rooms with multiple sessions should display multiple bosses (one per main agent), matching the Whole Office merged view layout.

**Architecture:** In `OfficeRoom`, extract `agentType === "main"` agents from `roomCtx.project.agents` as room bosses. When count > 1, use `getBossPositions()` to lay them out with per-boss rugs and trash cans, reusing the same multi-boss rendering path as the merged view.

**Tech Stack:** React, PixiJS, Zustand

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `frontend/src/components/game/OfficeRoom.tsx` | Modify | Extract room boss agents, render multi-boss layout in room mode |
| `frontend/tests/officeRoomMultiBoss.test.ts` | Create | Tests for multi-boss extraction and layout logic |

---

## Changes (already implemented in `926a661`)

### OfficeRoom.tsx

1. **Room boss extraction:** `roomBossAgents` memo filters `agentType === "main"` from room agents
2. **`isMultiBossRoom`:** boolean flag when `isRoom && roomBossAgents.length > 1`
3. **`multiBossCount`:** unified count for both merged view and multi-boss room
4. **Boss positions:** `bossPositions` uses `multiBossCount` instead of only `storeBosses.size`
5. **Boss rendering:** new branch for `isMultiBossRoom` — maps `roomBossAgents` to `BossSprite` with positions from `bossPositions`
6. **Rugs:** multi-boss rugs render when `isMergedView || isMultiBossRoom`
7. **Trash cans:** multi-boss trash cans render when `isMergedView || isMultiBossRoom`, single room gets static trash can
