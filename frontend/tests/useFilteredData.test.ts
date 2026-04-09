import { describe, expect, it } from "vitest";
import { filterEvents, filterConversation } from "../src/utils/filterHelpers";

describe("filterEvents", () => {
  const events = [
    { agentId: "a1", type: "pre_tool_use", summary: "test1" },
    { agentId: "a2", type: "session_start", summary: "test2" },
    { agentId: "a3", type: "pre_tool_use", summary: "test3" },
  ] as any[];

  it("returns same array reference when agentIds is null", () => {
    const result = filterEvents(events, null);
    expect(result).toBe(events);
  });

  it("filters events by agentId set", () => {
    const result = filterEvents(events, new Set(["a1", "a3"]));
    expect(result.map((e: any) => e.agentId)).toEqual(["a1", "a3"]);
  });

  it("returns empty array when no agents match", () => {
    expect(filterEvents(events, new Set(["unknown"]))).toEqual([]);
  });

  it("returns empty array for empty events with non-null filter", () => {
    expect(filterEvents([], new Set(["a1"]))).toEqual([]);
  });
});

describe("filterConversation", () => {
  const msgs = [
    { agentId: "a1", role: "assistant", text: "hello" },
    { agentId: "a2", role: "user", text: "hi" },
    { agentId: "a1", role: "tool", text: "result" },
  ] as any[];

  it("returns same array reference when agentIds is null", () => {
    const result = filterConversation(msgs, null);
    expect(result).toBe(msgs);
  });

  it("filters messages by agentId set", () => {
    const result = filterConversation(msgs, new Set(["a1"]));
    expect(result.map((m: any) => m.text)).toEqual(["hello", "result"]);
  });

  it("returns empty array when no agents match", () => {
    expect(filterConversation(msgs, new Set(["unknown"]))).toEqual([]);
  });
});
