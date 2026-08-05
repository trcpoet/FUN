/**
 * Map app sport labels to OSM `sport=*` / `leisure=*` / `amenity=*` tokens.
 * Derived from the sport registry (`sportsCatalog.ts`). OSM values are lowercase;
 * multi-sport pitches use semicolons e.g. `soccer;rugby`.
 */

import { SPORTS_CATALOG, resolveCatalogSport } from "./sportsCatalog";

function normalizeToken(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, "_");
}

/** Tokens we accept from OSM `sport` (split on `;`/`,`). */
export function osmSportTokens(osmSport: string | undefined | null): string[] {
  if (!osmSport?.trim()) return [];
  return osmSport
    .split(/[;,]/)
    .map((x) => normalizeToken(x))
    .filter(Boolean);
}

/** All OSM `sport=*` tokens that match any selected display sport. */
export function expectedOsmTokensForDisplaySports(displaySports: string[]): Set<string> {
  const out = new Set<string>();
  for (const d of displaySports) {
    const def = resolveCatalogSport(d);
    const tokens = def?.osmSport;
    if (tokens?.length) tokens.forEach((t) => out.add(normalizeToken(t)));
    else out.add(normalizeToken(d));
  }
  return out;
}

/** All OSM `leisure=*` / `amenity=*` tokens that match any selected display sport. */
export function expectedLeisureTokensForDisplaySports(displaySports: string[]): Set<string> {
  const out = new Set<string>();
  for (const d of displaySports) {
    const def = resolveCatalogSport(d);
    (def?.osmLeisure ?? []).forEach((t) => out.add(normalizeToken(t)));
    (def?.osmAmenity ?? []).forEach((t) => out.add(normalizeToken(t)));
  }
  return out;
}

/**
 * `leisure=*` values that say "sports happen here" without saying which sport.
 * Nearly every SPORTS_CATALOG entry lists `pitch` in its `osmLeisure`, so these can
 * never be used to *match* a specific sport — only to decide whether an untagged
 * venue stays visible.
 */
const GENERIC_LEISURE = new Set(["pitch", "sports_centre", "recreation_ground", "park"]);

/**
 * The single rule for "does this venue survive the sport filter?", shared by the
 * Supabase read and the render/cluster path.
 *
 * - No filter → everything.
 * - Venue declares `sport=*` → trust it, and *only* it. A `sport=tennis` pitch must not
 *   pass a Soccer filter merely because Tennis and Soccer both list `leisure=pitch`;
 *   that made the filter a silent no-op on real data, where every row is a `pitch`.
 * - Venue declares no sport → a specific leisure (`swimming_pool`, `ice_rink`…) still
 *   identifies it; a generic one stays visible, because hiding a real venue we simply
 *   failed to classify is worse than showing one extra.
 */
export function venueMatchesSelectedSports(
  osmSport: string | undefined | null,
  displaySports: string[],
  leisure?: string | null
): boolean {
  if (!displaySports.length) return true;

  const sportTokens = osmSportTokens(osmSport);
  if (sportTokens.length) {
    const expected = expectedOsmTokensForDisplaySports(displaySports);
    return sportTokens.some((t) => expected.has(t));
  }

  const l = normalizeToken(leisure ?? "");
  if (!l) return false;

  if (GENERIC_LEISURE.has(l)) return true;
  return expectedLeisureTokensForDisplaySports(displaySports).has(l);
}

/** For docs/tests: the raw label → OSM sport tokens projection of the registry. */
export const DISPLAY_TO_OSM: Record<string, string[]> = Object.fromEntries(
  SPORTS_CATALOG.map((s) => [s.id, s.osmSport ?? []])
);
