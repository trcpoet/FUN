/**
 * Sport → Mapbox icon id + display emoji for rasterized game markers.
 * Venues stay separate (subtle GL layers); only *games* use these ids via addImage + symbol layer.
 *
 * Tuning: add rows here to support new sports; unknown sports fall back to `other`.
 */

export type SportIconEntry = {
  mapboxSuffix: string;
  emoji: string;
  aliases?: string[];
};

const PREFIX = "fun-game-sport-";

const SPORT_ICON_ROWS: SportIconEntry[] = [
  { mapboxSuffix: "basketball", emoji: "🏀", aliases: ["basketball"] },
  { mapboxSuffix: "soccer", emoji: "⚽", aliases: ["soccer", "association football"] },
  { mapboxSuffix: "football", emoji: "🏈", aliases: ["football", "american football"] },
  { mapboxSuffix: "volleyball", emoji: "🏐", aliases: ["volleyball"] },
  { mapboxSuffix: "tennis", emoji: "🎾", aliases: ["tennis"] },
  { mapboxSuffix: "pickleball", emoji: "🏓", aliases: ["pickleball"] },
  { mapboxSuffix: "baseball", emoji: "⚾", aliases: ["baseball"] },
  { mapboxSuffix: "cricket", emoji: "🏏", aliases: ["cricket"] },
  { mapboxSuffix: "badminton", emoji: "🏸", aliases: ["badminton"] },
  { mapboxSuffix: "futsal", emoji: "⚽", aliases: ["futsal", "indoor soccer"] },
  { mapboxSuffix: "running", emoji: "🏃", aliases: ["running", "track"] },
  { mapboxSuffix: "gym", emoji: "🏋️", aliases: ["gym", "fitness", "workout"] },
  { mapboxSuffix: "other", emoji: "🎯", aliases: ["other", "pickup"] },
];

/** alias (lowercase) → mapboxSuffix */
const ALIAS_TO_SUFFIX = new Map<string, string>();
for (const row of SPORT_ICON_ROWS) {
  for (const a of row.aliases ?? []) {
    ALIAS_TO_SUFFIX.set(a.trim().toLowerCase(), row.mapboxSuffix);
  }
}

/**
 * Resolve backend/UI sport label to a registered suffix (e.g. "Soccer" → "soccer", unknown → "other").
 */
export function resolveSportMapboxSuffix(sport: string): string {
  const raw = sport.trim().toLowerCase();
  if (!raw) return "other";
  const viaAlias = ALIAS_TO_SUFFIX.get(raw);
  if (viaAlias) return viaAlias;
  if (SPORT_ICON_ROWS.some((r) => r.mapboxSuffix === raw)) return raw;
  return "other";
}

export function normalizeSportKey(sport: string): string {
  return resolveSportMapboxSuffix(sport);
}

/** Mapbox `icon-image` id (must match registered `addImage`). */
export function getGameMapboxIconId(sport: string): string {
  return `${PREFIX}${resolveSportMapboxSuffix(sport)}`;
}

export function getSportIconEmoji(sport: string): string {
  const suf = resolveSportMapboxSuffix(sport);
  return SPORT_ICON_ROWS.find((r) => r.mapboxSuffix === suf)?.emoji ?? "🎯";
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
