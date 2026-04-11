import { useMemo } from "react";
import {
  useGameStore,
  selectAgents,
  selectEventLog,
  selectConversation,
  selectBoss,
  selectBosses,
  selectTodos,
  selectGitStatus,
  selectGitStatusMap,
} from "@/stores/gameStore";
import type { GitStatus } from "@/types";
import type {
  AgentAnimationState,
  BossAnimationState,
} from "@/stores/gameStore";
import {
  useProjectStore,
  selectViewMode,
  selectActiveRoomKey,
  selectSessions,
} from "@/stores/projectStore";
import { useShallow } from "zustand/react/shallow";
import { getFilteredSessionIds } from "@/utils/agentFilter";
import { filterEvents, filterConversation } from "@/utils/filterHelpers";

/**
 * Hook: returns filtered agents, events, conversation, and boss for the current viewMode.
 *
 * With unified data source (__all__ WebSocket), gameStore contains agents from
 * ALL sessions. Filtering by sessionIds is sufficient — no fallback needed.
 *
 * Filtering rules:
 * - office/projects/sessions: returns all data (no filtering)
 * - project: sessionIds = all sessions in that project
 * - session: sessionIds = that single session
 */
export function useFilteredData() {
  const viewMode = useProjectStore(selectViewMode);
  const activeRoomKey = useProjectStore(selectActiveRoomKey);
  const projects = useProjectStore((s) => s.projects);
  const storeSessions = useProjectStore(selectSessions);
  const gameAgents = useGameStore(useShallow(selectAgents));
  const gameBoss = useGameStore(selectBoss);
  const gameBosses = useGameStore(selectBosses);
  const allEvents = useGameStore(selectEventLog);
  const allConversation = useGameStore(selectConversation);
  const allTodos = useGameStore(selectTodos);
  const globalGitStatus = useGameStore(selectGitStatus);
  const gitStatusMap = useGameStore(selectGitStatusMap);

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
    return all.filter((a) => a.sessionId && sessionIds.has(a.sessionId));
  }, [gameAgents, sessionIds]);

  const boss = useMemo((): BossAnimationState => {
    // In project/session view, find the boss from filtered bosses
    if (sessionIds && sessionIds.size > 0) {
      const filteredBosses = Array.from(gameBosses.values()).filter(
        (b) => b.sessionId && sessionIds.has(b.sessionId),
      );
      if (filteredBosses.length > 0) {
        // Return the most active boss (non-idle first)
        const active = filteredBosses.find((b) => b.backendState !== "idle");
        return active ?? filteredBosses[0];
      }
      // No matching boss in gameBosses — return idle boss, not a random session's boss
      return {
        ...gameBoss,
        backendState: "idle",
        currentTask: null,
        bubble: { content: null, displayStartTime: null, queue: [] },
        isTyping: false,
      };
    }
    return gameBoss;
  }, [sessionIds, gameBoss, gameBosses]);

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

  const todos = useMemo(() => {
    if (!sessionIds) return allTodos;
    return allTodos.filter(
      (t: Record<string, unknown>) =>
        t.sessionId && sessionIds.has(t.sessionId as string),
    );
  }, [allTodos, sessionIds]);

  const gitStatus = useMemo((): GitStatus | null => {
    if (!sessionIds) return globalGitStatus;
    // Return the first matching session's git status
    for (const [sid, status] of gitStatusMap) {
      if (sessionIds.has(sid)) return status;
    }
    return null;
  }, [sessionIds, globalGitStatus, gitStatusMap]);

  return { agents, boss, bosses, events, conversation, sessionIds, todos, gitStatus };
}
