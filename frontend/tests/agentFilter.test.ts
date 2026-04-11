import { describe, expect, it } from "vitest";
import { getFilteredSessionIds } from "../src/utils/agentFilter";
import type { ProjectGroup } from "../src/types/projects";

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
    { id: "sess-1", projectName: "My Project", projectKey: "proj-1" },
    { id: "sess-2", projectName: "My Project", projectKey: "proj-1" },
    { id: "sess-3", projectName: "Other Project", projectKey: "proj-2" },
  ];

  it("returns null for office view", () => {
    expect(
      getFilteredSessionIds("office", null, projects, sessions),
    ).toBeNull();
  });

  it("returns null for projects overview", () => {
    expect(
      getFilteredSessionIds("projects", null, projects, sessions),
    ).toBeNull();
  });

  it("returns null for sessions overview", () => {
    expect(
      getFilteredSessionIds("sessions", null, projects, sessions),
    ).toBeNull();
  });

  it("returns all session IDs for a project in project view", () => {
    expect(
      getFilteredSessionIds("project", "proj-1", projects, sessions),
    ).toEqual(new Set(["sess-1", "sess-2"]));
  });

  it("returns single session ID in session view", () => {
    expect(
      getFilteredSessionIds("session", "sess-1", projects, sessions),
    ).toEqual(new Set(["sess-1"]));
  });

  it("returns empty Set for unknown project", () => {
    expect(
      getFilteredSessionIds("project", "nonexistent", projects, sessions),
    ).toEqual(new Set());
  });
});
