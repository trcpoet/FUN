import { describe, it, expect } from "vitest";
import type { GameRow } from "./supabase";
import {
  MAP_UNTIMED_TTL_MS,
  DEFAULT_GAME_DURATION_MIN,
  LIVE_WINDOW_MS,
  UNTIMED_LIVE_GRACE_MS,
  isVenueGame,
  formatCountdownDHMS,
  getCountdownUrgency,
  getGameEndsAtMs,
  isGameEnded,
  getMinutesUntilGameEnd,
  formatUrgentCountdown,
  getCountdownRemainingMs,
  isGameLive,
  minCountdownAmongRandomGames,
  formatVenueGameTimerSummary,
  isGameInLiveWindow,
  getLiveStripBadgeTone,
  formatLiveStripCardSummary,
  filterGamesVisibleOnMap,
} from "./mapGameTimer";

// Fixed reference "now" — deterministic, independent of the real clock.
// No function under test reads Date.now(); they all take an explicit nowMs,
// so a plain constant is sufficient (no fake timers needed).
const NOW = new Date("2026-07-23T12:00:00Z").getTime();

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** ISO string offset from NOW by the given number of ms. */
function iso(msFromNow: number): string {
  return new Date(NOW + msFromNow).toISOString();
}

/** Build a full, strictly-typed GameRow with sane defaults; override as needed. */
function makeGame(overrides: Partial<GameRow> = {}): GameRow {
  return {
    id: "g1",
    title: "Test Game",
    sport: "soccer",
    spots_needed: 10,
    starts_at: null,
    created_by: "u1",
    created_at: new Date(NOW).toISOString(),
    distance_km: 1,
    lat: 40,
    lng: -73,
    ...overrides,
  };
}

describe("constants", () => {
  it("MAP_UNTIMED_TTL_MS is 3 days", () => {
    expect(MAP_UNTIMED_TTL_MS).toBe(3 * DAY);
  });
  it("DEFAULT_GAME_DURATION_MIN is 90", () => {
    expect(DEFAULT_GAME_DURATION_MIN).toBe(90);
  });
  it("LIVE_WINDOW_MS is 3 hours", () => {
    expect(LIVE_WINDOW_MS).toBe(3 * HOUR);
  });
  it("UNTIMED_LIVE_GRACE_MS is 1 hour", () => {
    expect(UNTIMED_LIVE_GRACE_MS).toBe(HOUR);
  });
});

describe("isVenueGame", () => {
  it("true when location_label has non-whitespace content", () => {
    expect(isVenueGame(makeGame({ location_label: "Court A" }))).toBe(true);
  });
  it("true after trimming surrounding whitespace", () => {
    expect(isVenueGame(makeGame({ location_label: "  Court  " }))).toBe(true);
  });
  it("false for null", () => {
    expect(isVenueGame(makeGame({ location_label: null }))).toBe(false);
  });
  it("false for undefined (absent)", () => {
    expect(isVenueGame(makeGame())).toBe(false);
  });
  it("false for empty string", () => {
    expect(isVenueGame(makeGame({ location_label: "" }))).toBe(false);
  });
  it("false for whitespace-only string", () => {
    expect(isVenueGame(makeGame({ location_label: "   " }))).toBe(false);
  });
});

describe("formatCountdownDHMS", () => {
  it("zero -> 00/00/00/00", () => {
    expect(formatCountdownDHMS(0)).toBe("00/00/00/00");
  });
  it("negative clamps to 00/00/00/00", () => {
    expect(formatCountdownDHMS(-5000)).toBe("00/00/00/00");
  });
  it("seconds only", () => {
    expect(formatCountdownDHMS(45_000)).toBe("00/00/00/45");
  });
  it("1d 2h 3m 4s -> 01/02/03/04", () => {
    const ms = (1 * 86400 + 2 * 3600 + 3 * 60 + 4) * 1000;
    expect(formatCountdownDHMS(ms)).toBe("01/02/03/04");
  });
  it("days beyond 99 are not truncated (pad2 only pads, never cuts)", () => {
    expect(formatCountdownDHMS(100 * DAY)).toBe("100/00/00/00");
  });
});

describe("getCountdownUrgency", () => {
  it("under 1h -> critical", () => {
    expect(getCountdownUrgency(30 * MIN)).toBe("critical");
  });
  it("exactly 1h -> high (boundary is exclusive on critical)", () => {
    expect(getCountdownUrgency(HOUR)).toBe("high");
  });
  it("mid-day window -> high", () => {
    expect(getCountdownUrgency(12 * HOUR)).toBe("high");
  });
  it("exactly 24h -> calm (boundary is exclusive on high)", () => {
    expect(getCountdownUrgency(24 * HOUR)).toBe("calm");
  });
  it("beyond a day -> calm", () => {
    expect(getCountdownUrgency(48 * HOUR)).toBe("calm");
  });
  it("negative -> critical", () => {
    expect(getCountdownUrgency(-1)).toBe("critical");
  });
  it("zero -> critical", () => {
    expect(getCountdownUrgency(0)).toBe("critical");
  });
});

describe("getGameEndsAtMs", () => {
  it("prefers ends_at when present and valid (ignores starts_at + duration)", () => {
    const game = makeGame({
      ends_at: iso(HOUR),
      starts_at: iso(-10 * MIN),
      duration_minutes: 90,
    });
    expect(getGameEndsAtMs(game)).toBe(NOW + HOUR);
  });
  it("falls back to starts_at + duration_minutes when ends_at is whitespace", () => {
    const game = makeGame({
      ends_at: "   ",
      starts_at: iso(0),
      duration_minutes: 30,
    });
    expect(getGameEndsAtMs(game)).toBe(NOW + 30 * MIN);
  });
  it("falls back to starts_at + duration when ends_at is an invalid ISO string", () => {
    const game = makeGame({
      ends_at: "not-a-date",
      starts_at: iso(0),
      duration_minutes: 45,
    });
    expect(getGameEndsAtMs(game)).toBe(NOW + 45 * MIN);
  });
  it("uses DEFAULT_GAME_DURATION_MIN (90) when duration_minutes is null", () => {
    const game = makeGame({ starts_at: iso(0), duration_minutes: null });
    expect(getGameEndsAtMs(game)).toBe(NOW + 90 * MIN);
  });
  it("uses DEFAULT_GAME_DURATION_MIN when duration_minutes is absent", () => {
    const game = makeGame({ starts_at: iso(0) });
    expect(getGameEndsAtMs(game)).toBe(NOW + 90 * MIN);
  });
  it("duration_minutes of 0 is honored via nullish-coalescing (ends == start)", () => {
    const game = makeGame({ starts_at: iso(0), duration_minutes: 0 });
    expect(getGameEndsAtMs(game)).toBe(NOW);
  });
  it("returns null when there is no starts_at and no ends_at", () => {
    expect(getGameEndsAtMs(makeGame())).toBeNull();
  });
  it("returns null when starts_at is an invalid ISO string and no ends_at", () => {
    expect(getGameEndsAtMs(makeGame({ starts_at: "garbage" }))).toBeNull();
  });
});

describe("isGameEnded", () => {
  it("status completed short-circuits to true even with a future end", () => {
    const game = makeGame({ status: "completed", ends_at: iso(HOUR) });
    expect(isGameEnded(game, NOW)).toBe(true);
  });
  it("status cancelled short-circuits to true", () => {
    const game = makeGame({ status: "cancelled", ends_at: iso(HOUR) });
    expect(isGameEnded(game, NOW)).toBe(true);
  });
  it("true when computed end has passed", () => {
    const game = makeGame({ starts_at: iso(-2 * HOUR), duration_minutes: 90 });
    expect(isGameEnded(game, NOW)).toBe(true);
  });
  it("false when end is in the future", () => {
    const game = makeGame({ starts_at: iso(-10 * MIN), duration_minutes: 90 });
    expect(isGameEnded(game, NOW)).toBe(false);
  });
  it("boundary: end exactly at now counts as ended (<=)", () => {
    const game = makeGame({ ends_at: iso(0) });
    expect(isGameEnded(game, NOW)).toBe(true);
  });
  it("false for untimed game with no resolvable end", () => {
    expect(isGameEnded(makeGame(), NOW)).toBe(false);
  });
});

describe("getMinutesUntilGameEnd", () => {
  it("null when no end can be resolved", () => {
    expect(getMinutesUntilGameEnd(makeGame(), NOW)).toBeNull();
  });
  it("positive minutes remaining, rounded up (ceil)", () => {
    // end is 61s away -> ceil(61/60) = 2 minutes
    const game = makeGame({ ends_at: iso(61_000) });
    expect(getMinutesUntilGameEnd(game, NOW)).toBe(2);
  });
  it("whole minute remaining", () => {
    const game = makeGame({ starts_at: iso(-30 * MIN), duration_minutes: 90 });
    // ends at NOW + 60min
    expect(getMinutesUntilGameEnd(game, NOW)).toBe(60);
  });
  it("negative when the game already ended", () => {
    const game = makeGame({ starts_at: iso(-120 * MIN), duration_minutes: 90 });
    // ends at NOW - 30min
    expect(getMinutesUntilGameEnd(game, NOW)).toBe(-30);
  });
});

describe("formatUrgentCountdown", () => {
  it("zero -> 00:00", () => {
    expect(formatUrgentCountdown(0)).toBe("00:00");
  });
  it("negative clamps -> 00:00", () => {
    expect(formatUrgentCountdown(-1000)).toBe("00:00");
  });
  it("under a minute -> MM:SS", () => {
    expect(formatUrgentCountdown(30_000)).toBe("00:30");
  });
  it("minutes under an hour -> MM:SS", () => {
    expect(formatUrgentCountdown(5 * MIN)).toBe("05:00");
  });
  it("just under an hour stays MM:SS", () => {
    expect(formatUrgentCountdown(59 * MIN + 59_000)).toBe("59:59");
  });
  it("exactly one hour rolls to HH:MM:SS", () => {
    expect(formatUrgentCountdown(HOUR)).toBe("01:00:00");
  });
  it("90 minutes -> 01:30:00", () => {
    expect(formatUrgentCountdown(90 * MIN)).toBe("01:30:00");
  });
  it("exactly one day rolls to compact days form", () => {
    expect(formatUrgentCountdown(DAY)).toBe("1d 0h 0m");
  });
  it("25 hours -> 1d 1h 0m", () => {
    expect(formatUrgentCountdown(25 * HOUR)).toBe("1d 1h 0m");
  });
  it("multi-day compact form", () => {
    const ms = (2 * 86400 + 3 * 3600 + 4 * 60) * 1000;
    expect(formatUrgentCountdown(ms)).toBe("2d 3h 4m");
  });
});

describe("getCountdownRemainingMs", () => {
  it("future scheduled start -> ms until start", () => {
    const game = makeGame({ starts_at: iso(HOUR) });
    expect(getCountdownRemainingMs(game, NOW)).toBe(HOUR);
  });
  it("past scheduled start -> null (live/started)", () => {
    const game = makeGame({ starts_at: iso(-MIN) });
    expect(getCountdownRemainingMs(game, NOW)).toBeNull();
  });
  it("start exactly at now -> null (<=)", () => {
    const game = makeGame({ starts_at: iso(0) });
    expect(getCountdownRemainingMs(game, NOW)).toBeNull();
  });
  it("untimed game within TTL -> ms until map expiry", () => {
    const game = makeGame({ created_at: new Date(NOW).toISOString() });
    expect(getCountdownRemainingMs(game, NOW)).toBe(MAP_UNTIMED_TTL_MS);
  });
  it("untimed game past TTL -> null", () => {
    const game = makeGame({ created_at: new Date(NOW - 4 * DAY).toISOString() });
    expect(getCountdownRemainingMs(game, NOW)).toBeNull();
  });
  it("boundary: untimed game exactly at TTL edge -> null (left > 0 is exclusive)", () => {
    const game = makeGame({ created_at: new Date(NOW - MAP_UNTIMED_TTL_MS).toISOString() });
    expect(getCountdownRemainingMs(game, NOW)).toBeNull();
  });
  it("invalid starts_at yields NaN (real behavior: NaN <= now is false, returns NaN - now)", () => {
    const game = makeGame({ starts_at: "garbage" });
    const result = getCountdownRemainingMs(game, NOW);
    expect(result).not.toBeNull();
    expect(Number.isNaN(result as number)).toBe(true);
  });
});

describe("isGameLive", () => {
  it("false without a starts_at", () => {
    expect(isGameLive(makeGame(), NOW)).toBe(false);
  });
  it("false when ended (status completed) despite past start", () => {
    const game = makeGame({ starts_at: iso(-MIN), status: "completed" });
    expect(isGameLive(game, NOW)).toBe(false);
  });
  it("true when started and still within window", () => {
    const game = makeGame({ starts_at: iso(-10 * MIN), duration_minutes: 90 });
    expect(isGameLive(game, NOW)).toBe(true);
  });
  it("boundary: start exactly at now -> true (<=)", () => {
    const game = makeGame({ starts_at: iso(0), duration_minutes: 90 });
    expect(isGameLive(game, NOW)).toBe(true);
  });
  it("false when start is still in the future", () => {
    const game = makeGame({ starts_at: iso(HOUR), duration_minutes: 90 });
    expect(isGameLive(game, NOW)).toBe(false);
  });
});

describe("minCountdownAmongRandomGames", () => {
  it("null for an empty list", () => {
    expect(minCountdownAmongRandomGames([], NOW)).toBeNull();
  });
  it("null when only venue games are present (filtered out)", () => {
    const venue = makeGame({ location_label: "Court A", starts_at: iso(HOUR) });
    expect(minCountdownAmongRandomGames([venue], NOW)).toBeNull();
  });
  it("null when all relevant games have ended", () => {
    const ended = makeGame({ starts_at: iso(-2 * HOUR), duration_minutes: 90 });
    expect(minCountdownAmongRandomGames([ended], NOW)).toBeNull();
  });
  it("returns tightest countdown among non-venue future games", () => {
    const a = makeGame({ id: "a", starts_at: iso(2 * HOUR) });
    const b = makeGame({ id: "b", starts_at: iso(30 * MIN) });
    const venue = makeGame({ id: "v", location_label: "Rink", starts_at: iso(MIN) });
    const result = minCountdownAmongRandomGames([a, b, venue], NOW);
    expect(result).toEqual({ mode: "countdown", ms: 30 * MIN });
  });
  it("returns live when only a started (non-venue) game is relevant", () => {
    const live = makeGame({ starts_at: iso(-10 * MIN), duration_minutes: 90 });
    expect(minCountdownAmongRandomGames([live], NOW)).toEqual({ mode: "live" });
  });
  it("countdown takes precedence over live when both exist", () => {
    const live = makeGame({ id: "live", starts_at: iso(-10 * MIN), duration_minutes: 90 });
    const upcoming = makeGame({ id: "up", starts_at: iso(45 * MIN) });
    expect(minCountdownAmongRandomGames([live, upcoming], NOW)).toEqual({
      mode: "countdown",
      ms: 45 * MIN,
    });
  });
  it("untimed recent non-venue game contributes its TTL countdown", () => {
    const untimed = makeGame({ created_at: new Date(NOW - HOUR).toISOString() });
    expect(minCountdownAmongRandomGames([untimed], NOW)).toEqual({
      mode: "countdown",
      ms: MAP_UNTIMED_TTL_MS - HOUR,
    });
  });
});

describe("formatVenueGameTimerSummary", () => {
  it("untimed within TTL -> 'No set time ... left on map'", () => {
    const game = makeGame({ created_at: new Date(NOW).toISOString() });
    const out = formatVenueGameTimerSummary(game, NOW);
    expect(out.startsWith("No set time · ")).toBe(true);
    expect(out).toContain("left on map");
  });
  it("untimed past TTL -> 'No longer on map'", () => {
    const game = makeGame({ created_at: new Date(NOW - 4 * DAY).toISOString() });
    expect(formatVenueGameTimerSummary(game, NOW)).toBe("No longer on map");
  });
  it("scheduled future -> includes 'starts in'", () => {
    const game = makeGame({ starts_at: iso(2 * HOUR) });
    expect(formatVenueGameTimerSummary(game, NOW)).toContain("starts in");
  });
  it("ended scheduled game -> includes 'Ended'", () => {
    const game = makeGame({ starts_at: iso(-3 * HOUR), duration_minutes: 90 });
    expect(formatVenueGameTimerSummary(game, NOW)).toContain("Ended");
  });
  it("live scheduled game -> includes 'Live' and 'left'", () => {
    const game = makeGame({ starts_at: iso(-10 * MIN), duration_minutes: 90 });
    const out = formatVenueGameTimerSummary(game, NOW);
    expect(out).toContain("Live");
    expect(out).toContain("left");
  });
});

describe("isGameInLiveWindow", () => {
  it("false when the game has ended (checked before status)", () => {
    const game = makeGame({ starts_at: iso(-3 * HOUR), duration_minutes: 90 });
    expect(isGameInLiveWindow(game, NOW)).toBe(false);
  });
  it("status 'live' but past its computed end -> false (isGameEnded wins)", () => {
    // status 'live' does NOT short-circuit isGameEnded; the end has passed.
    const game = makeGame({ status: "live", starts_at: iso(-3 * HOUR), duration_minutes: 90 });
    expect(isGameInLiveWindow(game, NOW)).toBe(false);
  });
  it("status 'live' and not ended -> true", () => {
    const game = makeGame({ status: "live", starts_at: iso(-10 * MIN), duration_minutes: 90 });
    expect(isGameInLiveWindow(game, NOW)).toBe(true);
  });
  it("started (past) and not ended -> true", () => {
    const game = makeGame({ starts_at: iso(-10 * MIN), duration_minutes: 90 });
    expect(isGameInLiveWindow(game, NOW)).toBe(true);
  });
  it("future start within default window -> true", () => {
    const game = makeGame({ starts_at: iso(2 * HOUR) });
    expect(isGameInLiveWindow(game, NOW)).toBe(true);
  });
  it("future start beyond default window -> false", () => {
    const game = makeGame({ starts_at: iso(4 * HOUR) });
    expect(isGameInLiveWindow(game, NOW)).toBe(false);
  });
  it("custom windowMs narrows the acceptance range", () => {
    const game = makeGame({ starts_at: iso(2 * HOUR) });
    expect(isGameInLiveWindow(game, NOW, HOUR)).toBe(false);
  });
  it("invalid starts_at -> false", () => {
    const game = makeGame({ starts_at: "garbage" });
    expect(isGameInLiveWindow(game, NOW)).toBe(false);
  });
  it("untimed game created within grace -> true", () => {
    const game = makeGame({ created_at: new Date(NOW - 30 * MIN).toISOString() });
    expect(isGameInLiveWindow(game, NOW)).toBe(true);
  });
  it("untimed game created beyond grace -> false", () => {
    const game = makeGame({ created_at: new Date(NOW - 2 * HOUR).toISOString() });
    expect(isGameInLiveWindow(game, NOW)).toBe(false);
  });
  it("untimed game created in the future (negative age) -> false", () => {
    const game = makeGame({ created_at: new Date(NOW + 10 * MIN).toISOString() });
    expect(isGameInLiveWindow(game, NOW)).toBe(false);
  });
});

describe("getLiveStripBadgeTone", () => {
  it("status 'live' -> 'live' (no end check here)", () => {
    const game = makeGame({ status: "live" });
    expect(getLiveStripBadgeTone(game, NOW)).toBe("live");
  });
  it("started (past) scheduled game -> 'live'", () => {
    const game = makeGame({ starts_at: iso(-MIN) });
    expect(getLiveStripBadgeTone(game, NOW)).toBe("live");
  });
  it("starting within the hour -> 'soon'", () => {
    const game = makeGame({ starts_at: iso(30 * MIN) });
    expect(getLiveStripBadgeTone(game, NOW)).toBe("soon");
  });
  it("boundary: exactly one hour out -> 'soon' (<=)", () => {
    const game = makeGame({ starts_at: iso(HOUR) });
    expect(getLiveStripBadgeTone(game, NOW)).toBe("soon");
  });
  it("more than an hour out -> 'calm'", () => {
    const game = makeGame({ starts_at: iso(2 * HOUR) });
    expect(getLiveStripBadgeTone(game, NOW)).toBe("calm");
  });
  it("invalid starts_at -> 'calm'", () => {
    const game = makeGame({ starts_at: "garbage" });
    expect(getLiveStripBadgeTone(game, NOW)).toBe("calm");
  });
  it("no start and not live -> 'calm'", () => {
    expect(getLiveStripBadgeTone(makeGame(), NOW)).toBe("calm");
  });
});

describe("formatLiveStripCardSummary", () => {
  it("singular 'spot' when exactly one remaining", () => {
    const game = makeGame({ starts_at: iso(30 * MIN), spots_remaining: 1 });
    expect(formatLiveStripCardSummary(game, NOW)).toBe("Starts in 30 min · 1 spot");
  });
  it("plural 'spots' when more than one remaining", () => {
    const game = makeGame({ starts_at: iso(42 * MIN), spots_remaining: 2 });
    expect(formatLiveStripCardSummary(game, NOW)).toBe("Starts in 42 min · 2 spots");
  });
  it("zero remaining is plural '0 spots'", () => {
    const game = makeGame({ starts_at: iso(10 * MIN), spots_remaining: 0 });
    expect(formatLiveStripCardSummary(game, NOW)).toBe("Starts in 10 min · 0 spots");
  });
  it("falls back to 'N player cap' when spots_remaining is absent", () => {
    const game = makeGame({ starts_at: iso(20 * MIN), spots_needed: 8 });
    expect(formatLiveStripCardSummary(game, NOW)).toBe("Starts in 20 min · 8 player cap");
  });
  it("ended game -> 'Game ended · <spots>'", () => {
    const game = makeGame({ status: "completed", spots_remaining: 3 });
    expect(formatLiveStripCardSummary(game, NOW)).toBe("Game ended · 3 spots");
  });
  it("invalid starts_at -> bare spots string", () => {
    const game = makeGame({ starts_at: "garbage", spots_remaining: 5 });
    expect(formatLiveStripCardSummary(game, NOW)).toBe("5 spots");
  });
  it("live in-window -> 'Live · <countdown> left · <spots>'", () => {
    const game = makeGame({ starts_at: iso(-10 * MIN), duration_minutes: 90, spots_remaining: 4 });
    const out = formatLiveStripCardSummary(game, NOW);
    // ends 80 min from now -> 01:20:00
    expect(out).toBe("Live · 01:20:00 left · 4 spots");
  });
  it("sub-minute lead time rounds up to 'Starts in 1 min'", () => {
    const game = makeGame({ starts_at: iso(30_000), spots_remaining: 1 });
    expect(formatLiveStripCardSummary(game, NOW)).toBe("Starts in 1 min · 1 spot");
  });
  it("hours + minutes lead time", () => {
    const game = makeGame({ starts_at: iso(2 * HOUR + 30 * MIN), spots_remaining: 2 });
    expect(formatLiveStripCardSummary(game, NOW)).toBe("Starts in 2h 30m · 2 spots");
  });
  it("whole-hour lead time omits the minutes segment", () => {
    const game = makeGame({ starts_at: iso(2 * HOUR), spots_remaining: 2 });
    expect(formatLiveStripCardSummary(game, NOW)).toBe("Starts in 2h · 2 spots");
  });
  it("lead time of 48h+ rolls to days", () => {
    const game = makeGame({ starts_at: iso(3 * DAY), spots_remaining: 2 });
    expect(formatLiveStripCardSummary(game, NOW)).toBe("Starts in 3 days · 2 spots");
  });
  it("untimed game within grace -> 'Pickup soon · <spots>'", () => {
    const game = makeGame({ created_at: new Date(NOW - 30 * MIN).toISOString(), spots_remaining: 6 });
    expect(formatLiveStripCardSummary(game, NOW)).toBe("Pickup soon · 6 spots");
  });
  it("untimed game beyond grace -> bare spots string", () => {
    const game = makeGame({ created_at: new Date(NOW - 2 * HOUR).toISOString(), spots_remaining: 6 });
    expect(formatLiveStripCardSummary(game, NOW)).toBe("6 spots");
  });
});

describe("filterGamesVisibleOnMap", () => {
  it("excludes completed games", () => {
    const g = makeGame({ status: "completed", starts_at: iso(HOUR) });
    expect(filterGamesVisibleOnMap([g], NOW)).toEqual([]);
  });
  it("excludes cancelled games", () => {
    const g = makeGame({ status: "cancelled", starts_at: iso(HOUR) });
    expect(filterGamesVisibleOnMap([g], NOW)).toEqual([]);
  });
  it("excludes games whose window has ended", () => {
    const g = makeGame({ starts_at: iso(-2 * HOUR), duration_minutes: 90 });
    expect(filterGamesVisibleOnMap([g], NOW)).toEqual([]);
  });
  it("includes a future scheduled game", () => {
    const g = makeGame({ id: "future", starts_at: iso(HOUR) });
    expect(filterGamesVisibleOnMap([g], NOW).map((x) => x.id)).toEqual(["future"]);
  });
  it("includes a live (started, not ended) scheduled game", () => {
    const g = makeGame({ id: "live", starts_at: iso(-10 * MIN), duration_minutes: 90 });
    expect(filterGamesVisibleOnMap([g], NOW).map((x) => x.id)).toEqual(["live"]);
  });
  it("includes an untimed game within TTL", () => {
    const g = makeGame({ id: "u", created_at: new Date(NOW - HOUR).toISOString() });
    expect(filterGamesVisibleOnMap([g], NOW).map((x) => x.id)).toEqual(["u"]);
  });
  it("excludes an untimed game past TTL", () => {
    const g = makeGame({ created_at: new Date(NOW - 4 * DAY).toISOString() });
    expect(filterGamesVisibleOnMap([g], NOW)).toEqual([]);
  });
  it("whitespace-only starts_at is treated as untimed (TTL rules apply)", () => {
    const g = makeGame({ id: "ws", starts_at: "   ", created_at: new Date(NOW).toISOString() });
    expect(filterGamesVisibleOnMap([g], NOW).map((x) => x.id)).toEqual(["ws"]);
  });
  it("filters a mixed list down to the visible subset", () => {
    const games = [
      makeGame({ id: "keep-future", starts_at: iso(HOUR) }),
      makeGame({ id: "drop-completed", status: "completed", starts_at: iso(HOUR) }),
      makeGame({ id: "drop-ended", starts_at: iso(-3 * HOUR), duration_minutes: 90 }),
      makeGame({ id: "keep-untimed", created_at: new Date(NOW).toISOString() }),
    ];
    expect(filterGamesVisibleOnMap(games, NOW).map((x) => x.id).sort()).toEqual([
      "keep-future",
      "keep-untimed",
    ]);
  });
});

// Regression: the host presses "Start game" on a game scheduled for later, and
// the map pin keeps counting down to the original start instead of going LIVE.
// Reported against game ab56b33a — created 02:22, starts_at 03:21, Start pressed
// at 02:22:39, pin still showed a ~1h countdown.
describe("host-started games (status='live')", () => {
  it("isGameLive is true even when starts_at is still in the future", () => {
    const g = makeGame({ status: "live", starts_at: iso(59 * MIN), duration_minutes: 15 });
    expect(isGameLive(g, NOW)).toBe(true);
  });

  it("getCountdownRemainingMs stops counting down to the old start time", () => {
    const g = makeGame({ status: "live", starts_at: iso(59 * MIN), duration_minutes: 15 });
    expect(getCountdownRemainingMs(g, NOW)).toBeNull();
  });

  it("an unscheduled live game ends duration minutes after live_started_at", () => {
    const g = makeGame({
      status: "live",
      starts_at: null,
      live_started_at: iso(-30 * MIN),
      duration_minutes: 60,
    });
    expect(getGameEndsAtMs(g)).toBe(NOW + 30 * MIN);
    expect(isGameEnded(g, NOW)).toBe(false);
  });

  // The stale-Live bug: status stays 'live' forever unless the host presses
  // "End game", so liveness must be derived from the window, not the status.
  it("an unscheduled live game past its window counts as ended", () => {
    const g = makeGame({
      status: "live",
      starts_at: null,
      live_started_at: iso(-4 * HOUR),
      duration_minutes: 60,
    });
    expect(isGameEnded(g, NOW)).toBe(true);
    expect(isGameLive(g, NOW)).toBe(false);
    expect(isGameInLiveWindow(g, NOW)).toBe(false);
    expect(filterGamesVisibleOnMap([g], NOW)).toEqual([]);
  });

  it("live strip copy reports the remaining window for an unscheduled live game", () => {
    const g = makeGame({
      status: "live",
      starts_at: null,
      live_started_at: iso(-20 * MIN),
      duration_minutes: 60,
      spots_remaining: 2,
    });
    expect(formatLiveStripCardSummary(g, NOW)).toBe("Live · 40:00 left · 2 spots");
  });
});
