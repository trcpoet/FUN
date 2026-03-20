/**
 * Rasterize emoji into ImageData so Mapbox `symbol` layers can show sport glyphs
 * without relying on map style fonts (DIN Pro does not render emoji → "green dot only").
 *
 * Tuning: GAME_ICON_RASTER_SIZE, font stack, shadow for contrast on the basemap.
 */

const GAME_ICON_RASTER_SIZE = 72;

/**
 * Draw centered emoji on transparent pixels for `map.addImage` (no circular badge — map uses symbol layer only).
 */
export function rasterizeSportEmojiToImageData(emoji: string): ImageData {
  const size = GAME_ICON_RASTER_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return new ImageData(size, size);
  }

  const cx = size / 2;
  const cy = size / 2;

  ctx.clearRect(0, 0, size, size);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${Math.round(size * 0.58)}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Twemoji Mozilla", sans-serif`;
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = Math.round(size * 0.08);
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = Math.round(size * 0.02);
  ctx.fillText(emoji, cx, cy + 1);
  ctx.shadowBlur = 0;

  return ctx.getImageData(0, 0, size, size);
}

export { GAME_ICON_RASTER_SIZE };
