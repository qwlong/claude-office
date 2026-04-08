import { describe, expect, it } from "vitest";
import {
  getRoomGridSize,
  ROOM_WIDTH,
  ROOM_HEIGHT,
  ROOM_GAP,
  ROOM_GRID_COLS,
} from "../src/constants/rooms";

describe("getRoomGridSize", () => {
  it("returns 1 col 1 row for 1 room", () => {
    const size = getRoomGridSize(1);
    expect(size.cols).toBe(1);
    expect(size.rows).toBe(1);
    expect(size.width).toBe(ROOM_WIDTH);
    expect(size.height).toBe(ROOM_HEIGHT);
  });

  it("returns 2 cols 1 row for 2 rooms", () => {
    const size = getRoomGridSize(2);
    expect(size.cols).toBe(2);
    expect(size.rows).toBe(1);
    expect(size.width).toBe(2 * ROOM_WIDTH + ROOM_GAP);
    expect(size.height).toBe(ROOM_HEIGHT);
  });

  it("returns 2 cols 2 rows for 3 rooms", () => {
    const size = getRoomGridSize(3);
    expect(size.cols).toBe(2);
    expect(size.rows).toBe(2);
  });

  it("returns 2 cols 2 rows for 4 rooms", () => {
    const size = getRoomGridSize(4);
    expect(size.cols).toBe(2);
    expect(size.rows).toBe(2);
    expect(size.width).toBe(2 * ROOM_WIDTH + ROOM_GAP);
    expect(size.height).toBe(2 * ROOM_HEIGHT + ROOM_GAP);
  });

  it("returns 2 cols 3 rows for 6 rooms", () => {
    const size = getRoomGridSize(6);
    expect(size.cols).toBe(2);
    expect(size.rows).toBe(3);
  });

  it("never exceeds ROOM_GRID_COLS columns", () => {
    for (let n = 1; n <= 10; n++) {
      const size = getRoomGridSize(n);
      expect(size.cols).toBeLessThanOrEqual(ROOM_GRID_COLS);
    }
  });
});
