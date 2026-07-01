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
 * When `displaySports` is empty → show all venues.
 * Otherwise keep a venue if any OSM sport token matches, OR its leisure/amenity type matches
 * a selected sport, OR it is a generic multi-sport centre (kept so those stay visible under a filter).
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
    if (sportTokens.some((t) => expected.has(t))) return true;
  }

  const l = normalizeToken(leisure ?? "");
  if (l) {
    if (expectedLeisureTokensForDisplaySports(displaySports).has(l)) return true;
    // Multi-sport centres rarely carry sport=*; keep them visible under any filter.
    if (sportTokens.length === 0 && (l === "sports_centre" || l === "recreation_ground")) return true;
  }

  return false;
}

/** For docs/tests: the raw label → OSM sport tokens projection of the registry. */
export const DISPLAY_TO_OSM: Record<string, string[]> = Object.fromEntries(
  SPORTS_CATALOG.map((s) => [s.id, s.osmSport ?? []])
);
