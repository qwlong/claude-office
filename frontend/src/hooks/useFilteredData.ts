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
import { getFilteredAgentIds, getFilteredSessionIds } from "@/utils/agentFilter";
import { filterEvents, filterConversation } from "@/utils/filterHelpers";

/**
 * Hook: returns filtered agents, events, and conversation for the current viewMode.
 *
 * - office/projects/sessions: returns all data (no filtering)
 * - project: returns data for sessions in the selected project
 * - session: returns data for the selected session
 *
 * Agents come from gameStore (preserving animation state), filtered by agentIds.
 * Events/conversation are filtered by sessionId.
 */
export function useFilteredData() {
  const viewMode = useProjectStore(selectViewMode);
  const activeRoomKey = useProjectStore(selectActiveRoomKey);
  const projects = useProjectStore((s) => s.projects);
  const storeSessions = useProjectStore(selectSessions);
  const gameAgents = useGameStore(useShallow(selectAgents));
  const allEvents = useGameStore(selectEventLog);
  const allConversation = useGameStore(selectConversation);

  const agentIds = useMemo(
    () => getFilteredAgentIds(viewMode, activeRoomKey, projects),
    [viewMode, activeRoomKey, projects],
  );

  const sessionIds = useMemo(
    () => getFilteredSessionIds(viewMode, activeRoomKey, projects, storeSessions),
    [viewMode, activeRoomKey, projects, storeSessions],
  );

  const agents = useMemo((): AgentAnimationState[] => {
    const all = Array.from(gameAgents.values()).sort(
      (a, b) => a.number - b.number,
    );
    if (!agentIds) return all;
    return all.filter((a) => agentIds.has(a.id));
  }, [gameAgents, agentIds]);

  const events = useMemo(
    () => filterEvents(allEvents, sessionIds),
    [allEvents, sessionIds],
  );

  const conversation = useMemo(
    () => filterConversation(allConversation, sessionIds),
    [allConversation, sessionIds],
  );

  return { agents, events, conversation, agentIds, sessionIds };
}
