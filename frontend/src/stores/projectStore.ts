"use client";

import { create } from "zustand";
import type {
  ViewMode,
  ProjectGroup,
  MultiProjectGameState,
} from "@/types/projects";

interface ProjectStoreState {
  // State
  viewMode: ViewMode;
  previousViewMode: ViewMode | null;
  activeRoomKey: string | null;
  projects: ProjectGroup[];
  lastUpdated: string | null;

  // Actions
  setViewMode: (mode: ViewMode) => void;
  setActiveRoom: (key: string | null) => void;
  zoomToRoom: (key: string) => void;
  zoomToOverview: () => void;
  goBackToMultiRoom: () => void;
  updateFromServer: (state: MultiProjectGameState) => void;
}

export const useProjectStore = create<ProjectStoreState>((set) => ({
  viewMode: "all-merged",
  previousViewMode: null,
  activeRoomKey: null,
  projects: [],
  lastUpdated: null,

  setViewMode: (mode) =>
    set((state) => ({
      previousViewMode: state.viewMode,
      viewMode: mode,
    })),

  setActiveRoom: (key) => set({ activeRoomKey: key }),

  zoomToRoom: (key) => set({ viewMode: "room-detail", activeRoomKey: key }),

  zoomToOverview: () => set({ viewMode: "overview", activeRoomKey: null }),

  goBackToMultiRoom: () =>
    set((state) => ({
      viewMode: state.previousViewMode ?? "overview",
      previousViewMode: null,
      activeRoomKey: null,
    })),

  updateFromServer: (state) =>
    set({
      projects: state.projects,
      lastUpdated: state.lastUpdated,
    }),
}));

// Selectors
export const selectViewMode = (s: ProjectStoreState) => s.viewMode;
export const selectActiveRoomKey = (s: ProjectStoreState) => s.activeRoomKey;
export const selectProjects = (s: ProjectStoreState) => s.projects;
export const selectActiveProject = (s: ProjectStoreState) =>
  s.projects.find((p) => p.key === s.activeRoomKey) ?? null;
export const selectPreviousViewMode = (s: ProjectStoreState) =>
  s.previousViewMode;
