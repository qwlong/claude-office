import type { Agent } from "@/types/generated";
import type { ProjectGroup, ViewMode } from "@/types/projects";

/** Read sessionId from an Agent (not in generated type but present at runtime). */
function getSessionId(agent: Agent): string {
  return String((agent as Record<string, unknown>).sessionId ?? "");
}

/**
 * Group agents by sessionId across all projects.
 */
export function groupAgentsBySessionId(
  projects: ProjectGroup[],
): Map<string, Agent[]> {
  const map = new Map<string, Agent[]>();
  for (const project of projects) {
    for (const agent of project.agents) {
      const sid = getSessionId(agent);
      if (!sid) continue;
      if (!map.has(sid)) map.set(sid, []);
      map.get(sid)!.push(agent);
    }
  }
  return map;
}

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
