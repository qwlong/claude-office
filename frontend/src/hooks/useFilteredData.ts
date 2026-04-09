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
} from "@/stores/projectStore";
import { useShallow } from "zustand/react/shallow";
import { getFilteredAgentIds } from "@/utils/agentFilter";
import { filterEvents, filterConversation } from "@/utils/filterHelpers";

/**
 * Hook: returns filtered agents, events, and conversation for the current viewMode.
 *
 * - office/projects/sessions: returns all data (no filtering)
 * - project: returns data for agents in the selected project
 * - session: returns data for agents in the selected session
 *
 * Agents come from gameStore (preserving animation state).
 * Filtering is based on agentIds derived from projectStore.
 */
export function useFilteredData() {
  const viewMode = useProjectStore(selectViewMode);
  const activeRoomKey = useProjectStore(selectActiveRoomKey);
  const projects = useProjectStore((s) => s.projects);
  const gameAgents = useGameStore(useShallow(selectAgents));
  const allEvents = useGameStore(selectEventLog);
  const allConversation = useGameStore(selectConversation);

  const agentIds = useMemo(
    () => getFilteredAgentIds(viewMode, activeRoomKey, projects),
    [viewMode, activeRoomKey, projects],
  );

  const agents = useMemo((): AgentAnimationState[] => {
    const all = Array.from(gameAgents.values()).sort(
      (a, b) => a.number - b.number,
    );
    if (!agentIds) return all;
    return all.filter((a) => agentIds.has(a.id));
  }, [gameAgents, agentIds]);

  const events = useMemo(
    () => filterEvents(allEvents, agentIds),
    [allEvents, agentIds],
  );

  const conversation = useMemo(
    () => filterConversation(allConversation, agentIds),
    [allConversation, agentIds],
  );

  return { agents, events, conversation, agentIds };
}
