import type { Map } from "mapbox-gl";
import { getAllGameSportIconDefinitions } from "./gameSportIcons";
import { rasterizeSportEmojiToImageData } from "./rasterizeSportIcon";

/**
 * Register all sport badge images once per map instance.
 * Safe to call multiple times (skips if image already exists).
 */
export function registerGameSportImages(map: Map): void {
  for (const { mapboxId, emoji } of getAllGameSportIconDefinitions()) {
    if (map.hasImage(mapboxId)) continue;
    try {
      const data = rasterizeSportEmojiToImageData(emoji);
      map.addImage(mapboxId, data, { pixelRatio: 2 });
    } catch (e) {
      console.warn("[FUN] Failed to register sport map image", mapboxId, e);
    }
  }
}
