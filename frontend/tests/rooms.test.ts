import { describe, expect, it } from "vitest";
import {
  getRoomGridCols,
  getRoomGridSize,
  getMultiRoomCanvasSize,
  ROOM_WIDTH,
  ROOM_HEIGHT,
  ROOM_GAP,
  ROOM_GRID_COLS_MAX,
  ROOM_SCALE,
  SCALED_ROOM_W,
  SCALED_ROOM_H,
} from "../src/constants/rooms";

describe("getRoomGridCols", () => {
  it("returns count for 1-3 rooms", () => {
    expect(getRoomGridCols(1)).toBe(1);
    expect(getRoomGridCols(2)).toBe(2);
    expect(getRoomGridCols(3)).toBe(3);
  });

  it("prefers 2 rows for 4+ rooms", () => {
    expect(getRoomGridCols(4)).toBe(2); // 2+2
    expect(getRoomGridCols(5)).toBe(3); // 3+2
    expect(getRoomGridCols(6)).toBe(3); // 3+3
    expect(getRoomGridCols(7)).toBe(4); // 4+3
    expect(getRoomGridCols(8)).toBe(4); // 4+4
    expect(getRoomGridCols(9)).toBe(5); // 5+4
    expect(getRoomGridCols(10)).toBe(5); // 5+5
    expect(getRoomGridCols(11)).toBe(6); // 6+5
    expect(getRoomGridCols(12)).toBe(6); // 6+6
  });

  it("caps at 6 columns for 13+ rooms", () => {
    expect(getRoomGridCols(13)).toBe(6);
    expect(getRoomGridCols(20)).toBe(6);
    expect(getRoomGridCols(100)).toBe(6);
  });
});

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

  it("returns 3 cols 1 row for 3 rooms", () => {
    const size = getRoomGridSize(3);
    expect(size.cols).toBe(3);
    expect(size.rows).toBe(1);
  });

  it("returns 2 cols 2 rows for 4 rooms", () => {
    const size = getRoomGridSize(4);
    expect(size.cols).toBe(2);
    expect(size.rows).toBe(2);
    expect(size.width).toBe(2 * ROOM_WIDTH + ROOM_GAP);
    expect(size.height).toBe(2 * ROOM_HEIGHT + ROOM_GAP);
  });

  it("returns 3 cols 2 rows for 6 rooms", () => {
    const size = getRoomGridSize(6);
    expect(size.cols).toBe(3);
    expect(size.rows).toBe(2);
  });

  it("never exceeds ROOM_GRID_COLS_MAX columns", () => {
    for (let n = 1; n <= 20; n++) {
      const size = getRoomGridSize(n);
      expect(size.cols).toBeLessThanOrEqual(ROOM_GRID_COLS_MAX);
    }
  });
});

describe("getMultiRoomCanvasSize", () => {
  it("returns correct canvas size for 1 project", () => {
    const size = getMultiRoomCanvasSize(1);
    expect(size.cols).toBe(1);
    expect(size.rows).toBe(1);
    expect(size.width).toBeGreaterThan(0);
    expect(size.height).toBeGreaterThan(0);
  });

  it("returns wider canvas for 2 projects (2 cols)", () => {
    const size1 = getMultiRoomCanvasSize(1);
    const size2 = getMultiRoomCanvasSize(2);
    expect(size2.width).toBeGreaterThan(size1.width);
    expect(size2.height).toBe(size1.height); // same row
  });

  it("returns taller canvas for 4 projects (2 rows)", () => {
    const size3 = getMultiRoomCanvasSize(3);
    const size4 = getMultiRoomCanvasSize(4);
    expect(size4.height).toBeGreaterThan(size3.height);
  });

  it("ROOM_SCALE is 0.5", () => {
    expect(ROOM_SCALE).toBe(0.5);
  });

  it("SCALED_ROOM dimensions are half of ROOM dimensions", () => {
    expect(SCALED_ROOM_W).toBe(ROOM_WIDTH * ROOM_SCALE);
    expect(SCALED_ROOM_H).toBe(ROOM_HEIGHT * ROOM_SCALE);
  });
});
