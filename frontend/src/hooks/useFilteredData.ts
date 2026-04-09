import { useMemo } from "react";
import {
  useGameStore,
  selectAgents,
  selectEventLog,
  selectConversation,
} from "@/stores/gameStore";
import type { AgentAnimationState } from "@/stores/gameStore";
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
 * Hook: returns filtered agents, events, and conversation for the current viewMode.
 *
 * All filtering is based on sessionIds:
 * - office/projects/sessions: returns all data (no filtering)
 * - project: sessionIds = all sessions in that project
 * - session: sessionIds = that single session
 *
 * Agents, events, and conversation are all filtered by sessionId.
 */
export function useFilteredData() {
  const viewMode = useProjectStore(selectViewMode);
  const activeRoomKey = useProjectStore(selectActiveRoomKey);
  const projects = useProjectStore((s) => s.projects);
  const storeSessions = useProjectStore(selectSessions);
  const gameAgents = useGameStore(useShallow(selectAgents));
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

  const events = useMemo(
    () => filterEvents(allEvents, sessionIds),
    [allEvents, sessionIds],
  );

  const conversation = useMemo(
    () => filterConversation(allConversation, sessionIds),
    [allConversation, sessionIds],
  );

  return { agents, events, conversation, sessionIds };
}
