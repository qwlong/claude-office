import { describe, expect, it } from "vitest";
import { filterEvents, filterConversation } from "../src/utils/filterHelpers";

describe("filterEvents", () => {
  const events = [
    { agentId: "main", type: "pre_tool_use", summary: "test1", sessionId: "s1" },
    { agentId: "main", type: "session_start", summary: "test2", sessionId: "s2" },
    { agentId: "main", type: "pre_tool_use", summary: "test3", sessionId: "s1" },
  ] as any[];

  it("returns same array reference when sessionIds is null", () => {
    const result = filterEvents(events, null);
    expect(result).toBe(events);
  });

  it("filters events by sessionId set", () => {
    const result = filterEvents(events, new Set(["s1"]));
    expect(result.map((e: any) => e.summary)).toEqual(["test1", "test3"]);
  });

  it("returns empty array when no sessions match", () => {
    expect(filterEvents(events, new Set(["unknown"]))).toEqual([]);
  });

  it("excludes events without sessionId", () => {
    const mixed = [
      { agentId: "main", summary: "no-session" },
      { agentId: "main", summary: "has-session", sessionId: "s1" },
    ] as any[];
    const result = filterEvents(mixed, new Set(["s1"]));
    expect(result.map((e: any) => e.summary)).toEqual(["has-session"]);
  });
});

describe("filterConversation", () => {
  const msgs = [
    { agentId: "main", role: "assistant", text: "hello", sessionId: "s1" },
    { agentId: "main", role: "user", text: "hi", sessionId: "s2" },
    { agentId: "main", role: "tool", text: "result", sessionId: "s1" },
  ] as any[];

  it("returns same array reference when sessionIds is null", () => {
    const result = filterConversation(msgs, null);
    expect(result).toBe(msgs);
  });

  it("filters messages by sessionId set", () => {
    const result = filterConversation(msgs, new Set(["s1"]));
    expect(result.map((m: any) => m.text)).toEqual(["hello", "result"]);
  });

  it("returns empty array when no sessions match", () => {
    expect(filterConversation(msgs, new Set(["unknown"]))).toEqual([]);
  });
});
