import { describe, it, expect, beforeEach } from "vitest";
import { useTaskStore, selectTasksByProject, selectActiveTaskCount } from "../src/stores/taskStore";
import type { TasksUpdate, Task } from "../src/types/tasks";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    externalSessionId: "ao-1",
    adapterType: "ao",
    projectKey: "my-project",
    issue: "#42 Fix bug",
    status: "working",
    prUrl: null,
    prNumber: null,
    ciStatus: null,
    reviewStatus: null,
    officeSessionId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    worktreePath: null,
    ...overrides,
  };
}

describe("taskStore", () => {
  beforeEach(() => {
    useTaskStore.setState({
      connected: false,
      adapterType: null,
      tasks: [],
      drawerOpen: false,
      drawerHeight: 250,
    });
  });

  it("updates from server", () => {
    const update: TasksUpdate = {
      connected: true,
      adapterType: "ao",
      tasks: [makeTask()],
    };
    useTaskStore.getState().updateFromServer(update);

    const state = useTaskStore.getState();
    expect(state.connected).toBe(true);
    expect(state.adapterType).toBe("ao");
    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0].projectKey).toBe("my-project");
  });

  it("toggles drawer", () => {
    expect(useTaskStore.getState().drawerOpen).toBe(false);
    useTaskStore.getState().toggleDrawer();
    expect(useTaskStore.getState().drawerOpen).toBe(true);
    useTaskStore.getState().toggleDrawer();
    expect(useTaskStore.getState().drawerOpen).toBe(false);
  });

  it("sets drawer height", () => {
    useTaskStore.getState().setDrawerHeight(400);
    expect(useTaskStore.getState().drawerHeight).toBe(400);
  });

  it("groups tasks by project", () => {
    const update: TasksUpdate = {
      connected: true,
      adapterType: "ao",
      tasks: [
        makeTask({ id: "t1", projectKey: "proj-a" }),
        makeTask({ id: "t2", projectKey: "proj-b" }),
        makeTask({ id: "t3", projectKey: "proj-a" }),
      ],
    };
    useTaskStore.getState().updateFromServer(update);

    const grouped = selectTasksByProject(useTaskStore.getState());
    expect(Object.keys(grouped)).toHaveLength(2);
    expect(grouped["proj-a"]).toHaveLength(2);
    expect(grouped["proj-b"]).toHaveLength(1);
  });

  it("counts active tasks", () => {
    const update: TasksUpdate = {
      connected: true,
      adapterType: "ao",
      tasks: [
        makeTask({ id: "t1", status: "working" }),
        makeTask({ id: "t2", status: "merged" }),
        makeTask({ id: "t3", status: "spawning" }),
        makeTask({ id: "t4", status: "done" }),
      ],
    };
    useTaskStore.getState().updateFromServer(update);
    expect(selectActiveTaskCount(useTaskStore.getState())).toBe(2);
  });
});
