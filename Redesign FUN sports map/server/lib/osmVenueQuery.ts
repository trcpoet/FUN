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
  // Claimed by a sport in SPORTS_CATALOG but missing here until 2026-08-12, so these venue
  // types could never enter the database and their filters looked broken for reasons nothing
  // in the UI could explain. `src/lib/osmVenueQuery.test.ts` now asserts the two lists agree.
  "adventure_park", // Adventure Park
  "fitness_station", // Obstacle Course
  "marina", // Kayaking
  "slipway", // Kayaking
  // All named parks — with OR without a pitch. Parks that contain pitches also
  // import those pitches (separate rows), so both the park 🏟️ and each pitch's
  // sport icon render.
  "park",
] as const;

/**
 * `leisure=stadium` is claimed by Football but deliberately NOT collected.
 *
 * A pro stadium is a landmark, not somewhere you can start a pickup game, and nothing in
 * `venueAccessTier` currently recognises one — they carry no `access` tag, so AT&T Stadium
 * would import as an ordinary open venue with a "Create game" button on it. That is the exact
 * problem the access tiers were built to prevent.
 *
 * Collect stadiums once there is a rule that renders them visible-but-not-bookable. The
 * exclusion is pinned in `src/lib/osmVenueQuery.test.ts` so it stays a decision, not a gap.
 */

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
    [out:json][timeout:90];
    (
      node["leisure"~"^(${leisureRe})$"](${bboxStr});
      way["leisure"~"^(${leisureRe})$"](${bboxStr});
      node["sport"~"^(${sportRe})$"](${bboxStr});
      way["sport"~"^(${sportRe})$"](${bboxStr});
    );
    out center;
  `.replace(/\n\s+/g, " ");
}
