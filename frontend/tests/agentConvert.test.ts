import { describe, expect, it } from "vitest";
import { animationStateToAgent } from "../src/utils/agentConvert";
import type { AgentAnimationState } from "../src/stores/gameStore";

function makeAnimState(
  overrides: Partial<AgentAnimationState>,
): AgentAnimationState {
  return {
    id: "test-agent",
    agentType: "subagent",
    name: "Test Agent",
    color: "#ff0000",
    number: 1,
    desk: 2,
    backendState: "working",
    currentTask: "Fix bug",
    phase: "idle",
    currentPosition: { x: 100, y: 200 },
    targetPosition: { x: 100, y: 200 },
    path: null,
    bubble: { content: null, displayStartTime: null, queue: [] },
    queueType: null,
    queueIndex: -1,
    sessionId: "sess-1",
    isTyping: false,
    ...overrides,
  };
}

describe("animationStateToAgent", () => {
  it("converts basic fields correctly", () => {
    const anim = makeAnimState({});
    const agent = animationStateToAgent(anim);
    expect(agent.id).toBe("test-agent");
    expect(agent.agentType).toBe("subagent");
    expect(agent.name).toBe("Test Agent");
    expect(agent.color).toBe("#ff0000");
    expect(agent.number).toBe(1);
    expect(agent.state).toBe("working");
    expect(agent.desk).toBe(2);
    expect(agent.currentTask).toBe("Fix bug");
    expect(agent.sessionId).toBe("sess-1");
  });

  it("handles null fields as undefined", () => {
    const anim = makeAnimState({ name: null, desk: null, sessionId: null });
    const agent = animationStateToAgent(anim);
    expect(agent.name).toBeUndefined();
    expect(agent.desk).toBeUndefined();
    expect(agent.sessionId).toBeUndefined();
  });

  it("converts main agent type", () => {
    const anim = makeAnimState({ agentType: "main" });
    const agent = animationStateToAgent(anim);
    expect(agent.agentType).toBe("main");
  });

  it("converts bubble content", () => {
    const anim = makeAnimState({
      bubble: {
        content: { type: "speech", text: "hello", icon: "🔧" },
        displayStartTime: Date.now(),
        queue: [],
      },
    });
    const agent = animationStateToAgent(anim);
    expect(agent.bubble).toEqual({ type: "speech", text: "hello", icon: "🔧" });
  });

  it("converts null bubble to undefined", () => {
    const anim = makeAnimState({
      bubble: { content: null, displayStartTime: null, queue: [] },
    });
    const agent = animationStateToAgent(anim);
    expect(agent.bubble).toBeUndefined();
  });
});
