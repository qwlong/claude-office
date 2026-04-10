"use client";

import { create } from "zustand";
import type { Task, TasksUpdate } from "../types/tasks";
import { ACTIVE_TASK_STATUSES } from "../types/tasks";

interface TaskStoreState {
  // State
  connected: boolean;
  adapterType: string | null;
  tasks: Task[];
  drawerOpen: boolean;
  drawerHeight: number;

  // Actions
  updateFromServer: (data: TasksUpdate) => void;
  toggleDrawer: () => void;
  setDrawerHeight: (h: number) => void;
  openDrawer: () => void;
  closeDrawer: () => void;
}

export const useTaskStore = create<TaskStoreState>((set) => ({
  connected: false,
  adapterType: null,
  tasks: [],
  drawerOpen: false,
  drawerHeight: 250,

  updateFromServer: (data) =>
    set({
      connected: data.connected,
      adapterType: data.adapterType,
      tasks: data.tasks,
    }),

  toggleDrawer: () => set((s) => ({ drawerOpen: !s.drawerOpen })),
  setDrawerHeight: (h) => set({ drawerHeight: h }),
  openDrawer: () => set({ drawerOpen: true }),
  closeDrawer: () => set({ drawerOpen: false }),
}));

// Derived selectors (computed from state)
export const selectTasks = (s: TaskStoreState) => s.tasks;
export const selectConnected = (s: TaskStoreState) => s.connected;
export const selectDrawerOpen = (s: TaskStoreState) => s.drawerOpen;
export const selectDrawerHeight = (s: TaskStoreState) => s.drawerHeight;

export const selectTasksByProject = (
  s: TaskStoreState,
): Record<string, Task[]> => {
  const grouped: Record<string, Task[]> = {};
  for (const task of s.tasks) {
    if (!grouped[task.projectKey]) grouped[task.projectKey] = [];
    grouped[task.projectKey].push(task);
  }
  return grouped;
};

export const selectActiveTaskCount = (s: TaskStoreState): number =>
  s.tasks.filter((t) => (ACTIVE_TASK_STATUSES as string[]).includes(t.status))
    .length;
