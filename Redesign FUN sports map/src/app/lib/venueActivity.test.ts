import { describe, it, expect } from "vitest";
import type { GameRow } from "../../lib/supabase";
import {
  activeGamesNearPoint,
  leadGameForPin,
  partitionGamesByVenue,
  sortGamesForVenueList,
  summarizeVenueActivity,
  type VenueAnchor,
} from "./venueActivity";
import { GAME_VENUE_ABSORB_RADIUS_METERS } from "../map/mapConfig";

const VENUE_LAT = 32.712213;
const VENUE_LNG = -97.115704;
const NOW = Date.parse("2026-08-05T18:00:00.000Z");

/** Metres of latitude, in degrees — good to well under a metre at these distances. */
const METERS_PER_DEG_LAT = 111_320;
function northOf(lat: number, meters: number): number {
  return lat + meters / METERS_PER_DEG_LAT;
}

function iso(offsetMs: number): string {
  return new Date(NOW + offsetMs).toISOString();
}

function game(id: string, over: Partial<GameRow> = {}): GameRow {
  return {
    id,
    lat: VENUE_LAT,
    lng: VENUE_LNG,
    created_at: iso(-60 * 60_000),
    starts_at: iso(60 * 60_000),
    duration_minutes: 90,
    spots_needed: 4,
    ...over,
  } as GameRow;
}

function venue(id: string, lat: number, lng: number): VenueAnchor {
  return { id, lat, lng };
}

describe("activeGamesNearPoint", () => {
  it("keeps a live game — the bug that hid games the moment a host pressed Start", () => {
    // The old predicate was `status === "open" || !status`, so 'live' was dropped.
    const live = game("live", { status: "live", live_started_at: iso(-10 * 60_000) });
    const found = activeGamesNearPoint([live], VENUE_LAT, VENUE_LNG, 42, NOW);
    expect(found.map((g) => g.id)).toEqual(["live"]);
  });

  it("keeps open and full games", () => {
    const games = [game("open", { status: "open" }), game("full", { status: "full" })];
    const found = activeGamesNearPoint(games, VENUE_LAT, VENUE_LNG, 42, NOW);
    expect(found.map((g) => g.id)).toEqual(["open", "full"]);
  });

  it("drops completed and cancelled games", () => {
    const games = [game("done", { status: "completed" }), game("nope", { status: "cancelled" })];
    expect(activeGamesNearPoint(games, VENUE_LAT, VENUE_LNG, 42, NOW)).toEqual([]);
  });

  it("drops a game whose window has already closed", () => {
    const past = game("past", { status: "live", ends_at: iso(-60_000) });
    expect(activeGamesNearPoint([past], VENUE_LAT, VENUE_LNG, 42, NOW)).toEqual([]);
  });

  it("drops a game outside the radius", () => {
    const far = game("far", { lat: northOf(VENUE_LAT, 200) });
    expect(activeGamesNearPoint([far], VENUE_LAT, VENUE_LNG, 42, NOW)).toEqual([]);
  });
});

describe("partitionGamesByVenue", () => {
  const v = venue("venue-1", VENUE_LAT, VENUE_LNG);

  it("absorbs a game created on the venue itself", () => {
    // The reported bug: this game's icon covered the venue and ate its click.
    const { anchored, floating } = partitionGamesByVenue(
      [game("g1")],
      [v],
      GAME_VENUE_ABSORB_RADIUS_METERS,
      NOW
    );
    expect(floating).toEqual([]);
    expect(anchored.get("venue-1")?.map((g) => g.id)).toEqual(["g1"]);
  });

  it("leaves a game just beyond the absorb radius floating, so it keeps its own pin", () => {
    const justOutside = game("g1", {
      lat: northOf(VENUE_LAT, GAME_VENUE_ABSORB_RADIUS_METERS + 5),
    });
    const { anchored, floating } = partitionGamesByVenue(
      [justOutside],
      [v],
      GAME_VENUE_ABSORB_RADIUS_METERS,
      NOW
    );
    expect(anchored.size).toBe(0);
    expect(floating.map((g) => g.id)).toEqual(["g1"]);
  });

  it("attaches a game to the nearest venue only, so a badge never double-counts", () => {
    const near = venue("near", VENUE_LAT, VENUE_LNG);
    const alsoInRange = venue("also", northOf(VENUE_LAT, 30), VENUE_LNG);
    const { anchored } = partitionGamesByVenue(
      [game("g1", { lat: northOf(VENUE_LAT, 5) })],
      [near, alsoInRange],
      GAME_VENUE_ABSORB_RADIUS_METERS,
      NOW
    );
    expect(anchored.get("near")?.map((g) => g.id)).toEqual(["g1"]);
    expect(anchored.has("also")).toBe(false);
  });

  it("never absorbs an ended game — it would inflate a badge the card won't list", () => {
    const ended = game("ended", { status: "completed" });
    const { anchored, floating } = partitionGamesByVenue(
      [ended],
      [v],
      GAME_VENUE_ABSORB_RADIUS_METERS,
      NOW
    );
    expect(anchored.size).toBe(0);
    expect(floating.map((g) => g.id)).toEqual(["ended"]);
  });
});

describe("sortGamesForVenueList", () => {
  it("puts live games first, then the soonest start", () => {
    const later = game("later", { starts_at: iso(3 * 60 * 60_000) });
    const soon = game("soon", { starts_at: iso(30 * 60_000) });
    const live = game("live", { status: "live", live_started_at: iso(-5 * 60_000) });
    const order = sortGamesForVenueList([later, soon, live], NOW).map((g) => g.id);
    expect(order).toEqual(["live", "soon", "later"]);
  });

  it("sorts untimed games after scheduled ones, newest first", () => {
    const scheduled = game("scheduled", { starts_at: iso(60 * 60_000) });
    const oldUntimed = game("old", { starts_at: null, created_at: iso(-120 * 60_000) });
    const newUntimed = game("new", { starts_at: null, created_at: iso(-10 * 60_000) });
    const order = sortGamesForVenueList([oldUntimed, newUntimed, scheduled], NOW).map((g) => g.id);
    expect(order).toEqual(["scheduled", "new", "old"]);
  });

  it("does not mutate its input", () => {
    const games = [game("b", { starts_at: iso(60 * 60_000) }), game("a", { starts_at: iso(0) })];
    const before = games.map((g) => g.id);
    sortGamesForVenueList(games, NOW);
    expect(games.map((g) => g.id)).toEqual(before);
  });
});

describe("leadGameForPin", () => {
  it("counts down to the live game when one is running", () => {
    const soon = game("soon", { starts_at: iso(30 * 60_000) });
    const live = game("live", { status: "live", live_started_at: iso(-5 * 60_000) });
    expect(leadGameForPin([soon, live], NOW)?.id).toBe("live");
  });

  it("returns null with no games", () => {
    expect(leadGameForPin([], NOW)).toBeNull();
  });
});

describe("summarizeVenueActivity", () => {
  it("pluralises each count independently", () => {
    expect(summarizeVenueActivity(1, 1)).toBe("1 game · 1 note");
    expect(summarizeVenueActivity(2, 3)).toBe("2 games · 3 notes");
  });

  it("omits a zero side rather than rendering a dangling separator", () => {
    expect(summarizeVenueActivity(2, 0)).toBe("2 games");
    expect(summarizeVenueActivity(0, 1)).toBe("1 note");
    expect(summarizeVenueActivity(0, 0)).toBe("");
  });
});
