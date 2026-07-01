/**
 * Sport → Mapbox icon id + display emoji for rasterized game markers.
 * Derived from the sport registry (`src/lib/sportsCatalog.ts`). Venues stay separate
 * (subtle GL layers); only *games* use these ids via addImage + symbol layer.
 *
 * To support a new sport, add a row to `SPORTS_CATALOG` — pins register automatically.
 * Unknown sports fall back to `other`.
 */

import { SPORTS_CATALOG, OTHER_SPORT, resolveCatalogSport } from "../../lib/sportsCatalog";

export type SportIconEntry = {
  mapboxSuffix: string;
  emoji: string;
  aliases?: string[];
};

const PREFIX = "fun-game-sport-";

const SPORT_ICON_ROWS: SportIconEntry[] = [
  ...SPORTS_CATALOG.map((s) => ({
    mapboxSuffix: s.mapboxSuffix,
    emoji: s.emoji,
    aliases: [s.id.toLowerCase(), ...(s.aliases ?? [])],
  })),
  { mapboxSuffix: OTHER_SPORT.mapboxSuffix, emoji: OTHER_SPORT.emoji, aliases: [...OTHER_SPORT.aliases] },
];

/**
 * Resolve backend/UI sport label to a registered suffix (e.g. "Soccer" → "soccer", unknown → "other").
 */
export function resolveSportMapboxSuffix(sport: string): string {
  return resolveCatalogSport(sport)?.mapboxSuffix ?? OTHER_SPORT.mapboxSuffix;
}

export function normalizeSportKey(sport: string): string {
  return resolveSportMapboxSuffix(sport);
}

/** Mapbox `icon-image` id (must match registered `addImage`). */
export function getGameMapboxIconId(sport: string): string {
  return `${PREFIX}${resolveSportMapboxSuffix(sport)}`;
}

export function getSportIconEmoji(sport: string): string {
  return resolveCatalogSport(sport)?.emoji ?? OTHER_SPORT.emoji;
}

/** For getGameMarkerStyle / docs — status ring colors (circle stroke under icon). */
export function getGameStatusRingColor(status: "live" | "soon" | "scheduled"): string {
  switch (status) {
    case "live":
      return "rgba(248, 113, 113, 0.95)";
    case "soon":
      return "rgba(251, 146, 60, 0.95)";
    default:
      return "rgba(52, 211, 153, 0.55)";
  }
}

/** Resolver surface for UI / tooling — map layers use the same ids + colors. */
export function getGameMarkerStyle(
  sport: string,
  status: "live" | "soon" | "scheduled"
): { mapboxIconId: string; emoji: string; statusRingColor: string } {
  return {
    mapboxIconId: getGameMapboxIconId(sport),
    emoji: getSportIconEmoji(sport),
    statusRingColor: getGameStatusRingColor(status),
  };
}

export function getAllGameSportIconDefinitions(): { mapboxId: string; emoji: string }[] {
  const seen = new Set<string>();
  const out: { mapboxId: string; emoji: string }[] = [];
  for (const row of SPORT_ICON_ROWS) {
    const id = `${PREFIX}${row.mapboxSuffix}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ mapboxId: id, emoji: row.emoji });
  }
  return out;
}

export const GAME_SPORT_ICON_PREFIX = PREFIX;
