import { useMemo } from "react";
import {
  useGameStore,
  selectAgents,
  selectEventLog,
  selectConversation,
  selectBoss,
} from "@/stores/gameStore";
import type { AgentAnimationState, BossAnimationState } from "@/stores/gameStore";
import {
  useProjectStore,
  selectViewMode,
  selectActiveRoomKey,
  selectActiveProject,
  selectSessions,
} from "@/stores/projectStore";
import { useShallow } from "zustand/react/shallow";
import { getFilteredSessionIds } from "@/utils/agentFilter";
import { filterEvents, filterConversation } from "@/utils/filterHelpers";

/**
 * Hook: returns filtered agents, events, conversation, and boss for the current viewMode.
 *
 * All filtering is based on sessionIds:
 * - office/projects/sessions: returns all data (no filtering)
 * - project: sessionIds = all sessions in that project
 * - session: sessionIds = that single session
 *
 * Agents, events, and conversation are all filtered by sessionId.
 * Boss is overridden with the project-specific boss when viewing a project.
 */
export function useFilteredData() {
  const viewMode = useProjectStore(selectViewMode);
  const activeRoomKey = useProjectStore(selectActiveRoomKey);
  const activeProject = useProjectStore(selectActiveProject);
  const projects = useProjectStore((s) => s.projects);
  const storeSessions = useProjectStore(selectSessions);
  const gameAgents = useGameStore(useShallow(selectAgents));
  const gameBoss = useGameStore(selectBoss);
  const allEvents = useGameStore(selectEventLog);
  const allConversation = useGameStore(selectConversation);

  const sessionIds = useMemo(
    () => getFilteredSessionIds(viewMode, activeRoomKey, projects, storeSessions),
    [viewMode, activeRoomKey, projects, storeSessions],
  );

  const agents = useMemo((): AgentAnimationState[] => {
    const all = Array.from(gameAgents.values()).sort(
      (a, b) => a.number - b.number,
    );
    if (!sessionIds) return all;
    return all.filter((a) => a.sessionId && sessionIds.has(a.sessionId));
  }, [gameAgents, sessionIds]);

  const boss = useMemo((): BossAnimationState => {
    if (viewMode === "project" && activeProject?.boss) {
      const projectBoss = activeProject.boss;
      return {
        ...gameBoss,
        backendState: projectBoss.state,
        currentTask: projectBoss.currentTask ?? null,
        bubble: projectBoss.bubble
          ? { content: projectBoss.bubble, displayStartTime: Date.now(), queue: [] }
          : gameBoss.bubble,
      };
    }
    return gameBoss;
  }, [viewMode, activeProject, gameBoss]);

  const events = useMemo(
    () => filterEvents(allEvents, sessionIds),
    [allEvents, sessionIds],
  );

  const conversation = useMemo(
    () => filterConversation(allConversation, sessionIds),
    [allConversation, sessionIds],
  );

  return { agents, boss, events, conversation, sessionIds };
}
