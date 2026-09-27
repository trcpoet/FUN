// Aliased: the bare name would shadow the global Map used for the caches below.
import type { Map as MapboxMap } from "mapbox-gl";
import { getAllGameSportIconDefinitions, getGameMapboxIconId } from "./gameSportIcons";
import { rasterizeSportEmojiToImageData } from "./rasterizeSportIcon";

/**
 * Sport glyphs for the GL symbol layers, registered on demand.
 *
 * This used to rasterize all 59 catalogue sports at layer init — 59 canvases
 * drawn, 59 `getImageData` reads, 59 texture uploads — whether the viewport held
 * a single game or none at all. On a device without GPU acceleration those
 * uploads are pure main-thread time, and the overwhelming majority were for
 * sports nobody within 25 km plays.
 *
 * Now a caller asks for the ids its data actually references. The rasterized
 * pixels are cached for the life of the page, so a basemap style swap — which
 * drops mapbox's image registry but not this module — re-registers from memory
 * without touching a canvas again.
 */

/** Rasterized pixels by mapbox image id. Survives style swaps; mapbox's registry does not. */
const rasterCache = new Map<string, ImageData>();

/** Emoji by mapbox image id, resolved once from the catalogue. */
const emojiById = new Map<string, string>();
for (const { mapboxId, emoji } of getAllGameSportIconDefinitions()) {
  emojiById.set(mapboxId, emoji);
}

function ensureImage(map: MapboxMap, mapboxId: string): void {
  if (map.hasImage(mapboxId)) return;
  const emoji = emojiById.get(mapboxId);
  if (!emoji) return; // not a sport glyph id — nothing to draw
  try {
    let data = rasterCache.get(mapboxId);
    if (!data) {
      data = rasterizeSportEmojiToImageData(emoji);
      rasterCache.set(mapboxId, data);
    }
    map.addImage(mapboxId, data, { pixelRatio: 2 });
  } catch (e) {
    console.warn("[FUN] Failed to register sport map image", mapboxId, e);
  }
}

/**
 * Register the sport glyphs `ids` names, plus the fallbacks every layer's
 * `icon-image` expression can land on.
 *
 * Safe to call before every `setData`: an id already in mapbox's registry costs
 * one `hasImage` check. Omit `ids` to register the whole catalogue (the old
 * behaviour) — only worth doing when the caller genuinely cannot know.
 */
export function registerGameSportImages(map: MapboxMap, ids?: Iterable<string>): void {
  if (ids == null) {
    for (const { mapboxId } of getAllGameSportIconDefinitions()) ensureImage(map, mapboxId);
    return;
  }
  // A symbol layer whose `icon-image` resolves to an unregistered id renders
  // nothing at all — no warning on screen — so the fallbacks are not optional.
  for (const fallback of FALLBACK_ICON_IDS) ensureImage(map, fallback);
  for (const id of ids) ensureImage(map, id);
}

/**
 * The two ids the layers' own `icon-image` expressions fall through to:
 * `coalesce(sport_map_icon, other)` on the game layer, and the generic venue
 * marker on the venue layer. A fallback that is not registered renders nothing,
 * so these are always included.
 */
const FALLBACK_ICON_IDS = [getGameMapboxIconId("other"), getGameMapboxIconId("recreation")];

/** The glyph ids a list of games needs. */
export function sportIconIdsForGames(games: ReadonlyArray<{ sport?: string | null }>): Set<string> {
  const ids = new Set<string>();
  for (const g of games) ids.add(getGameMapboxIconId(g.sport ?? ""));
  return ids;
}

/**
 * The glyph ids a GeoJSON collection references, read off the features
 * themselves — both layers already carry the resolved id as `sport_map_icon`,
 * so this cannot drift from what the expression will ask mapbox for.
 */
export function sportIconIdsInFeatures(
  features: ReadonlyArray<{ properties?: { sport_map_icon?: unknown } | null }>
): Set<string> {
  const ids = new Set<string>();
  for (const f of features) {
    const id = f.properties?.sport_map_icon;
    if (typeof id === "string" && id) ids.add(id);
  }
  return ids;
}
