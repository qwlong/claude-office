import { describe, expect, it } from "vitest";
import { getReadyPosition } from "../src/machines/positionHelpers";

describe("getReadyPosition with offset", () => {
  it("returns base position for index 0", () => {
    const pos = getReadyPosition("arrival", 0);
    expect(pos.x).toBe(480); // A0 position
    expect(pos.y).toBe(930);
  });

  it("offsets second agent to the left", () => {
    const pos0 = getReadyPosition("arrival", 0);
    const pos1 = getReadyPosition("arrival", 1);
    expect(pos1.x).toBeLessThan(pos0.x); // Further left
    expect(pos1.y).toBe(pos0.y); // Same y
  });

  it("offsets third agent even further", () => {
    const pos1 = getReadyPosition("arrival", 1);
    const pos2 = getReadyPosition("arrival", 2);
    expect(pos2.x).toBeLessThan(pos1.x);
  });

  it("departure offsets to the right", () => {
    const pos0 = getReadyPosition("departure", 0);
    const pos1 = getReadyPosition("departure", 1);
    expect(pos1.x).toBeGreaterThan(pos0.x); // Further right
  });
});
