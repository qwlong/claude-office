/**
 * Types for orchestrated tasks.
 * Matches backend models in app/models/tasks.py.
 */

export type TaskStatus =
  | "spawning"
  | "working"
  | "idle"
  | "blocked"
  | "pr_open"
  | "ci_failed"
  | "review_pending"
  | "changes_requested"
  | "approved"
  | "merged"
  | "done"
  | "error";

export interface Task {
  id: string;
  externalSessionId: string;
  adapterType: string;
  projectKey: string;
  issue: string | null;
  status: TaskStatus;
  prUrl: string | null;
  prNumber: number | null;
  ciStatus: string | null;
  reviewStatus: string | null;
  worktreePath: string | null;
  officeSessionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TasksUpdate {
  connected: boolean;
  adapterType: string | null;
  tasks: Task[];
}

/** Active statuses (not terminal). */
export const ACTIVE_TASK_STATUSES: TaskStatus[] = [
  "spawning",
  "working",
  "idle",
  "blocked",
  "pr_open",
  "ci_failed",
  "review_pending",
  "changes_requested",
];
