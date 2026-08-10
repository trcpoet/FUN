import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  gameEndTimeMs,
  isGameEnded,
  isLiveGame,
  rankGameRows,
  splitGamesByLiveness,
  rankHotPickVenues,
  formatKm,
  venueActivity,
  pickActiveVenues,
  type LatLng,
  type HotPickVenue,
} from "./hotPicks.ts";
import type {
  SportsVenueGeoJSON,
  SportsVenueFeature,
  SportsVenueProperties,
} from "./sportsVenueTypes";
import type { GameRow } from "../../lib/supabase";
import { distanceKmBetween } from "../map/mapBounds";
// Cross-check the fallback chain against the map's independent timer module.
import {
  getGameEndsAtMs,
  isGameEnded as timerIsGameEnded,
} from "../../lib/mapGameTimer";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MIN = 60_000;

function mkGame(o: Partial<GameRow> = {}): GameRow {
  return {
    id: "g",
    title: "Game",
    sport: "soccer",
    spots_needed: 10,
    starts_at: null,
    created_by: null,
    created_at: "2026-07-23T00:00:00.000Z",
    distance_km: 0,
    lat: 0,
    lng: 0,
    ...o,
  };
}

function mkFeature(
  coords: number[],
  props: Partial<SportsVenueProperties> = {},
): SportsVenueFeature {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: coords },
    properties: {
      id: props.id ?? "v",
      osm_type: "node",
      osm_id: 1,
      ...props,
    },
  } as SportsVenueFeature;
}

function mkFC(features: SportsVenueFeature[]): SportsVenueGeoJSON {
  return { type: "FeatureCollection", features };
}

// ---------------------------------------------------------------------------
// gameEndTimeMs — fallback chain: ended_at -> ends_at -> starts_at+dur -> created_at+dur
// ---------------------------------------------------------------------------

describe("gameEndTimeMs", () => {
  it("prefers ended_at over every other field", () => {
    const g = mkGame({
      ended_at: "2026-07-23T10:00:00.000Z",
      ends_at: "2026-07-23T20:00:00.000Z",
      starts_at: "2026-07-23T05:00:00.000Z",
      created_at: "2026-07-23T00:00:00.000Z",
      duration_minutes: 60,
    });
    expect(gameEndTimeMs(g)).toBe(Date.parse("2026-07-23T10:00:00.000Z"));
  });

  it("falls back to ends_at when ended_at is absent", () => {
    const g = mkGame({
      ended_at: null,
      ends_at: "2026-07-23T20:00:00.000Z",
      starts_at: "2026-07-23T05:00:00.000Z",
    });
    expect(gameEndTimeMs(g)).toBe(Date.parse("2026-07-23T20:00:00.000Z"));
  });

  it("falls back to starts_at + duration_minutes when no explicit end", () => {
    const start = "2026-07-23T05:00:00.000Z";
    const g = mkGame({ ended_at: null, ends_at: null, starts_at: start, duration_minutes: 60 });
    expect(gameEndTimeMs(g)).toBe(Date.parse(start) + 60 * MIN);
  });

  it("uses the 90-minute default duration when duration_minutes is null/undefined", () => {
    const start = "2026-07-23T05:00:00.000Z";
    const g = mkGame({ ended_at: null, ends_at: null, starts_at: start, duration_minutes: null });
    expect(gameEndTimeMs(g)).toBe(Date.parse(start) + 90 * MIN);
  });

  it("gives an untimed game no end at all — posting one is not starting one", () => {
    // This used to resolve to created_at + duration, which quietly retired a pickup game 90
    // minutes after it was posted even though nobody had turned up yet. Untimed games are
    // retired by the map's TTL (see isUntimedGameExpired), not by an invented end time.
    const g = mkGame({
      ended_at: null,
      ends_at: null,
      starts_at: null,
      created_at: "2026-07-23T00:00:00.000Z",
      duration_minutes: 30,
    });
    expect(gameEndTimeMs(g)).toBeNull();
  });

  it("uses live_started_at + duration once a host has actually started it", () => {
    const started = "2026-07-23T11:00:00.000Z";
    const g = mkGame({
      ended_at: null,
      ends_at: null,
      starts_at: null,
      live_started_at: started,
      duration_minutes: 30,
    });
    expect(gameEndTimeMs(g)).toBe(Date.parse(started) + 30 * MIN);
  });

  it("returns null when every timestamp is empty/unparseable", () => {
    const g = mkGame({ ended_at: null, ends_at: null, starts_at: null, created_at: "" });
    expect(gameEndTimeMs(g)).toBeNull();
  });

  it("skips an unparseable ended_at and continues down the chain", () => {
    const g = mkGame({
      ended_at: "not-a-date",
      ends_at: "2026-07-23T20:00:00.000Z",
      starts_at: null,
    });
    expect(gameEndTimeMs(g)).toBe(Date.parse("2026-07-23T20:00:00.000Z"));
  });
});

// ---------------------------------------------------------------------------
// isGameEnded / isLiveGame
// ---------------------------------------------------------------------------

describe("isGameEnded", () => {
  const now = Date.parse("2026-07-23T12:00:00.000Z");

  it("returns true for status 'completed' regardless of times (future start)", () => {
    const g = mkGame({ status: "completed", starts_at: "2026-07-30T00:00:00.000Z" });
    expect(isGameEnded(g, now)).toBe(true);
  });

  it("returns true for status 'cancelled'", () => {
    const g = mkGame({ status: "cancelled" });
    expect(isGameEnded(g, now)).toBe(true);
  });

  it("returns true for a 'live' row whose end time has already passed", () => {
    // The old local copy short-circuited status === 'live' to not-ended, so a game sat "live"
    // forever if the cron that completes it was late. A window that has elapsed is over.
    const g = mkGame({ status: "live", ended_at: "2026-07-23T06:00:00.000Z" });
    expect(gameEndTimeMs(g)).toBeLessThan(now); // end really is in the past
    expect(isGameEnded(g, now)).toBe(true);
  });

  it("returns true for an open game whose end time is strictly before now", () => {
    const g = mkGame({ status: "open", ended_at: "2026-07-23T11:00:00.000Z" });
    expect(isGameEnded(g, now)).toBe(true);
  });

  it("returns false for an open game ending in the future", () => {
    const g = mkGame({ status: "open", ends_at: "2026-07-23T13:00:00.000Z" });
    expect(isGameEnded(g, now)).toBe(false);
  });

  it("treats end == now as ended — the window has run out", () => {
    const g = mkGame({ ended_at: "2026-07-23T12:00:00.000Z" }); // exactly now
    expect(isGameEnded(g, now)).toBe(true);
  });

  it("returns false when no end time can be resolved", () => {
    const g = mkGame({ status: "open", starts_at: null, created_at: "" });
    expect(gameEndTimeMs(g)).toBeNull();
    expect(isGameEnded(g, now)).toBe(false);
  });
});

describe("isLiveGame", () => {
  const now = Date.parse("2026-07-23T12:00:00.000Z");

  it("is false for an ended row", () => {
    const g = mkGame({ status: "completed" });
    expect(isLiveGame(g, now)).toBe(false);
  });

  it("is false for a future game — scheduled is not live", () => {
    // This is the bug that put next week's games under the "Live" heading: isLiveGame used to
    // be defined as merely !isGameEnded.
    const g = mkGame({ status: "open", starts_at: "2026-07-23T18:00:00.000Z" });
    expect(isGameEnded(g, now)).toBe(false);
    expect(isLiveGame(g, now)).toBe(false);
  });

  it("is true once the start time has passed", () => {
    const g = mkGame({ status: "open", starts_at: "2026-07-23T11:00:00.000Z", ends_at: "2026-07-23T13:00:00.000Z" });
    expect(isLiveGame(g, now)).toBe(true);
  });

  it("is true for a host-started game whose scheduled start is still ahead", () => {
    const g = mkGame({
      status: "live",
      starts_at: "2026-07-23T18:00:00.000Z",
      ends_at: "2026-07-23T13:00:00.000Z",
    });
    expect(isLiveGame(g, now)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// rankGameRows — 4-key sort: sport overlap, nearest, fullest, newest
// ---------------------------------------------------------------------------

describe("rankGameRows", () => {
  it("puts primary-sport matches ahead of non-matches even when farther", () => {
    const match = mkGame({ id: "match", sport: "basketball", distance_km: 10 });
    const nonMatch = mkGame({ id: "non", sport: "tennis", distance_km: 1 });
    const out = rankGameRows([nonMatch, match], { primarySports: ["basketball"] });
    expect(out.map((g) => g.id)).toEqual(["match", "non"]);
  });

  it("matches primary sports case-insensitively", () => {
    const g = mkGame({ id: "a", sport: "Soccer", distance_km: 5 });
    const other = mkGame({ id: "b", sport: "golf", distance_km: 1 });
    const out = rankGameRows([other, g], { primarySports: ["soccer"] });
    expect(out[0].id).toBe("a");
  });

  it("second key: nearer distance wins when sport-match ties", () => {
    const near = mkGame({ id: "near", sport: "x", distance_km: 2, participant_count: 1 });
    const far = mkGame({ id: "far", sport: "x", distance_km: 8, participant_count: 9 });
    const out = rankGameRows([far, near]);
    expect(out.map((g) => g.id)).toEqual(["near", "far"]);
  });

  it("third key: more participants wins when distance ties", () => {
    const full = mkGame({ id: "full", distance_km: 5, participant_count: 10, created_at: "2026-01-01T00:00:00.000Z" });
    const empty = mkGame({ id: "empty", distance_km: 5, participant_count: 3, created_at: "2026-09-01T00:00:00.000Z" });
    const out = rankGameRows([empty, full]);
    expect(out.map((g) => g.id)).toEqual(["full", "empty"]);
  });

  it("fourth key: newest created_at wins on a full three-way tie", () => {
    const old = mkGame({ id: "old", distance_km: 5, participant_count: 4, created_at: "2026-01-01T00:00:00.000Z" });
    const fresh = mkGame({ id: "fresh", distance_km: 5, participant_count: 4, created_at: "2026-09-01T00:00:00.000Z" });
    const out = rankGameRows([old, fresh]);
    expect(out.map((g) => g.id)).toEqual(["fresh", "old"]);
  });

  it("treats undefined participant_count as 0", () => {
    const some = mkGame({ id: "some", distance_km: 5, participant_count: 2 });
    const none = mkGame({ id: "none", distance_km: 5, participant_count: undefined });
    const out = rankGameRows([none, some]);
    expect(out.map((g) => g.id)).toEqual(["some", "none"]);
  });

  it("respects limit and does not mutate the input array", () => {
    const a = mkGame({ id: "a", distance_km: 3 });
    const b = mkGame({ id: "b", distance_km: 1 });
    const c = mkGame({ id: "c", distance_km: 2 });
    const input = [a, b, c];
    const out = rankGameRows(input, { limit: 2 });
    expect(out.map((g) => g.id)).toEqual(["b", "c"]);
    expect(input.map((g) => g.id)).toEqual(["a", "b", "c"]); // untouched
  });

  it("ignores sport overlap entirely when primarySports is empty", () => {
    const a = mkGame({ id: "a", sport: "soccer", distance_km: 9 });
    const b = mkGame({ id: "b", sport: "tennis", distance_km: 1 });
    const out = rankGameRows([a, b], { primarySports: [] });
    expect(out.map((g) => g.id)).toEqual(["b", "a"]); // pure distance order
  });
});

// ---------------------------------------------------------------------------
// splitGamesByLiveness — needs a fixed "now"
// ---------------------------------------------------------------------------

describe("splitGamesByLiveness", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-23T12:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("separates what is on now from what is merely scheduled", () => {
    // The whole point of the third bucket: `uSoon` and `uLater` are real games worth showing,
    // but calling them "Live" was a lie — they haven't started.
    const nowLive = mkGame({
      id: "nowLive",
      status: "live",
      starts_at: "2026-07-23T11:00:00.000Z",
      ends_at: "2026-07-23T13:00:00.000Z",
      distance_km: 1,
    });
    const uLater = mkGame({ id: "uLater", status: "open", starts_at: "2026-07-30T18:00:00.000Z", distance_km: 5 });
    const uSoon = mkGame({ id: "uSoon", status: "open", starts_at: "2026-07-23T18:00:00.000Z", distance_km: 9 });
    const eRecent = mkGame({ id: "eRecent", status: "open", ended_at: "2026-07-23T11:00:00.000Z" });
    const eOld = mkGame({ id: "eOld", status: "completed", ended_at: "2026-07-20T12:00:00.000Z" });
    const eNull = mkGame({ id: "eNull", status: "cancelled", starts_at: null, created_at: "" });

    const { live, upcoming, ended } = splitGamesByLiveness([eOld, uLater, eRecent, nowLive, uSoon, eNull]);

    expect(live.map((g) => g.id)).toEqual(["nowLive"]);
    // upcoming is soonest-first, regardless of distance
    expect(upcoming.map((g) => g.id)).toEqual(["uSoon", "uLater"]);
    // ended ordered most-recently-ended first; null end time (eNull -> 0) sorts last
    expect(ended.map((g) => g.id)).toEqual(["eRecent", "eOld", "eNull"]);
  });

  it("drops untimed games that have outlived the map TTL instead of parking them in Upcoming", () => {
    const fresh = mkGame({ id: "fresh", status: "open", starts_at: null, created_at: "2026-07-23T10:00:00.000Z" });
    const stale = mkGame({ id: "stale", status: "open", starts_at: null, created_at: "2026-07-01T10:00:00.000Z" });

    const { live, upcoming, ended } = splitGamesByLiveness([fresh, stale]);

    expect(upcoming.map((g) => g.id)).toEqual(["fresh"]);
    expect(live).toEqual([]);
    expect(ended).toEqual([]);
  });

  it("forwards primarySports to the live ranking", () => {
    // Both already under way, so they land in `live` where rankGameRows applies.
    const started = { starts_at: "2026-07-23T11:00:00.000Z", ends_at: "2026-07-23T13:00:00.000Z" };
    const match = mkGame({ id: "m", status: "open", sport: "hockey", distance_km: 10, ...started });
    const other = mkGame({ id: "o", status: "open", sport: "chess", distance_km: 1, ...started });
    const { live } = splitGamesByLiveness([other, match], { primarySports: ["hockey"] });
    expect(live[0].id).toBe("m");
  });
});

// ---------------------------------------------------------------------------
// rankHotPickVenues — GeoJSON [lng, lat] handling + distance sort
// ---------------------------------------------------------------------------

describe("rankHotPickVenues", () => {
  const center: LatLng = { lat: 40.0, lng: -73.0 };

  it("reads coordinates as [lng, lat] into lat/lng fields", () => {
    const lng0 = -73.5;
    const lat0 = 40.25;
    const out = rankHotPickVenues(mkFC([mkFeature([lng0, lat0], { id: "a" })]), { center });
    expect(out[0].lng).toBe(lng0);
    expect(out[0].lat).toBe(lat0);
    // distance is computed as distanceKmBetween(center.lat, center.lng, lat, lng)
    expect(out[0].distanceKm).toBeCloseTo(
      distanceKmBetween(center.lat, center.lng, lat0, lng0),
      6,
    );
  });

  it("sorts venues nearest-first relative to the center", () => {
    const near = mkFeature([-73.0, 40.01], { id: "near" }); // ~1km away
    const far = mkFeature([-73.5, 40.5], { id: "far" }); // much farther
    const out = rankHotPickVenues(mkFC([far, near]), { center });
    expect(out.map((v) => v.id)).toEqual(["near", "far"]);
    expect(out[0].distanceKm!).toBeLessThan(out[1].distanceKm!);
  });

  it("sets distanceKm to null for every venue when no center is given", () => {
    const out = rankHotPickVenues(mkFC([mkFeature([-73.0, 40.0], { id: "a" }), mkFeature([-72.0, 41.0], { id: "b" })]));
    expect(out.every((v) => v.distanceKm === null)).toBe(true);
    // null distances all coerce to +Infinity, so a stable sort keeps input order
    expect(out.map((v) => v.id)).toEqual(["a", "b"]);
  });

  it("skips features with non-numeric coordinates", () => {
    const good = mkFeature([-73.0, 40.0], { id: "good" });
    const emptyCoords = mkFeature([], { id: "empty" });
    const missingLat = mkFeature([-73.0], { id: "missingLat" });
    const out = rankHotPickVenues(mkFC([good, emptyCoords, missingLat]), { center });
    expect(out.map((v) => v.id)).toEqual(["good"]);
  });

  it("falls back to 'Unnamed venue' for blank names and trims real ones", () => {
    const blank = mkFeature([-73.0, 40.0], { id: "blank", name: "   " });
    const named = mkFeature([-73.01, 40.0], { id: "named", name: "  Court A " });
    const out = rankHotPickVenues(mkFC([blank, named]), { center });
    const byId = Object.fromEntries(out.map((v) => [v.id, v]));
    expect(byId.blank.name).toBe("Unnamed venue");
    expect(byId.named.name).toBe("Court A");
  });

  it("normalizes optional string fields (whitespace -> null, real values trimmed)", () => {
    const f = mkFeature([-73.0, 40.0], {
      id: "props",
      sport: "soccer",
      surface: "   ",
      access: "public",
      opening_hours: "",
      website: " https://x.test ",
      operator: null as unknown as string,
      hero_image_url: undefined,
    });
    const out = rankHotPickVenues(mkFC([f]), { center });
    const v = out[0];
    expect(v.sport).toBe("soccer");
    expect(v.surface).toBeNull();
    expect(v.access).toBe("public");
    expect(v.openingHours).toBeNull();
    expect(v.website).toBe("https://x.test");
    expect(v.operator).toBeNull();
    expect(v.heroImageUrl).toBeNull();
  });

  it("returns [] for a null feature collection", () => {
    expect(rankHotPickVenues(null, { center })).toEqual([]);
  });

  it("respects limit after sorting", () => {
    const near = mkFeature([-73.0, 40.01], { id: "near" });
    const mid = mkFeature([-73.1, 40.1], { id: "mid" });
    const far = mkFeature([-73.5, 40.5], { id: "far" });
    const out = rankHotPickVenues(mkFC([far, near, mid]), { center, limit: 2 });
    expect(out.map((v) => v.id)).toEqual(["near", "mid"]);
  });
});

// ---------------------------------------------------------------------------
// formatKm — boundary behavior
// ---------------------------------------------------------------------------

describe("formatKm", () => {
  it("returns null for null/undefined", () => {
    expect(formatKm(null)).toBeNull();
    expect(formatKm(undefined)).toBeNull();
  });

  it("renders sub-1km distances in rounded meters", () => {
    expect(formatKm(0)).toBe("0 m");
    expect(formatKm(0.5)).toBe("500 m");
    expect(formatKm(0.9994)).toBe("999 m");
  });

  it("rounds 0.9999km up to '1000 m' (real Math.round behavior at the boundary)", () => {
    expect(formatKm(0.9999)).toBe("1000 m");
  });

  it("renders 1km..<10km with one decimal", () => {
    expect(formatKm(1)).toBe("1.0 km");
    expect(formatKm(2.34)).toBe("2.3 km");
    expect(formatKm(9.9)).toBe("9.9 km");
  });

  it("rounds 9.99km to '10.0 km' via toFixed(1) (still on the <10 branch)", () => {
    expect(formatKm(9.99)).toBe("10.0 km");
  });

  it("renders >=10km as a whole rounded number", () => {
    expect(formatKm(10)).toBe("10 km");
    expect(formatKm(10.4)).toBe("10 km");
    expect(formatKm(12.6)).toBe("13 km");
  });
});

// ---------------------------------------------------------------------------
// Cross-check: hotPicks' fallback chain agrees with mapGameTimer for rows
// that both modules resolve identically (ends_at, or starts_at + duration).
// (Divergences — ended_at, created_at fallback, 'live' override, < vs <= —
//  are intentional and NOT asserted as agreement here.)
// ---------------------------------------------------------------------------

describe("agreement with mapGameTimer", () => {
  const now = Date.parse("2026-07-23T12:00:00.000Z");

  it("gameEndTimeMs === getGameEndsAtMs for an ends_at-driven row", () => {
    const g = mkGame({ ended_at: null, ends_at: "2026-07-23T20:00:00.000Z", starts_at: "2026-07-23T18:00:00.000Z" });
    expect(gameEndTimeMs(g)).toBe(getGameEndsAtMs(g));
  });

  it("gameEndTimeMs === getGameEndsAtMs for a starts_at+duration row", () => {
    const g = mkGame({ ended_at: null, ends_at: null, starts_at: "2026-07-23T05:00:00.000Z", duration_minutes: 45 });
    expect(gameEndTimeMs(g)).toBe(getGameEndsAtMs(g));
  });

  it("isGameEnded agrees for a clearly-past and a clearly-future ends_at row", () => {
    const past = mkGame({ status: "open", ends_at: "2026-07-23T11:00:00.000Z" });
    const future = mkGame({ status: "open", ends_at: "2026-07-23T13:00:00.000Z" });
    expect(isGameEnded(past, now)).toBe(timerIsGameEnded(past, now));
    expect(isGameEnded(future, now)).toBe(timerIsGameEnded(future, now));
    expect(isGameEnded(past, now)).toBe(true);
    expect(isGameEnded(future, now)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// venueActivity / pickActiveVenues — the Popular Venues "Happening now" shelf
// ---------------------------------------------------------------------------

describe("venueActivity", () => {
  const now = Date.parse("2026-07-23T12:00:00.000Z");
  const HOUR = 60 * MIN;

  it("reports no activity for a venue with no games", () => {
    const a = venueActivity([], now);
    expect(a.tier).toBe("none");
    expect(a.headline).toBeNull();
    expect(a.leadGame).toBeNull();
    expect(a.sports).toEqual([]);
  });

  it("ignores games that already ended", () => {
    const ended = mkGame({ id: "e", starts_at: new Date(now - 5 * HOUR).toISOString(), duration_minutes: 60 });
    expect(venueActivity([ended], now).tier).toBe("none");
  });

  it("ignores untimed pickup games past their map TTL", () => {
    const stale = mkGame({ id: "s", starts_at: null, created_at: new Date(now - 5 * 24 * HOUR).toISOString() });
    expect(venueActivity([stale], now).tier).toBe("none");
  });

  it("reports live when a game is in its window", () => {
    const live = mkGame({ id: "l", status: "live", live_started_at: new Date(now - 10 * MIN).toISOString() });
    const a = venueActivity([live], now);
    expect(a.tier).toBe("live");
    expect(a.liveCount).toBe(1);
    expect(a.leadGame?.id).toBe("l");
    expect(a.headline).toContain("Live");
  });

  it("reports soon for a game starting inside the live window", () => {
    const soon = mkGame({ id: "s", starts_at: new Date(now + 40 * MIN).toISOString() });
    const a = venueActivity([soon], now);
    expect(a.tier).toBe("soon");
    expect(a.soonCount).toBe(1);
    expect(a.headline).toContain("Starts in");
  });

  it("does not call a game days away 'soon', but still counts it", () => {
    const later = mkGame({ id: "x", starts_at: new Date(now + 3 * 24 * HOUR).toISOString() });
    const a = venueActivity([later], now);
    expect(a.tier).toBe("none");
    expect(a.upcomingCount).toBe(1);
  });

  it("prefers a live game over a sooner-starting scheduled one for the headline", () => {
    const live = mkGame({ id: "l", status: "live", live_started_at: new Date(now - 5 * MIN).toISOString() });
    const soon = mkGame({ id: "s", starts_at: new Date(now + 10 * MIN).toISOString() });
    expect(venueActivity([soon, live], now).leadGame?.id).toBe("l");
  });

  it("leads with the soonest start when nothing is live", () => {
    const later = mkGame({ id: "later", starts_at: new Date(now + 2 * HOUR).toISOString() });
    const sooner = mkGame({ id: "sooner", starts_at: new Date(now + 30 * MIN).toISOString() });
    expect(venueActivity([later, sooner], now).leadGame?.id).toBe("sooner");
  });

  it("collects distinct sports without duplicates", () => {
    const games = [
      mkGame({ id: "a", sport: "basketball", status: "live" }),
      mkGame({ id: "b", sport: "basketball", status: "live" }),
      mkGame({ id: "c", sport: "soccer", status: "live" }),
    ];
    expect(venueActivity(games, now).sports).toEqual(["basketball", "soccer"]);
  });
});

describe("pickActiveVenues", () => {
  const now = Date.parse("2026-07-23T12:00:00.000Z");

  function mkVenue(id: string, distanceKm: number, games: GameRow[]): HotPickVenue {
    return {
      id,
      name: id,
      sport: null,
      leisure: null,
      lat: 0,
      lng: 0,
      distanceKm,
      surface: null,
      lit: null,
      access: null,
      openingHours: null,
      website: null,
      operator: null,
      heroImageUrl: null,
      games,
    };
  }

  const liveGame = () => mkGame({ id: "l" + Math.random(), status: "live" });
  const soonGame = () => mkGame({ id: "s" + Math.random(), starts_at: new Date(now + 30 * MIN).toISOString() });

  it("drops venues with nothing on", () => {
    const out = pickActiveVenues([mkVenue("quiet", 0.1, []), mkVenue("busy", 5, [liveGame()])], now);
    expect(out.map((v) => v.id)).toEqual(["busy"]);
  });

  it("puts live venues ahead of soon ones even when they are farther away", () => {
    const out = pickActiveVenues(
      [mkVenue("soon-near", 0.2, [soonGame()]), mkVenue("live-far", 9, [liveGame()])],
      now,
    );
    expect(out.map((v) => v.id)).toEqual(["live-far", "soon-near"]);
  });

  it("sorts by distance inside a tier", () => {
    const out = pickActiveVenues(
      [mkVenue("far", 8, [liveGame()]), mkVenue("near", 0.5, [liveGame()]), mkVenue("mid", 3, [liveGame()])],
      now,
    );
    expect(out.map((v) => v.id)).toEqual(["near", "mid", "far"]);
  });

  it("caps the shelf at six venues by default and honours an explicit limit", () => {
    const venues = Array.from({ length: 10 }, (_, i) => mkVenue(`v${i}`, i, [liveGame()]));
    expect(pickActiveVenues(venues, now)).toHaveLength(6);
    expect(pickActiveVenues(venues, now, { limit: 2 }).map((v) => v.id)).toEqual(["v0", "v1"]);
  });

  it("sorts venues with unknown distance last rather than dropping them", () => {
    const unknown = mkVenue("unknown", 0, [liveGame()]);
    unknown.distanceKm = null;
    const out = pickActiveVenues([unknown, mkVenue("known", 4, [liveGame()])], now);
    expect(out.map((v) => v.id)).toEqual(["known", "unknown"]);
  });
});
