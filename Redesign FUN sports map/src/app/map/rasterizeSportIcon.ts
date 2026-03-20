/**
 * Rasterize emoji into ImageData so Mapbox `symbol` layers can show sport glyphs
 * without relying on map style fonts (DIN Pro does not render emoji → "green dot only").
 *
 * Tuning: GAME_ICON_RASTER_SIZE, badge colors, font stack.
 */

const GAME_ICON_RASTER_SIZE = 72;

/**
 * Draw a small circular badge with centered emoji; returns RGBA ImageData for `map.addImage`.
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
  const r = size / 2 - 2;

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = "rgba(15, 23, 42, 0.94)";
  ctx.beginPath();
  ctx.arc(cx, cx, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(148, 163, 184, 0.45)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${Math.round(size * 0.48)}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Twemoji Mozilla", sans-serif`;
  ctx.fillText(emoji, cx, cy + 1);

  return ctx.getImageData(0, 0, size, size);
}

export { GAME_ICON_RASTER_SIZE };
