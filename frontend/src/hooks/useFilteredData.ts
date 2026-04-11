import { useMemo } from "react";
import {
  useGameStore,
  selectAgents,
  selectEventLog,
  selectConversation,
  selectBoss,
  selectBosses,
} from "@/stores/gameStore";
import type {
  AgentAnimationState,
  BossAnimationState,
} from "@/stores/gameStore";
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
  const gameBosses = useGameStore(selectBosses);
  const allEvents = useGameStore(selectEventLog);
  const allConversation = useGameStore(selectConversation);

  const sessionIds = useMemo(
    () =>
      getFilteredSessionIds(viewMode, activeRoomKey, projects, storeSessions),
    [viewMode, activeRoomKey, projects, storeSessions],
  );

  const agents = useMemo((): AgentAnimationState[] => {
    const all = Array.from(gameAgents.values()).sort(
      (a, b) => a.number - b.number,
    );
    if (!sessionIds) return all;
    const filtered = all.filter(
      (a) => a.sessionId && sessionIds.has(a.sessionId),
    );

    // In project view, gameStore may not have agents for this project
    // (WebSocket is connected to a single session). Fall back to the
    // project's own agent list from the /ws/projects data.
    if (
      filtered.length === 0 &&
      viewMode === "project" &&
      activeProject?.agents?.length
    ) {
      return activeProject.agents
        .filter((a) => a.agentType !== "main")
        .map(
          (a, i): AgentAnimationState => ({
            id: a.id,
            agentType: "subagent",
            name: a.name ?? null,
            color: a.color,
            number: a.number ?? i + 1,
            desk: a.desk ?? null,
            backendState: a.state as AgentAnimationState["backendState"],
            currentTask: a.currentTask ?? null,
            phase: "idle",
            currentPosition: { x: a.position?.x ?? 0, y: a.position?.y ?? 0 },
            targetPosition: { x: a.position?.x ?? 0, y: a.position?.y ?? 0 },
            path: null,
            bubble: a.bubble
              ? {
                  content: a.bubble,
                  displayStartTime: Date.now(),
                  queue: [],
                }
              : { content: null, displayStartTime: null, queue: [] },
            queueType: null,
            queueIndex: -1,
            sessionId: a.sessionId ?? null,
            isTyping: false,
          }),
        );
    }

    return filtered;
  }, [gameAgents, sessionIds, viewMode, activeProject]);

  const boss = useMemo((): BossAnimationState => {
    if (viewMode === "project" && activeProject?.boss) {
      const projectBoss = activeProject.boss;
      // Build boss entirely from project data — don't spread gameBoss
      // which belongs to whatever session the WebSocket is connected to.
      return {
        backendState: projectBoss.state,
        position: gameBoss.position,
        currentTask: projectBoss.currentTask ?? null,
        bubble: projectBoss.bubble
          ? {
              content: projectBoss.bubble,
              displayStartTime: Date.now(),
              queue: [],
            }
          : { content: null, displayStartTime: null, queue: [] },
        inUseBy: null,
        isTyping: false,
        sessionId: gameBoss.sessionId,
        projectKey: gameBoss.projectKey,
        projectColor: gameBoss.projectColor,
      };
    }
    return gameBoss;
  }, [viewMode, activeProject, gameBoss]);

  const bosses = useMemo((): BossAnimationState[] => {
    const all = Array.from(gameBosses.values());
    if (!sessionIds) return all;
    return all.filter((b) => b.sessionId && sessionIds.has(b.sessionId));
  }, [gameBosses, sessionIds]);

  const events = useMemo(
    () => filterEvents(allEvents, sessionIds),
    [allEvents, sessionIds],
  );

  const conversation = useMemo(
    () => filterConversation(allConversation, sessionIds),
    [allConversation, sessionIds],
  );

  return { agents, boss, bosses, events, conversation, sessionIds };
}
