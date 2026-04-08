/** Standard room dimensions (scaled-down office) */
export const ROOM_WIDTH = 640;
export const ROOM_HEIGHT = 512;

/** Gap between rooms in grid */
export const ROOM_GAP = 16;

/** Max columns in overview grid */
export const ROOM_GRID_COLS = 2;

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

/** Calculate grid dimensions for N rooms */
export function getRoomGridSize(roomCount: number) {
  const cols = Math.min(roomCount, ROOM_GRID_COLS);
  const rows = Math.ceil(roomCount / ROOM_GRID_COLS);
  return {
    cols,
    rows,
    width: cols * ROOM_WIDTH + (cols - 1) * ROOM_GAP,
    height: rows * ROOM_HEIGHT + (rows - 1) * ROOM_GAP,
  };
}
