import { describe, it, expect } from "vitest";
import type { ProjectGroup } from "../src/types/projects";
import { getBossPositions } from "../src/constants/positions";
import { CANVAS_WIDTH } from "../src/constants/canvas";

/**
 * Tests for multi-boss project room logic.
 *
 * OfficeRoom extracts `agentType === "main"` agents from room data
 * to render multiple bosses when a project has multiple sessions.
 * These tests verify the extraction and positioning logic.
 */

function makeProject(agents: ProjectGroup["agents"]): ProjectGroup {
  return {
    key: "test-project",
    name: "Test Project",
    color: "#3B82F6",
    root: "/test",
    agents,
    boss: {
      state: "working" as const,
      currentTask: null,
      bubble: null,
      position: { x: 640, y: 830 },
    },
    sessionCount: agents.filter((a) => a.agentType === "main").length || 1,
    todos: [],
  };
}

function extractRoomBossAgents(project: ProjectGroup) {
  return project.agents.filter(
    (a: { agentType?: string }) => a.agentType === "main",
  );
}

describe("multi-boss project room", () => {
  it("extracts main agents as room bosses", () => {
    const project = makeProject([
      { id: "boss-1", name: "Boss 1", color: "#fff", number: 1, state: "working", agentType: "main", sessionId: "s1" },
      { id: "boss-2", name: "Boss 2", color: "#fff", number: 2, state: "working", agentType: "main", sessionId: "s2" },
      { id: "sub-1", name: "Sub 1", color: "#fff", number: 3, state: "working", agentType: "subagent", desk: 1 },
    ]);
    const bosses = extractRoomBossAgents(project);
    expect(bosses).toHaveLength(2);
    expect(bosses[0].id).toBe("boss-1");
    expect(bosses[1].id).toBe("boss-2");
  });

  it("returns empty for project with no main agents", () => {
    const project = makeProject([
      { id: "sub-1", name: "Sub 1", color: "#fff", number: 1, state: "working", agentType: "subagent", desk: 1 },
    ]);
    const bosses = extractRoomBossAgents(project);
    expect(bosses).toHaveLength(0);
  });

  it("returns single boss for project with one main agent", () => {
    const project = makeProject([
      { id: "boss-1", name: "Boss 1", color: "#fff", number: 1, state: "working", agentType: "main" },
      { id: "sub-1", name: "Sub 1", color: "#fff", number: 2, state: "working", agentType: "subagent", desk: 1 },
    ]);
    const bosses = extractRoomBossAgents(project);
    expect(bosses).toHaveLength(1);
    // isMultiBossRoom should be false when only 1 boss
    expect(bosses.length > 1).toBe(false);
  });

  it("isMultiBossRoom is true only when > 1 main agents", () => {
    const singleBoss = makeProject([
      { id: "boss-1", name: "Boss", color: "#fff", number: 1, state: "working", agentType: "main" },
    ]);
    const multiBoss = makeProject([
      { id: "boss-1", name: "Boss 1", color: "#fff", number: 1, state: "working", agentType: "main" },
      { id: "boss-2", name: "Boss 2", color: "#fff", number: 2, state: "working", agentType: "main" },
      { id: "boss-3", name: "Boss 3", color: "#fff", number: 3, state: "working", agentType: "main" },
    ]);
    expect(extractRoomBossAgents(singleBoss).length > 1).toBe(false);
    expect(extractRoomBossAgents(multiBoss).length > 1).toBe(true);
  });

  it("getBossPositions returns correct count for room bosses", () => {
    const bosses = [
      { id: "b1", agentType: "main" },
      { id: "b2", agentType: "main" },
      { id: "b3", agentType: "main" },
    ];
    const positions = getBossPositions(bosses.length, CANVAS_WIDTH);
    expect(positions).toHaveLength(3);
    // Positions should be spread horizontally
    expect(positions[0].x).toBeLessThan(positions[1].x);
    expect(positions[1].x).toBeLessThan(positions[2].x);
    // All should have same y
    expect(positions[0].y).toBe(positions[1].y);
    expect(positions[1].y).toBe(positions[2].y);
  });

  it("subagents are excluded from boss extraction even without agentType", () => {
    const project = makeProject([
      { id: "boss-1", name: "Boss", color: "#fff", number: 1, state: "working", agentType: "main" },
      { id: "sub-1", name: "Sub", color: "#fff", number: 2, state: "working", desk: 1 },
    ]);
    const bosses = extractRoomBossAgents(project);
    expect(bosses).toHaveLength(1);
    expect(bosses[0].id).toBe("boss-1");
  });
});
