import { describe, expect, it } from "vitest";
import { getFilteredSessionIds, groupAgentsBySessionId } from "../src/utils/agentFilter";
import type { Agent } from "../src/types/generated";
import type { ProjectGroup } from "../src/types/projects";

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

describe("getFilteredSessionIds", () => {
  const projects: ProjectGroup[] = [
    makeProject({ key: "proj-1", name: "My Project" }),
    makeProject({ key: "proj-2", name: "Other Project" }),
  ];

  const sessions = [
    { id: "sess-1", projectName: "My Project" },
    { id: "sess-2", projectName: "My Project" },
    { id: "sess-3", projectName: "Other Project" },
  ];

  it("returns null for office view", () => {
    expect(getFilteredSessionIds("office", null, projects, sessions)).toBeNull();
  });

  it("returns null for projects overview", () => {
    expect(getFilteredSessionIds("projects", null, projects, sessions)).toBeNull();
  });

  it("returns null for sessions overview", () => {
    expect(getFilteredSessionIds("sessions", null, projects, sessions)).toBeNull();
  });

  it("returns all session IDs for a project in project view", () => {
    expect(getFilteredSessionIds("project", "proj-1", projects, sessions)).toEqual(new Set(["sess-1", "sess-2"]));
  });

  it("returns single session ID in session view", () => {
    expect(getFilteredSessionIds("session", "sess-1", projects, sessions)).toEqual(new Set(["sess-1"]));
  });

  it("returns empty Set for unknown project", () => {
    expect(getFilteredSessionIds("project", "nonexistent", projects, sessions)).toEqual(new Set());
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
        agents: [makeAgent({ id: "a3", number: 3, sessionId: "s1" })],
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
