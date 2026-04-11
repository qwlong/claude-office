import type { ProjectGroup, ViewMode } from "@/types/projects";

/**
 * Get the set of session IDs for the current view.
 * Returns null when no filtering needed (show everything).
 */
export function getFilteredSessionIds(
  viewMode: ViewMode,
  activeRoomKey: string | null,
  projects: ProjectGroup[],
  sessions: { id: string; projectName: string | null; projectKey: string | null }[],
): Set<string> | null {
  if (viewMode === "project" && activeRoomKey) {
    const ids = new Set<string>();
    for (const s of sessions) {
      if (s.projectKey === activeRoomKey) ids.add(s.id);
    }
    return ids;
  }
  if (viewMode === "session" && activeRoomKey) {
    return new Set([activeRoomKey]);
  }
  return null;
}
