import type { EventLogEntry } from "@/stores/gameStore";
import type { ConversationEntry } from "@/types";

/**
 * Filter events by a set of agent IDs.
 * Returns the original array reference when agentIds is null (no filtering).
 */
export function filterEvents(
  events: EventLogEntry[],
  agentIds: Set<string> | null,
): EventLogEntry[] {
  if (!agentIds) return events;
  return events.filter((e) => agentIds.has(e.agentId));
}

/**
 * Filter conversation entries by a set of agent IDs.
 * Returns the original array reference when agentIds is null (no filtering).
 */
export function filterConversation(
  conversation: ConversationEntry[],
  agentIds: Set<string> | null,
): ConversationEntry[] {
  if (!agentIds) return conversation;
  return conversation.filter((c) => agentIds.has(c.agentId));
}
