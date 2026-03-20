/** Central tuning knobs for unified map search (debounce, limits, geo). */

export const SEARCH_DEBOUNCE_MS = 360;

export const MAX_PLACE_RESULTS = 5;

export const MAX_SPORT_RESULTS = 6;

export const MAX_PEOPLE_RESULTS = 15;

/** When map/user anchor is available, filter people outside this radius (km). */
export const PEOPLE_SEARCH_RADIUS_KM = 80;

/** Minimum trimmed query length before calling `search_profiles`. */
export const MIN_QUERY_LENGTH_FOR_PEOPLE = 2;

/** LRU-ish place geocode cache: max entries and TTL (ms). */
export const PLACE_QUERY_CACHE_MAX = 32;
export const PLACE_QUERY_CACHE_TTL_MS = 5 * 60 * 1000;

/** Triggers browse-only people list (uses `get_profiles_nearby`, not text RPC). */
export const PLAYERS_NEAR_ME_RE = /^(players?|people)\s+near\s+me\b/i;
