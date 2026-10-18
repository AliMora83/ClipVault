// Pure layout math for the popup, kept separate from Electron so it can be unit-tested.

const EDGE_MARGIN = 8;
const CURSOR_OFFSET_Y = 40;

/**
 * Top-left position for a window of `size`, centred on the cursor horizontally,
 * just below it vertically, and kept fully inside `workArea`.
 * @param {{ x: number, y: number }} cursor
 * @param {{ x: number, y: number, width: number, height: number }} workArea
 * @param {{ width: number, height: number }} size
 */
export function placeNear(cursor, workArea, size, margin = EDGE_MARGIN) {
  const clamp = (v, min, max) => Math.round(Math.min(Math.max(v, min), max));
  return {
    x: clamp(cursor.x - size.width / 2, workArea.x + margin, workArea.x + workArea.width - size.width - margin),
    y: clamp(cursor.y - CURSOR_OFFSET_Y, workArea.y + margin, workArea.y + workArea.height - size.height - margin),
  };
}
