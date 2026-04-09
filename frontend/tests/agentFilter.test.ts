import { describe, expect, it } from "vitest";
import { getFilteredAgents, getFilteredAgentIds, groupAgentsBySessionId } from "../src/utils/agentFilter";
import type { Agent } from "../src/types/generated";
import type { ProjectGroup } from "../src/types/projects";
import type { ViewMode } from "../src/types/projects";

function makeAgent(overrides: Partial<Agent> & { sessionId?: string }): Agent {
  return {
    id: "agent-1",
    color: "#ff0000",
    number: 1,
    state: "working",
    ...overrides,
  } as Agent;
}

function makeProject(overrides: Partial<ProjectGroup>): ProjectGroup {
  return {
    key: "proj-1",
    name: "Test Project",
    color: "#0000ff",
    root: null,
    agents: [],
    boss: {} as ProjectGroup["boss"],
    sessionCount: 1,
    todos: [],
    ...overrides,
  };
}

describe("getFilteredAgents", () => {
  const agent1 = makeAgent({ id: "a1", number: 1, sessionId: "sess-1" });
  const agent2 = makeAgent({ id: "a2", number: 2, sessionId: "sess-1" });
  const agent3 = makeAgent({ id: "a3", number: 3, sessionId: "sess-2" });

  const projects: ProjectGroup[] = [
    makeProject({
      key: "proj-1",
      agents: [agent1, agent2, agent3],
    }),
    makeProject({
      key: "proj-2",
      agents: [makeAgent({ id: "a4", number: 4, sessionId: "sess-3" })],
    }),
  ];

  it("returns null for office view (use gameStore instead)", () => {
    const result = getFilteredAgents("office", null, projects);
    expect(result).toBeNull();
  });

  it("returns null for projects overview", () => {
    const result = getFilteredAgents("projects", null, projects);
    expect(result).toBeNull();
  });

  it("returns null for sessions overview", () => {
    const result = getFilteredAgents("sessions", null, projects);
    expect(result).toBeNull();
  });

  it("returns all agents for a project in project view", () => {
    const result = getFilteredAgents("project", "proj-1", projects);
    expect(result).not.toBeNull();
    expect(result!.map((a) => a.id)).toEqual(["a1", "a2", "a3"]);
  });

  it("returns only matching session agents in session view", () => {
    const result = getFilteredAgents("session", "sess-1", projects);
    expect(result).not.toBeNull();
    expect(result!.map((a) => a.id)).toEqual(["a1", "a2"]);
  });

  it("returns empty array for unknown session", () => {
    const result = getFilteredAgents("session", "nonexistent", projects);
    expect(result).not.toBeNull();
    expect(result).toEqual([]);
  });

  it("returns agents sorted by number", () => {
    const unsorted = [
      makeAgent({ id: "z", number: 5, sessionId: "sess-x" }),
      makeAgent({ id: "a", number: 1, sessionId: "sess-x" }),
      makeAgent({ id: "m", number: 3, sessionId: "sess-x" }),
    ];
    const result = getFilteredAgents("session", "sess-x", [
      makeProject({ key: "p", agents: unsorted }),
    ]);
    expect(result!.map((a) => a.number)).toEqual([1, 3, 5]);
  });

  it("handles agents without sessionId gracefully", () => {
    const agentNoSession = makeAgent({ id: "no-sess", number: 1 });
    delete (agentNoSession as Record<string, unknown>).sessionId;
    const result = getFilteredAgents("session", "sess-1", [
      makeProject({ key: "p", agents: [agentNoSession, agent1] }),
    ]);
    expect(result!.map((a) => a.id)).toEqual(["a1"]);
  });
});

describe("getFilteredAgentIds", () => {
  const agent1 = makeAgent({ id: "a1", number: 1, sessionId: "sess-1" });
  const agent2 = makeAgent({ id: "a2", number: 2, sessionId: "sess-1" });
  const agent3 = makeAgent({ id: "a3", number: 3, sessionId: "sess-2" });

  const projects: ProjectGroup[] = [
    makeProject({
      key: "proj-1",
      agents: [agent1, agent2, agent3],
    }),
    makeProject({
      key: "proj-2",
      agents: [makeAgent({ id: "a4", number: 4, sessionId: "sess-3" })],
    }),
  ];

  it("returns null for office view", () => {
    expect(getFilteredAgentIds("office", null, projects)).toBeNull();
  });

  it("returns null for projects overview", () => {
    expect(getFilteredAgentIds("projects", null, projects)).toBeNull();
  });

  it("returns null for sessions overview", () => {
    expect(getFilteredAgentIds("sessions", null, projects)).toBeNull();
  });

  it("returns Set of agent ids for project view", () => {
    const result = getFilteredAgentIds("project", "proj-1", projects);
    expect(result).toEqual(new Set(["a1", "a2", "a3"]));
  });

  it("returns Set of agent ids for session view", () => {
    const result = getFilteredAgentIds("session", "sess-1", projects);
    expect(result).toEqual(new Set(["a1", "a2"]));
  });

  it("returns empty Set for unknown session", () => {
    const result = getFilteredAgentIds("session", "nonexistent", projects);
    expect(result).toEqual(new Set());
  });
});

describe("groupAgentsBySessionId", () => {
  it("groups agents from multiple projects by sessionId", () => {
    const projects: ProjectGroup[] = [
      makeProject({
        key: "p1",
        agents: [
          makeAgent({ id: "a1", number: 1, sessionId: "s1" }),
          makeAgent({ id: "a2", number: 2, sessionId: "s2" }),
        ],
      }),
      makeProject({
        key: "p2",
        agents: [
          makeAgent({ id: "a3", number: 3, sessionId: "s1" }),
        ],
      }),
    ];
    const result = groupAgentsBySessionId(projects);
    expect(result.get("s1")!.map((a) => a.id)).toEqual(["a1", "a3"]);
    expect(result.get("s2")!.map((a) => a.id)).toEqual(["a2"]);
  });

  it("skips agents without sessionId", () => {
    const agentNoSession = makeAgent({ id: "x", number: 1 });
    delete (agentNoSession as Record<string, unknown>).sessionId;
    const result = groupAgentsBySessionId([
      makeProject({ key: "p", agents: [agentNoSession] }),
    ]);
    expect(result.size).toBe(0);
  });
});
