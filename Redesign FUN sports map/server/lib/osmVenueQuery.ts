/**
 * Curated Overpass selectors for FUN venue discovery.
 *
 * Mirrors the OSM tokens in `src/lib/sportsCatalog.ts` (kept as a standalone list so the
 * edge routes don't import client code). Bounded on purpose: the bbox cap in `apiGuards`
 * limits area, but a wide tag union still inflates payload — keep this list focused on
 * point-like, playable venue types.
 *
 * If you add a leisure/sport type to the catalog and want its venues on the map, add the
 * token here too, then re-run the importer (or let auto-cache backfill visited areas).
 */

/** `leisure=*` venue types worth showing (dropped noisy area tags like nature_reserve). */
const LEISURE_TOKENS = [
  "pitch",
  "sports_centre",
  "fitness_centre",
  "swimming_pool",
  "ice_rink",
  "bowling_alley",
  "golf_course",
  "miniature_golf",
  "track",
  "trampoline_park",
  "horse_riding",
  "climbing",
  "water_park",
  "dance",
  "disc_golf_course",
  "skatepark",
  "recreation_ground",
] as const;

/** `sport=*` tokens for venues often tagged without a fetched `leisure=*`. */
const SPORT_TOKENS = [
  "archery",
  "shooting",
  "paintball",
  "billiards",
  "table_tennis",
  "equestrian",
  "skateboard",
  "climbing",
  "bowling",
  "9pin",
  "10pin",
  "darts",
] as const;

/** Build the bounded Overpass query for a bbox string (`minLat,minLng,maxLat,maxLng`). */
export function buildVenueOverpassQuery(bboxStr: string): string {
  const leisureRe = LEISURE_TOKENS.join("|");
  const sportRe = SPORT_TOKENS.join("|");
  return `
    [out:json][timeout:60];
    (
      node["leisure"~"^(${leisureRe})$"](${bboxStr});
      way["leisure"~"^(${leisureRe})$"](${bboxStr});
      node["sport"~"^(${sportRe})$"](${bboxStr});
      way["sport"~"^(${sportRe})$"](${bboxStr});
    );
    out center;
  `.replace(/\n\s+/g, " ");
}
