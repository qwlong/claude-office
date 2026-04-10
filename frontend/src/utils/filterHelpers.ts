import type { EventLogEntry } from "@/stores/gameStore";
import type { ConversationEntry } from "@/types";

/** ConversationEntry extended with sessionId injected by setConversation. */
export type ConversationEntryWithSession = ConversationEntry & {
  sessionId?: string;
};

/**
 * Filter events by a set of session IDs.
 * Returns the original array reference when sessionIds is null (no filtering).
 */
export function filterEvents(
  events: EventLogEntry[],
  sessionIds: Set<string> | null,
): EventLogEntry[] {
  if (!sessionIds) return events;
  return events.filter((e) => e.sessionId && sessionIds.has(e.sessionId));
}

/**
 * Filter conversation entries by a set of session IDs.
 * Returns the original array reference when sessionIds is null (no filtering).
 */
export function filterConversation(
  conversation: ConversationEntryWithSession[],
  sessionIds: Set<string> | null,
): ConversationEntryWithSession[] {
  if (!sessionIds) return conversation;
  return conversation.filter((c) => c.sessionId && sessionIds.has(c.sessionId));
}
