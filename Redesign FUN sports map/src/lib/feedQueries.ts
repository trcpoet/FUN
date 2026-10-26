import {
  fetchFeedMediaPosts,
  fetchLiveNearby,
  fetchLocalNews,
  fetchMyFollowedIds,
  fetchUnifiedFeed,
  getGamesNearby,
  getSimilarAthletes,
  getSuggestedGames,
  type LiveFeedItem,
  type LocalNewsItem,
  type SuggestedGameRow,
  type UnifiedFeedItem,
} from "./api";
import { cachedAsync, persistUnder } from "./requestCache";
import type { FeedMediaPostRow, GameRow, SimilarAthleteRow } from "./supabase";

/**
 * The feed's queries, named once.
 *
 * The Feed page, its sub-pages and the map's idle prefetch all read through these,
 * so a prefetch lands in exactly the cache entry the page will look for. Every key
 * starts with `feed:`, which `api.ts` expires after any write that changes what the
 * feed shows.
 */

/** Younger than this, a cached copy is shown without asking again. */
export const FEED_TTL_MS = 20_000;

/** The radius Explore's "For you" shelf asks for, so its prefetch lands in the same entry. */
export const SUGGESTED_RADIUS_KM = 25;

// What a cold start may paint before the network answers (see `persistUnder`).
// Not `feed:following:` (a Set, which JSON cannot carry) or `feed:venues:` (large,
// and re-ranked on every visit anyway).
for (const prefix of ["feed:media:", "feed:unified:", "feed:live:", "feed:suggested:", "feed:games:", "feed:news:"]) {
  persistUnder(prefix);
}

/** Recommended Games searches wider than the feed: a game is worth a longer trip than a note. */
export const RECOMMENDED_GAMES_RADIUS_KM = 50;

type Coords = { lat: number; lng: number };

/**
 * Two decimals is about a kilometre, the distance `useApproxLocation` waits for
 * before it re-queries. Nearer than that, the same rows come back from a 25 km
 * radius, so the two positions can share an entry.
 */
const at = (c: Coords) => `${c.lat.toFixed(2)},${c.lng.toFixed(2)}`;

/** Most rows here depend on who is asking (RLS, `joined_by_me`, sport matching). */
const who = (userId: string | null) => userId ?? "guest";

/** The api layer reports errors beside the data; the cache only keeps what didn't throw. */
async function orThrow<T>(p: Promise<{ data: T; error: Error | null }>): Promise<T> {
  const r = await p;
  if (r.error) throw r.error;
  return r.data;
}

export type FeedQuery<T> = { key: string; fetch: () => Promise<T> };

export const feedQueries = {
  media: (userId: string | null): FeedQuery<FeedMediaPostRow[]> => ({
    key: `feed:media:${who(userId)}`,
    // The personal set (public + squad + own via RLS); Explore derives the public subset.
    fetch: () => orThrow(fetchFeedMediaPosts({ limit: 28, viewerUserId: userId, scope: "personal" })),
  }),

  unified: (userId: string | null, c: Coords): FeedQuery<UnifiedFeedItem[]> => ({
    key: `feed:unified:${who(userId)}:${at(c)}`,
    fetch: () => orThrow(fetchUnifiedFeed({ lat: c.lat, lng: c.lng, mapRadiusKm: 120, limit: 80 })),
  }),

  live: (userId: string | null, c: Coords): FeedQuery<LiveFeedItem[]> => ({
    key: `feed:live:${who(userId)}:${at(c)}`,
    fetch: () => orThrow(fetchLiveNearby({ lat: c.lat, lng: c.lng, radiusKm: 25, limit: 40 })),
  }),

  similar: (userId: string | null, c: Coords): FeedQuery<SimilarAthleteRow[]> => ({
    key: `feed:similar:${who(userId)}:${at(c)}`,
    fetch: async () =>
      (await orThrow(getSimilarAthletes({ lat: c.lat, lng: c.lng, radiusKm: 25, limit: 20 }))) ?? [],
  }),

  following: (userId: string | null): FeedQuery<Set<string>> => ({
    key: `feed:following:${who(userId)}`,
    fetch: () => orThrow(fetchMyFollowedIds()),
  }),

  /** First page only; "Show more" pages are appended by the caller. */
  news: (c: Coords): FeedQuery<{ items: LocalNewsItem[]; available: number }> => ({
    key: `feed:news:${at(c)}`,
    fetch: async () => {
      const r = await fetchLocalNews({ lat: c.lat, lng: c.lng, radiusKm: 25, limit: 10, offset: 0 });
      if (r.error) throw r.error;
      return { items: r.data, available: r.available };
    },
  }),

  suggested: (userId: string | null, c: Coords, radiusKm: number): FeedQuery<SuggestedGameRow[]> => ({
    key: `feed:suggested:${who(userId)}:${at(c)}:${radiusKm}`,
    fetch: () => orThrow(getSuggestedGames({ lat: c.lat, lng: c.lng, radiusKm, limit: 12 })),
  }),

  nearbyGames: (userId: string | null, c: Coords, radiusKm: number): FeedQuery<GameRow[]> => ({
    key: `feed:games:${who(userId)}:${at(c)}:${radiusKm}`,
    fetch: async () => (await orThrow(getGamesNearby(c.lat, c.lng, radiusKm))) ?? [],
  }),
};

/** Shared by the Popular Venues page, whose rows are ranked client-side per radius. */
export function venuesKey(userId: string | null, c: Coords, radiusKm: number): string {
  return `feed:venues:${who(userId)}:${at(c)}:${radiusKm}`;
}

/**
 * Warm what the feed shows first, so opening it paints a list instead of skeletons.
 *
 * Called from the map once it is idle and again when the Feed button is pressed;
 * both land in the same entries, and a request already in flight is shared rather
 * than repeated.
 */
export function prefetchFeed(userId: string | null, coords: Coords | null): void {
  const queries: FeedQuery<unknown>[] = [feedQueries.media(userId)];
  if (coords) {
    queries.push(
      feedQueries.unified(userId, coords),
      feedQueries.live(userId, coords),
      feedQueries.suggested(userId, coords, SUGGESTED_RADIUS_KM),
    );
  }
  for (const q of queries) void cachedAsync(q.key, FEED_TTL_MS, q.fetch).catch(() => {});
}

/** Start one query early — on a press, before the page that reads it has loaded. */
export function prefetchQuery<T>(q: FeedQuery<T>): void {
  void cachedAsync(q.key, FEED_TTL_MS, q.fetch).catch(() => {});
}
