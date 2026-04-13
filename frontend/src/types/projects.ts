/**
 * Types for multi-project office state.
 * Matches backend models in app/models/projects.py.
 */

import type { Agent, Boss, OfficeState, TodoItem } from "./generated";

export type ViewMode =
  | "office"
  | "projects"
  | "project"
  | "sessions"
  | "session";

export interface ProjectGroup {
  key: string;
  name: string;
  color: string;
  root: string | null;
  agents: Agent[];
  boss: Boss;
  sessionCount: number;
  todos: TodoItem[];
}

export interface MultiProjectGameState {
  sessionId: string;
  projects: ProjectGroup[];
  office: OfficeState;
  lastUpdated: string;
}

/**
 * Short display name: last directory segment from root path.
 * Falls back to stripping "Projects-" prefix from name when root is missing.
 */
export function getProjectDisplayName(project: { name: string; root: string | null }): string {
  if (project.root) {
    const segments = project.root.replace(/\/+$/, "").split("/");
    const last = segments[segments.length - 1];
    if (last) return last;
  }
  const name = project.name;
  if (name.startsWith("Projects-")) return name.slice("Projects-".length);
  return name;
}

export interface ProjectSummary {
  key: string;
  name: string;
  color: string;
  root: string | null;
  sessionCount: number;
}
