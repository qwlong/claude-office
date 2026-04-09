import type { Agent } from "@/types/generated";
import type { ProjectGroup, ViewMode } from "@/types/projects";

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
    const matched: Agent[] = [];
    for (const project of projects) {
      for (const agent of project.agents) {
        const sid = String((agent as Record<string, unknown>).sessionId ?? "");
        if (sid === activeRoomKey) matched.push(agent);
      }
    }
    return matched.sort((a, b) => a.number - b.number);
  }
  return null;
}
