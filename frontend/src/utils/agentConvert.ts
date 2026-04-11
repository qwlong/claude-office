import type { AgentAnimationState } from "@/stores/gameStore";
import type { Agent } from "@/types/generated";

/**
 * Convert an AgentAnimationState (frontend animation model) to an Agent
 * (backend data model) for use in ProjectGroup rooms and session rooms.
 */
export function animationStateToAgent(agent: AgentAnimationState): Agent {
  return {
    id: agent.id,
    agentType: agent.agentType,
    name: agent.name ?? undefined,
    color: agent.color,
    number: agent.number,
    state: agent.backendState,
    desk: agent.desk ?? undefined,
    currentTask: agent.currentTask ?? undefined,
    sessionId: agent.sessionId ?? undefined,
    bubble: agent.bubble?.content ?? undefined,
  };
}
