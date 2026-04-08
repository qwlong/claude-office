/** Standard room dimensions (scaled-down office) */
export const ROOM_WIDTH = 640;
export const ROOM_HEIGHT = 512;

/** Gap between rooms in grid (corridor width) */
export const ROOM_GAP = 24;

/** Max columns in overview grid */
export const ROOM_GRID_COLS_MAX = 6;

/** Compute optimal column count: prefer 2 rows, max 6 cols */
export function getRoomGridCols(count: number): number {
  if (count <= 3) return count;
  return Math.min(Math.ceil(count / 2), ROOM_GRID_COLS_MAX);
}

/** Thumbnail size in overview mode */
export const THUMBNAIL_WIDTH = 300;
export const THUMBNAIL_HEIGHT = 200;

/** Room furniture positions (scaled from full office positions) */
export const ROOM_POSITIONS = {
  clock: { x: 48, y: 24 },
  whiteboard: { x: 200, y: 24 },
  safetySign: { x: 400, y: 24 },
  employeeOfMonth: { x: 120, y: 24 },
  cityWindow: { x: 520, y: 40 },
  waterCooler: { x: 40, y: 400 },
  bossDesk: { x: 280, y: 380 },
  deskGridOrigin: { x: 80, y: 140 },
  elevator: { x: 560, y: 200 },
} as const;

/** Scale factor for rooms in overview mode */
export const ROOM_SCALE = 0.5;

/** Scaled room dimensions */
export const SCALED_ROOM_W = ROOM_WIDTH * ROOM_SCALE; // 320
export const SCALED_ROOM_H = ROOM_HEIGHT * ROOM_SCALE; // 256

/** Calculate grid dimensions for N rooms */
export function getRoomGridSize(roomCount: number) {
  const cols = getRoomGridCols(roomCount);
  const rows = Math.ceil(roomCount / cols);
  return {
    cols,
    rows,
    width: cols * ROOM_WIDTH + (cols - 1) * ROOM_GAP,
    height: rows * ROOM_HEIGHT + (rows - 1) * ROOM_GAP,
  };
}

/** Room label height (rendered above each room) */
export const ROOM_LABEL_HEIGHT = 24;

/**
 * Calculate total canvas size needed for N rooms in PixiJS overview mode.
 * Uses the full office dimensions (CANVAS_WIDTH=1280, CANVAS_HEIGHT=1024)
 * scaled by ROOM_SCALE, plus gaps and label space.
 */
/** Label height inside the scaled container (full-scale pixels). */
const LABEL_H_FULL = 42;

export function getMultiRoomCanvasSize(
  projectCount: number,
  fullRoomHeight: number = 1126, // getCanvasHeight(8)=1066 + 60 for boss overflow
  fullRoomWidth: number = 1280,
) {
  const cols = getRoomGridCols(projectCount);
  const rows = Math.ceil(projectCount / cols);
  // Each cell = (room + label) * scale
  const cellW = fullRoomWidth * ROOM_SCALE;
  const cellH = (fullRoomHeight + LABEL_H_FULL) * ROOM_SCALE;
  const edgePad = ROOM_GAP;
  return {
    cols,
    rows,
    width: edgePad * 2 + cols * cellW + (cols - 1) * ROOM_GAP,
    height: edgePad * 2 + rows * cellH + (rows - 1) * ROOM_GAP,
  };
}
