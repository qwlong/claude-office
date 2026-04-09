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
 * Filter agents based on the current view mode and active room key.
 * Returns null when the caller should use gameStore agents instead.
 */
export function getFilteredAgents(
  viewMode: ViewMode,
  activeRoomKey: string | null,
  projects: ProjectGroup[],
): Agent[] | null {
  if (viewMode === "project" && activeRoomKey) {
    const project = projects.find((p) => p.key === activeRoomKey);
    return [...(project?.agents ?? [])].sort((a, b) => a.number - b.number);
  }
  if (viewMode === "session" && activeRoomKey) {
    const bySession = groupAgentsBySessionId(projects);
    return (bySession.get(activeRoomKey) ?? []).sort((a, b) => a.number - b.number);
  }
  return null;
}

/**
 * Get the set of agent IDs for the current view.
 * Returns null when no filtering needed (show all agents).
 */
export function getFilteredAgentIds(
  viewMode: ViewMode,
  activeRoomKey: string | null,
  projects: ProjectGroup[],
): Set<string> | null {
  if (viewMode === "project" && activeRoomKey) {
    const project = projects.find((p) => p.key === activeRoomKey);
    return new Set((project?.agents ?? []).map((a) => a.id));
  }
  if (viewMode === "session" && activeRoomKey) {
    const bySession = groupAgentsBySessionId(projects);
    return new Set((bySession.get(activeRoomKey) ?? []).map((a) => a.id));
  }
  return null;
}
