/**
 * Which venues may be drawn as destinations, and which may host a game.
 *
 * WHY THIS EXISTS
 * ---------------
 * Every venue pin used to render a "Create game" button. For roughly half the table that
 * promise was false, and for one class of pin it was actively harmful: `leisure=swimming_pool`
 * is 48.6% of `osm_sports_venues` (41,477 of 85,388 rows) and 99.4% of those pools are
 * unnamed. An unnamed pool traced from aerial imagery is, overwhelmingly, someone's backyard —
 * and FUN was presenting it with a name, directions, and a host CTA.
 *
 * WHY THE `access` TAG IS NOT ENOUGH ON ITS OWN
 * --------------------------------------------
 * 22,619 pools carry no `access` tag at all. OSM mappers tracing pools from imagery rarely tag
 * access, so "untagged" cannot mean "open" — for pools specifically it means the opposite. That
 * is why rule 2 below is keyed on venue *type*, not on the access tag.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 * ----------------------------------
 * This gates how venues are *advertised*, not what a person may do. Freeform game creation
 * (map long-press / custom pin) stays completely open — hosting a game in your own backyard, a
 * parking lot, or a park missing from OSM is legitimate, and a coordinate-based server reject
 * would break exactly those cases. The harm being addressed is FUN pointing strangers at a
 * private address, which is purely a render/CTA concern.
 *
 * Mirrors the `gameViewerRole` pattern: one pure function, so a new surface gets the same
 * answer for free instead of growing its own copy of the gates.
 */

/** Access values asserting the public may enter. */
const OPEN_ACCESS = new Set(["yes", "public", "permissive"]);

/** Access values asserting entry is possible but conditional (clubs, gyms, pay-to-play). */
const PERMISSION_ACCESS = new Set(["customers", "members", "membership", "permit"]);

/** Access values asserting the public may not enter. */
const CLOSED_ACCESS = new Set(["private", "no"]);

/**
 * Venue types whose *unnamed* rows are presumed residential.
 *
 * Pools only, on purpose. A bare `leisure=pitch` with no name is the normal shape of a perfectly
 * public park pitch (30,437 of 31,611 pitches are unnamed), so the same inference there would
 * delete most of the map. Pools are the one type where "unnamed" is strong evidence of a private
 * home. Adding a type here without checking that distribution would be a guess.
 */
const RESIDENTIAL_WHEN_UNNAMED = new Set(["swimming_pool"]);

export type VenueAccessTier =
  /** Public, or no reason to think otherwise. Full CTA. */
  | "open"
  /** Reachable, but entry is conditional. Full CTA plus an advisory. */
  | "restricted"
  /** Private or residential. Never drawn as a pin; no CTA if reached by deep link. */
  | "hidden";

export type VenueAccessVerdict = {
  tier: VenueAccessTier;
  /** True when the venue may be drawn as a destination pin. */
  canRender: boolean;
  /** True when the venue modal may offer "Create game". */
  canCreateGame: boolean;
  /** Headline shown in the modal for non-open tiers, else null. */
  advisory: string | null;
  /** Supporting line under `advisory`, else null. */
  advisoryDetail: string | null;
};

/** The subset of a venue this decision needs — satisfied by both map properties and DB rows. */
export type VenueAccessInput = {
  access?: string | null;
  leisure?: string | null;
  name?: string | null;
};

/**
 * Normalize an OSM tag value for comparison.
 *
 * Returns null for absent *and* blank values, so callers branch on one thing. Never returns "".
 */
function normalizeTag(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

const OPEN_VERDICT: VenueAccessVerdict = {
  tier: "open",
  canRender: true,
  canCreateGame: true,
  advisory: null,
  advisoryDetail: null,
};

const RESTRICTED_VERDICT: VenueAccessVerdict = {
  tier: "restricted",
  canRender: true,
  // Informs, does not block: a game at a club or gym is legitimate, the host just has to sort
  // out entry. Blocking here would be a guess about someone else's membership.
  canCreateGame: true,
  advisory: "Permission may be required",
  advisoryDetail: "This venue may need a membership, a booking, or a fee to get in.",
};

const HIDDEN_VERDICT: VenueAccessVerdict = {
  tier: "hidden",
  canRender: false,
  canCreateGame: false,
  advisory: "Private venue",
  advisoryDetail: "This place isn't open for public games.",
};

/**
 * Classify one venue.
 *
 * NULL SAFETY — the trap this function exists to contain:
 * `access` is null on 38,867 of 85,388 rows. Any expression of the form
 * `access NOT IN ('private','no')` is NULL (not true) for those rows in SQL and PostgREST, so
 * they silently vanish from *both* sides of a boolean filter. Sizing this work hit exactly that
 * bug — a count returned 2,272 kept instead of 41,139 and the totals refused to reconcile. Here,
 * every tag is normalized to `string | null` up front and null is treated as "unknown", never as
 * false-y. Keep it that way.
 */
export function venueAccessTier(venue: VenueAccessInput): VenueAccessVerdict {
  const access = normalizeTag(venue.access);
  const leisure = normalizeTag(venue.leisure);
  const name = normalizeTag(venue.name);

  // 1. The venue says outright that the public is not welcome. Trust it, whatever the type.
  if (access !== null && CLOSED_ACCESS.has(access)) return HIDDEN_VERDICT;

  // 2. Residential inference. Only applies when the venue has NOT claimed some form of public or
  //    conditional access — an unnamed members-only pool is a club pool, and falls through to
  //    `restricted` rather than disappearing.
  const claimsAccess = access !== null && (OPEN_ACCESS.has(access) || PERMISSION_ACCESS.has(access));
  if (leisure !== null && RESIDENTIAL_WHEN_UNNAMED.has(leisure) && name === null && !claimsAccess) {
    return HIDDEN_VERDICT;
  }

  // 3. Reachable, but conditional.
  if (access !== null && PERMISSION_ACCESS.has(access)) return RESTRICTED_VERDICT;

  // 4. Everything else, including every unrecognised access value on a non-pool. Defaulting an
  //    odd tag to `open` is deliberate: hiding real pitches over tag noise is the worse failure.
  return OPEN_VERDICT;
}

/**
 * PostgREST filters that drop rules 1 and 2 server-side.
 *
 * Purely an optimization, and a load-bearing one: `fetchSportsVenuesFromDb` caps at 8000 rows
 * BEFORE any client filtering, so in a dense suburb the cap would otherwise be spent on backyard
 * pools we are about to discard, truncating the real pitches. This must never exclude more than
 * `venueAccessTier` would — `venueAccess.test.ts` asserts the two agree row-for-row.
 *
 * Each entry is one `.or()` argument, and chained `.or()` calls AND together. The explicit
 * `.is.null` disjunct in each is the null-safety fix described above: without it PostgREST's
 * `not.in` / `neq` would drop every row whose column is null.
 */
export const VENUE_ACCESS_POSTGREST_FILTERS: readonly string[] = [
  // Rule 1: keep rows whose access is unset or not a closed value.
  `access.is.null,access.not.in.(${[...CLOSED_ACCESS].join(",")})`,
  // Rule 2: keep rows that are not a pool, are a named pool, or are a pool claiming access.
  [
    "leisure.is.null",
    `leisure.not.in.(${[...RESIDENTIAL_WHEN_UNNAMED].join(",")})`,
    "name.not.is.null",
    `access.in.(${[...OPEN_ACCESS, ...PERMISSION_ACCESS].join(",")})`,
  ].join(","),
];
