import type { EventLogEntry } from "@/stores/gameStore";
import type { ConversationEntry } from "@/types";

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
  conversation: ConversationEntry[],
  sessionIds: Set<string> | null,
): ConversationEntry[] {
  if (!sessionIds) return conversation;
  return conversation.filter((c) => {
    const sid = (c as Record<string, unknown>).sessionId;
    return typeof sid === "string" && sessionIds.has(sid);
  });
}
