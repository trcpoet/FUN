/**
 * Resolve OSM venue sport/leisure tags → Mapbox sport icon ids (reuses game icon registry).
 * Cluster keys + leisure→icon mapping are derived from the sport registry.
 */

import { osmSportTokens } from "../../lib/osmSportTags";
import { getGameMapboxIconId, getSportIconEmoji, resolveSportMapboxSuffix } from "../map/gameSportIcons";
import { SPORTS_CATALOG, OTHER_SPORT } from "../../lib/sportsCatalog";

/**
 * Icon suffix for a physical venue with no exact sport (bare pitch, multi-sport
 * pitch, sports_centre, recreation_ground…). Reuses the existing "Recreation
 * Center" 🏟️ marker so a field reads as a venue, not a game "other" pin (🎯).
 * (Recreation Center is a SPORTS_CATALOG entry, so this icon is registered.)
 */
const GENERIC_VENUE_SUFFIX = "recreation";

/** Stable numeric keys for Mapbox `clusterProperties` max aggregation (registry order + other). */
const SUFFIX_TO_KEY: Record<string, number> = (() => {
  const out: Record<string, number> = {};
  let n = 1;
  for (const s of SPORTS_CATALOG) {
    if (!(s.mapboxSuffix in out)) out[s.mapboxSuffix] = n++;
  }
  out[OTHER_SPORT.mapboxSuffix] = n; // "other" always last
  return out;
})();

const OTHER_KEY = SUFFIX_TO_KEY[OTHER_SPORT.mapboxSuffix]!;

const KEY_TO_MAPBOX_ID: Record<number, string> = {};
for (const [suffix, key] of Object.entries(SUFFIX_TO_KEY)) {
  KEY_TO_MAPBOX_ID[key] = getGameMapboxIconId(suffix);
}
// Clustered venues with no exact sport render the stadium marker, not 🎯.
KEY_TO_MAPBOX_ID[OTHER_KEY] = getGameMapboxIconId(GENERIC_VENUE_SUFFIX);

/**
 * Specific `leisure=*` venue types → icon suffix, for venues that carry no usable `sport=*`.
 * Generic leisures (pitch, sports_centre, recreation_ground) intentionally stay `other`.
 */
const LEISURE_TO_SUFFIX: Record<string, string> = {
  swimming_pool: "swimming",
  water_park: "swimming",
  ice_rink: "ice_hockey",
  skatepark: "skateboarding",
  bowling_alley: "bowling",
  golf_course: "golf",
  miniature_golf: "golf",
  trampoline_park: "trampoline",
  horse_riding: "equestrian",
  climbing: "climbing",
  fitness_centre: "gym",
  track: "running",
  dance: "dance",
  disc_golf_course: "disc_golf",
  adventure_park: "adventure_park",
  marina: "kayaking",
  slipway: "kayaking",
};

/** Primary sport suffix for clustering / icon (first resolvable OSM sport token, else leisure, else other). */
export function primaryVenueSportSuffix(
  sport: string | undefined | null,
  leisure?: string | null
): string {
  for (const token of osmSportTokens(sport)) {
    const suffix = resolveSportMapboxSuffix(token);
    if (suffix !== OTHER_SPORT.mapboxSuffix) return suffix;
  }
  const l = (leisure ?? "").trim().toLowerCase();
  if (l && LEISURE_TO_SUFFIX[l]) return LEISURE_TO_SUFFIX[l]!;
  return OTHER_SPORT.mapboxSuffix;
}

export function venueSportMapIconId(sport: string | undefined | null, leisure?: string | null): string {
  const suffix = primaryVenueSportSuffix(sport, leisure);
  // No exact sport → stadium marker (represents the field) instead of 🎯.
  if (suffix === OTHER_SPORT.mapboxSuffix) return getGameMapboxIconId(GENERIC_VENUE_SUFFIX);
  return getGameMapboxIconId(suffix);
}

/**
 * Display emoji for a venue, matching whatever `venueSportMapIconId` rasterizes onto the map.
 * Needed by DOM pins (`VenueActivityPin`), which draw the glyph as text rather than as a
 * registered Mapbox image. Same generic-venue rule: no exact sport → 🏟️, never 🎯.
 */
export function venueSportEmoji(sport: string | undefined | null, leisure?: string | null): string {
  const suffix = primaryVenueSportSuffix(sport, leisure);
  return getSportIconEmoji(suffix === OTHER_SPORT.mapboxSuffix ? GENERIC_VENUE_SUFFIX : suffix);
}

export function venueSportKey(sport: string | undefined | null, leisure?: string | null): number {
  const suffix = primaryVenueSportSuffix(sport, leisure);
  return SUFFIX_TO_KEY[suffix] ?? OTHER_KEY;
}

export function mapboxIconIdFromSportKey(key: number): string {
  return KEY_TO_MAPBOX_ID[key] ?? KEY_TO_MAPBOX_ID[OTHER_KEY]!;
}

/** Mapbox GL `icon-image` expression from clustered `max_sport_key` property. */
export function venueClusterIconImageExpression(): unknown[] {
  const pairs: unknown[] = [];
  for (const [key, id] of Object.entries(KEY_TO_MAPBOX_ID)) {
    pairs.push(Number(key), id);
  }
  pairs.push(KEY_TO_MAPBOX_ID[OTHER_KEY]!);
  return ["match", ["get", "max_sport_key"], ...pairs];
}
