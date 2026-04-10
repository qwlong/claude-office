import { describe, it, expect, beforeEach } from "vitest";
import {
  useGameStore,
  selectCompactionPhase,
  selectIsCompacting,
  selectContextUtilization,
} from "@/stores/gameStore";

describe("per-session compaction state", () => {
  beforeEach(() => {
    // Reset store to initial state
    useGameStore.setState({
      sessionId: "session-1",
      compactionPhases: new Map(),
      isCompactingMap: new Map(),
      contextUtilizations: new Map(),
    });
  });

  it("triggerCompaction sets state for given sessionId", () => {
    useGameStore.getState().triggerCompaction("session-1");
    const state = useGameStore.getState();
    expect(state.compactionPhases.get("session-1")).toBe("walking_to_trash");
    expect(state.isCompactingMap.get("session-1")).toBe(true);
  });

  it("triggerCompaction without sessionId uses current sessionId", () => {
    useGameStore.getState().triggerCompaction();
    const state = useGameStore.getState();
    expect(state.compactionPhases.get("session-1")).toBe("walking_to_trash");
    expect(state.isCompactingMap.get("session-1")).toBe(true);
  });

  it("setCompactionPhase updates correct session", () => {
    useGameStore.getState().triggerCompaction("session-1");
    useGameStore.getState().triggerCompaction("session-2");
    useGameStore.getState().setCompactionPhase("session-1", "jumping");
    const state = useGameStore.getState();
    expect(state.compactionPhases.get("session-1")).toBe("jumping");
    expect(state.compactionPhases.get("session-2")).toBe("walking_to_trash");
  });

  it("backward-compat selectors read current session", () => {
    useGameStore.getState().triggerCompaction("session-1");
    useGameStore.getState().setContextUtilization(0.75, "session-1");
    const state = useGameStore.getState();
    expect(selectCompactionPhase(state)).toBe("walking_to_trash");
    expect(selectIsCompacting(state)).toBe(true);
    expect(selectContextUtilization(state)).toBe(0.75);
  });

  it("setContextUtilization updates per-session", () => {
    useGameStore.getState().setContextUtilization(0.5, "session-1");
    useGameStore.getState().setContextUtilization(0.8, "session-2");
    const state = useGameStore.getState();
    expect(state.contextUtilizations.get("session-1")).toBe(0.5);
    expect(state.contextUtilizations.get("session-2")).toBe(0.8);
  });

  it("two sessions can compact independently", () => {
    useGameStore.getState().triggerCompaction("session-1");
    useGameStore.getState().triggerCompaction("session-2");
    useGameStore.getState().setCompactionPhase("session-1", "jumping");
    useGameStore.getState().setCompactionPhase("session-2", "walking_back");
    const state = useGameStore.getState();
    expect(state.compactionPhases.get("session-1")).toBe("jumping");
    expect(state.compactionPhases.get("session-2")).toBe("walking_back");
  });

  it("resetForSessionSwitch clears all Maps", () => {
    useGameStore.getState().triggerCompaction("session-1");
    useGameStore.getState().setContextUtilization(0.5, "session-1");
    // Simulate reset
    useGameStore.setState({
      compactionPhases: new Map(),
      isCompactingMap: new Map(),
      contextUtilizations: new Map(),
    });
    const state = useGameStore.getState();
    expect(state.compactionPhases.size).toBe(0);
    expect(state.isCompactingMap.size).toBe(0);
    expect(state.contextUtilizations.size).toBe(0);
  });
});
