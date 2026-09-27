import { describe, it, expect } from "vitest";
import { feedItemToGameRow, type FeedGameMeta, type UnifiedFeedItem } from "./api";
import { isGameEnded, isGameLive } from "./mapGameTimer";
import { gameViewerRole } from "../app/lib/gameViewerRole";

const NOW = new Date("2026-09-27T12:00:00Z").getTime();
const MIN = 60_000;
const HOUR = 60 * MIN;
const iso = (ms: number) => new Date(NOW + ms).toISOString();

function meta(overrides: Partial<FeedGameMeta> = {}): FeedGameMeta {
  return {
    starts_at: iso(2 * HOUR),
    ends_at: iso(3.5 * HOUR),
    ended_at: null,
    live_started_at: null,
    duration_minutes: 90,
    status: "open",
    location_label: "Vandergriff Park",
    spots_needed: 10,
    participant_count: 4,
    substitute_count: 0,
    spots_remaining: 6,
    distance_km: 2.4,
    requirements: {},
    joined_by_me: false,
    ...overrides,
  };
}

function item(
  overrides: Partial<Extract<UnifiedFeedItem, { kind: "game" }>> = {},
): Extract<UnifiedFeedItem, { kind: "game" }> {
  return {
    kind: "game",
    id: "g1",
    created_at: iso(-HOUR),
    lat: 32.73,
    lng: -97.1,
    title: "Saturday run",
    body: "Bring a light shirt",
    sport: "basketball",
    visibility: "public",
    comment_count: 2,
    created_by: "host-1",
    like_count: 3,
    liked_by_me: false,
    game: meta(),
    ...overrides,
  };
}

describe("feedItemToGameRow", () => {
  it("carries the whole schedule, so the card and the map agree", () => {
    const row = feedItemToGameRow(item());
    expect(row.starts_at).toBe(iso(2 * HOUR));
    expect(row.ends_at).toBe(iso(3.5 * HOUR));
    expect(row.duration_minutes).toBe(90);
    expect(row.status).toBe("open");
    expect(isGameEnded(row, NOW)).toBe(false);
    expect(isGameLive(row, NOW)).toBe(false);
  });

  it("reads a game that has already ended as ended", () => {
    const row = feedItemToGameRow(
      item({ game: meta({ starts_at: iso(-3 * HOUR), ends_at: iso(-90 * MIN), status: "completed" }) }),
    );
    expect(isGameEnded(row, NOW)).toBe(true);
  });

  it("reads a game the host ended early as ended, not as still running", () => {
    const row = feedItemToGameRow(
      item({
        game: meta({ starts_at: iso(-20 * MIN), ends_at: iso(70 * MIN), ended_at: iso(-MIN), status: "completed" }),
      }),
    );
    expect(isGameEnded(row, NOW)).toBe(true);
  });

  it("carries spots so the bar is not invented", () => {
    const row = feedItemToGameRow(item());
    expect(row.spots_needed).toBe(10);
    expect(row.participant_count).toBe(4);
    expect(row.spots_remaining).toBe(6);
  });

  it("gives the host their controls", () => {
    const row = feedItemToGameRow(item());
    const role = gameViewerRole(row, {
      currentUserId: "host-1",
      joinedGameIds: new Set(["g1"]),
      nowMs: NOW,
    });
    expect(role.isHost).toBe(true);
    expect(role.canStart).toBe(true);
    expect(role.canJoin).toBe(false);
  });

  it("lets a stranger join a game with spots left", () => {
    const row = feedItemToGameRow(item());
    const role = gameViewerRole(row, {
      currentUserId: "someone-else",
      joinedGameIds: new Set(),
      nowMs: NOW,
    });
    expect(role.canJoin).toBe(true);
    expect(role.isJoined).toBe(false);
  });

  it("survives a row from before unified_feed_games_v2", () => {
    // `game` is null against an un-migrated database. The card must still render
    // something rather than throw — the counts collapse to zero and the schedule
    // is simply unknown.
    const row = feedItemToGameRow(item({ game: null }));
    expect(row.id).toBe("g1");
    expect(row.starts_at).toBeNull();
    expect(row.spots_needed).toBe(0);
    expect(row.distance_km).toBe(0);
    expect(isGameEnded(row, NOW)).toBe(false);
  });

  it("falls back to a title when the game has none", () => {
    expect(feedItemToGameRow(item({ title: "   " })).title).toBe("Pickup game");
    expect(feedItemToGameRow(item({ title: null })).title).toBe("Pickup game");
  });
});
