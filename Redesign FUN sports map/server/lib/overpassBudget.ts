/**
 * How the venue warm route spends its request budget across Overpass mirrors.
 *
 * Lives here rather than in `api/warm-venues.ts` so it can be unit-tested without importing an
 * Edge route — the same split `venueTiles.ts` and `osmVenueQuery.ts` already use.
 */

/**
 * Give up on a single mirror after this long and try the next one.
 *
 * A healthy mirror answers a tile in ~4-5s. An unhealthy one does not fail fast — one was
 * observed accepting the connection and then hanging past 120s. Without a per-attempt bound, a
 * single dead mirror would consume the whole invocation while the others sat unused.
 */
export const UPSTREAM_TIMEOUT_MS = 8_000;

/** Hard ceiling for the whole request, keeping it well inside the Edge response budget. */
export const REQUEST_BUDGET_MS = 22_000;

/**
 * Shortest attempt still worth making. A healthy mirror answers in ~4-5s, so anything under this
 * would abort a working mirror mid-flight and waste the request.
 */
export const MIN_ATTEMPT_MS = 4_500;

/**
 * How long the next mirror attempt may run.
 *
 * The naive version — a flat `UPSTREAM_TIMEOUT_MS` per attempt — made two of the four mirrors
 * unreachable. Two hung mirrors burn 16s of a 22s budget, leaving 6s: mirror 3 got a truncated
 * try and mirror 4 never ran at all. The mirror list exists precisely because public Overpass
 * instances shed load, so most of it was dead weight in the case it was added for. That is the
 * `UPSTREAM_UNAVAILABLE` 503 users were seeing.
 *
 * Rather than splitting the budget evenly (which would cap even the first attempt at 5.5s and
 * abort a healthy-but-slow mirror), each attempt may take up to `UPSTREAM_TIMEOUT_MS` while
 * *reserving* `MIN_ATTEMPT_MS` for every mirror still behind it. With a full budget that yields
 * roughly 8s / 5s / 4.5s / 4.5s — the first mirror keeps its generous window and the fourth
 * still gets a real attempt.
 *
 * Returns 0 when too little budget remains to be worth a request.
 */
export function attemptBudgetMs(remainingMs: number, mirrorsLeft: number): number {
  if (remainingMs <= 0 || mirrorsLeft <= 0) return 0;

  // Hold back a viable attempt for each mirror still behind this one. With mirrorsLeft === 1
  // nothing is reserved, so the last mirror naturally gets everything left.
  const shared = Math.min(UPSTREAM_TIMEOUT_MS, remainingMs - MIN_ATTEMPT_MS * (mirrorsLeft - 1));
  if (shared >= MIN_ATTEMPT_MS) return shared;

  // Not enough budget to give every remaining mirror a turn. Spend what is left on one real
  // attempt rather than returning 0 and wasting it — 6s across two mirrors is one good try,
  // not two doomed ones.
  return remainingMs >= MIN_ATTEMPT_MS ? Math.min(UPSTREAM_TIMEOUT_MS, remainingMs) : 0;
}
