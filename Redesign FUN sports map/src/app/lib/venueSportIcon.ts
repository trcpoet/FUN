/**
 * Resolve OSM venue sport/leisure tags → Mapbox sport icon ids (reuses game icon registry).
 */

import { osmSportTokens } from "../../lib/osmSportTags";
import { getGameMapboxIconId, resolveSportMapboxSuffix } from "../map/gameSportIcons";

/** Stable numeric keys for Mapbox `clusterProperties` max aggregation. */
const SUFFIX_TO_KEY: Record<string, number> = {
  basketball: 1,
  soccer: 2,
  football: 3,
  volleyball: 4,
  tennis: 5,
  pickleball: 6,
  baseball: 7,
  cricket: 8,
  badminton: 9,
  futsal: 10,
  running: 11,
  gym: 12,
  other: 13,
};

const KEY_TO_MAPBOX_ID: Record<number, string> = {};
for (const [suffix, key] of Object.entries(SUFFIX_TO_KEY)) {
  KEY_TO_MAPBOX_ID[key] = getGameMapboxIconId(suffix === "other" ? "other" : suffix);
}

/** Primary sport suffix for clustering / icon (first OSM token, or complex/other). */
export function primaryVenueSportSuffix(
  sport: string | undefined | null,
  leisure?: string | null
): string {
  const tokens = osmSportTokens(sport);
  if (tokens.length > 0) {
    return resolveSportMapboxSuffix(tokens[0]!);
  }
  const l = (leisure ?? "").trim().toLowerCase();
  if (l === "sports_centre") return "other";
  return "other";
}

export function venueSportMapIconId(sport: string | undefined | null, leisure?: string | null): string {
  return getGameMapboxIconId(primaryVenueSportSuffix(sport, leisure));
}

export function venueSportKey(sport: string | undefined | null, leisure?: string | null): number {
  const suffix = primaryVenueSportSuffix(sport, leisure);
  return SUFFIX_TO_KEY[suffix] ?? SUFFIX_TO_KEY.other;
}

export function mapboxIconIdFromSportKey(key: number): string {
  return KEY_TO_MAPBOX_ID[key] ?? KEY_TO_MAPBOX_ID[SUFFIX_TO_KEY.other]!;
}

/** Mapbox GL `icon-image` expression from clustered `max_sport_key` property. */
export function venueClusterIconImageExpression(): unknown[] {
  const pairs: unknown[] = [];
  for (const [key, id] of Object.entries(KEY_TO_MAPBOX_ID)) {
    pairs.push(Number(key), id);
  }
  pairs.push(KEY_TO_MAPBOX_ID[SUFFIX_TO_KEY.other]!);
  return ["match", ["get", "max_sport_key"], ...pairs];
}
