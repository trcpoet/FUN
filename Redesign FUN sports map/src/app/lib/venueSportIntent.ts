/** Persisted venue sport intent: string = one sport, null = All Sports. */

export const VENUE_SPORT_INTENT_STORAGE_KEY = "fun.venueSportIntent.v1";
export const VENUE_PROMPT_DISMISSED_KEY = "fun.venueSportPromptDone.v1";

export type VenueSportIntent = string | null;

export function readStoredVenueSportIntent(): VenueSportIntent | undefined {
  try {
    const raw = localStorage.getItem(VENUE_SPORT_INTENT_STORAGE_KEY);
    if (raw === null) return undefined;
    if (raw === "__all__") return null;
    const trimmed = raw.trim();
    return trimmed.length ? trimmed : null;
  } catch {
    return undefined;
  }
}

export function writeStoredVenueSportIntent(intent: VenueSportIntent): void {
  try {
    if (intent === null) {
      localStorage.setItem(VENUE_SPORT_INTENT_STORAGE_KEY, "__all__");
    } else {
      localStorage.setItem(VENUE_SPORT_INTENT_STORAGE_KEY, intent);
    }
    localStorage.setItem(VENUE_PROMPT_DISMISSED_KEY, "1");
  } catch {
    /* private mode */
  }
}

export function hasCompletedVenueSportPrompt(): boolean {
  try {
    return localStorage.getItem(VENUE_PROMPT_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

/** Map intent → Overpass / DB sport filter ([] = all sports). */
export function venueIntentToSportFilter(intent: VenueSportIntent): string[] {
  return intent === null ? [] : [intent];
}

/**
 * Venue sport filter: explicit Filters-modal picks win, the onboarding intent is the fallback.
 * Override rather than intersect — `[]` already means "all sports" here, so an empty intersection
 * would be indistinguishable from "no filter" and would silently show everything.
 * Both inputs are display labels from SPORTS_CATALOG, so no token translation is needed.
 */
export function resolveVenueSportFilter(intent: VenueSportIntent, filterSports: string[]): string[] {
  return filterSports.length > 0 ? filterSports : venueIntentToSportFilter(intent);
}
