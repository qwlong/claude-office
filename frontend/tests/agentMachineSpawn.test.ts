import { describe, expect, it, vi } from "vitest";
import { createActor } from "xstate";
import { createAgentMachine } from "../src/machines/agentMachine";
import type { AgentMachineActions } from "../src/machines/agentMachineCommon";

function makeMockActions(): AgentMachineActions {
  return {
    onStartWalking: vi.fn(),
    onQueueJoined: vi.fn(),
    onQueueLeft: vi.fn(),
    onPhaseChanged: vi.fn(),
    onShowBossBubble: vi.fn(),
    onShowAgentBubble: vi.fn(),
    onClearBossBubble: vi.fn(),
    onClearAgentBubble: vi.fn(),
    onSetBossInUse: vi.fn(),
    onOpenElevator: vi.fn(),
    onCloseElevator: vi.fn(),
    onAgentRemoved: vi.fn(),
  };
}

describe("SPAWN_WALK_TO_DESK", () => {
  it("transitions to walking_to_desk_direct on SPAWN_WALK_TO_DESK", () => {
    const actions = makeMockActions();
    const machine = createAgentMachine(actions);
    const actor = createActor(machine);
    actor.start();

    actor.send({
      type: "SPAWN_WALK_TO_DESK",
      agentId: "a1",
      name: "Test Agent",
      desk: 1,
      position: { x: 56, y: 190 },
    });

    const snap = actor.getSnapshot();
    expect(snap.value).toBe("walking_to_desk_direct");
    expect(snap.context.agentId).toBe("a1");
    expect(snap.context.desk).toBe(1);
    expect(actions.onPhaseChanged).toHaveBeenCalledWith("a1", "walking_to_desk");
    expect(actions.onOpenElevator).toHaveBeenCalled();
    expect(actions.onStartWalking).toHaveBeenCalledWith("a1", { x: 56, y: 190 }, "to_desk");
  });

  it("transitions to idle on ARRIVED_AT_DESK", () => {
    const actions = makeMockActions();
    const machine = createAgentMachine(actions);
    const actor = createActor(machine);
    actor.start();

    actor.send({
      type: "SPAWN_WALK_TO_DESK",
      agentId: "a1",
      name: "Test",
      desk: 2,
      position: { x: 56, y: 190 },
    });
    actor.send({ type: "ARRIVED_AT_DESK" });

    expect(actor.getSnapshot().value).toBe("idle");
    expect(actions.onPhaseChanged).toHaveBeenCalledWith("a1", "idle");
  });

  it("agent at any queueIndex can advance on BOSS_AVAILABLE (parallel boss)", () => {
    const actions = makeMockActions();
    const machine = createAgentMachine(actions);
    const actor = createActor(machine);
    actor.start();

    // Spawn agent via normal arrival
    actor.send({
      type: "SPAWN",
      agentId: "a2",
      name: "Agent 2",
      desk: 2,
      position: { x: 56, y: 190 },
    });
    // Simulate being in queue at index 1 (not front)
    actor.send({ type: "ARRIVED_AT_QUEUE" });
    expect(actor.getSnapshot().value).toEqual({ arrival: "in_queue" });

    // Update queue index to 1 (second in line)
    actor.send({ type: "QUEUE_POSITION_CHANGED", newIndex: 1 });

    // BOSS_AVAILABLE should still advance — no guard blocking
    actor.send({ type: "BOSS_AVAILABLE" });
    expect(actor.getSnapshot().value).toEqual({ arrival: "walking_to_ready" });
  });

  it("can depart after arriving via SPAWN_WALK_TO_DESK", () => {
    const actions = makeMockActions();
    const machine = createAgentMachine(actions);
    const actor = createActor(machine);
    actor.start();

    // Arrive directly
    actor.send({
      type: "SPAWN_WALK_TO_DESK",
      agentId: "a1",
      name: "Test",
      desk: 1,
      position: { x: 0, y: 0 },
    });
    actor.send({ type: "ARRIVED_AT_DESK" });
    expect(actor.getSnapshot().value).toBe("idle");

    // Trigger departure
    actor.send({ type: "REMOVE" });
    const snap = actor.getSnapshot();
    expect(snap.value).toEqual({ departure: "departing" });
  });
});
