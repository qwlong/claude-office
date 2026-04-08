import { describe, expect, it, beforeEach } from "vitest";
import {
  useProjectStore,
  selectViewMode,
  selectActiveRoomKey,
  selectProjects,
  selectActiveProject,
} from "../src/stores/projectStore";
import type {
  MultiProjectGameState,
  ProjectGroup,
} from "../src/types/projects";

function makeProject(key: string, agentCount = 0): ProjectGroup {
  return {
    key,
    name: key,
    color: "#3B82F6",
    root: `/${key}`,
    agents: Array.from({ length: agentCount }, (_, i) => ({
      id: `${key}-a${i}`,
      name: `Agent ${i}`,
      color: "#fff",
      number: i + 1,
      state: "working" as const,
      desk: i + 1,
    })),
    boss: {
      state: "idle" as const,
      currentTask: null,
      bubble: null,
      position: { x: 640, y: 830 },
    },
    sessionCount: 1,
    todos: [],
  };
}

describe("projectStore", () => {
  beforeEach(() => {
    useProjectStore.setState({
      viewMode: "all-merged",
      activeRoomKey: null,
      projects: [],
      lastUpdated: null,
    });
  });

  describe("initial state", () => {
    it("starts with all-merged view mode", () => {
      expect(selectViewMode(useProjectStore.getState())).toBe("all-merged");
    });

    it("starts with no active room", () => {
      expect(selectActiveRoomKey(useProjectStore.getState())).toBeNull();
    });

    it("starts with empty projects", () => {
      expect(selectProjects(useProjectStore.getState())).toEqual([]);
    });
  });

  describe("setViewMode", () => {
    it("changes view mode to overview", () => {
      useProjectStore.getState().setViewMode("overview");
      expect(selectViewMode(useProjectStore.getState())).toBe("overview");
    });

    it("changes view mode to room-detail", () => {
      useProjectStore.getState().setViewMode("room-detail");
      expect(selectViewMode(useProjectStore.getState())).toBe("room-detail");
    });
  });

  describe("zoomToRoom", () => {
    it("sets view mode to room-detail and active room key", () => {
      useProjectStore.getState().zoomToRoom("proj-a");
      const state = useProjectStore.getState();
      expect(selectViewMode(state)).toBe("room-detail");
      expect(selectActiveRoomKey(state)).toBe("proj-a");
    });
  });

  describe("zoomToOverview", () => {
    it("sets view mode to overview and clears active room", () => {
      useProjectStore.getState().zoomToRoom("proj-a");
      useProjectStore.getState().zoomToOverview();
      const state = useProjectStore.getState();
      expect(selectViewMode(state)).toBe("overview");
      expect(selectActiveRoomKey(state)).toBeNull();
    });
  });

  describe("updateFromServer", () => {
    it("updates projects from server state", () => {
      const serverState: MultiProjectGameState = {
        sessionId: "__all__",
        projects: [makeProject("proj-a", 2), makeProject("proj-b", 1)],
        office: {
          deskCount: 8,
          elevatorState: "closed",
          phoneState: "idle",
          contextUtilization: 0,
          toolUsesSinceCompaction: 0,
          printReport: false,
        },
        lastUpdated: "2026-04-08T10:00:00Z",
      };

      useProjectStore.getState().updateFromServer(serverState);
      const state = useProjectStore.getState();
      expect(state.projects).toHaveLength(2);
      expect(state.projects[0].key).toBe("proj-a");
      expect(state.lastUpdated).toBe("2026-04-08T10:00:00Z");
    });
  });

  describe("selectActiveProject", () => {
    it("returns null when no active room", () => {
      expect(selectActiveProject(useProjectStore.getState())).toBeNull();
    });

    it("returns null when active room key does not match any project", () => {
      useProjectStore.setState({
        activeRoomKey: "nonexistent",
        projects: [makeProject("proj-a")],
      });
      expect(selectActiveProject(useProjectStore.getState())).toBeNull();
    });

    it("returns the matching project", () => {
      const proj = makeProject("proj-a", 3);
      useProjectStore.setState({
        activeRoomKey: "proj-a",
        projects: [proj, makeProject("proj-b")],
      });
      const active = selectActiveProject(useProjectStore.getState());
      expect(active).not.toBeNull();
      expect(active!.key).toBe("proj-a");
      expect(active!.agents).toHaveLength(3);
    });
  });
});
