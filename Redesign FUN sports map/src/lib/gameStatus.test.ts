import { describe, it, expect } from "vitest";
import { gameStatus } from "./mapGameTimer";
import type { GameRow } from "./supabase";

const NOW = new Date("2026-09-28T12:00:00Z").getTime();
const MIN = 60_000;
const HOUR = 60 * MIN;
const iso = (ms: number) => new Date(NOW + ms).toISOString();

function game(o: Partial<GameRow> = {}): GameRow {
  return {
    id: "g1",
    title: "Pickup game",
    sport: "basketball",
    spots_needed: 10,
    participant_count: 2,
    spots_remaining: 8,
    substitute_count: 0,
    starts_at: iso(3 * HOUR),
    ends_at: iso(4.5 * HOUR),
    created_by: "host-1",
    created_at: iso(-HOUR),
    status: "open",
    duration_minutes: 90,
    distance_km: 1,
    lat: 32.7,
    lng: -97.1,
    ...o,
  };
}

describe("gameStatus", () => {
  it("calls a roomy game Recruiting", () => {
    expect(gameStatus(game(), NOW)).toEqual({ label: "Recruiting", tone: "open" });
  });

  it("calls a nearly-full game Filling up", () => {
    // 10 spots, 25% threshold = 3 (ceil), so 3 left or fewer is filling up.
    expect(gameStatus(game({ spots_remaining: 3 }), NOW).label).toBe("Filling up");
    expect(gameStatus(game({ spots_remaining: 4 }), NOW).label).toBe("Recruiting");
  });

  it("uses a floor of one spot, so a small game can still fill up", () => {
    // 4 spots: ceil(4 * 0.25) = 1. One left is filling up; two is not.
    expect(gameStatus(game({ spots_needed: 4, spots_remaining: 1 }), NOW).label).toBe("Filling up");
    expect(gameStatus(game({ spots_needed: 4, spots_remaining: 2 }), NOW).label).toBe("Recruiting");
    // 2 spots: ceil(2 * 0.25) = 1, not 0 — without the floor this would never fill up.
    expect(gameStatus(game({ spots_needed: 2, spots_remaining: 1 }), NOW).label).toBe("Filling up");
  });

  it("distinguishes Full from Waitlist", () => {
    expect(gameStatus(game({ spots_remaining: 0 }), NOW)).toEqual({ label: "Full", tone: "full" });
    expect(gameStatus(game({ spots_remaining: 0, substitute_count: 3 }), NOW)).toEqual({
      label: "Waitlist",
      tone: "waitlist",
    });
  });

  it("puts Live ahead of capacity — a full game under way is Live, not Full", () => {
    const live = game({ status: "live", starts_at: iso(-20 * MIN), spots_remaining: 0 });
    expect(gameStatus(live, NOW)).toEqual({ label: "Live", tone: "live" });
  });

  it("puts Ended ahead of everything — a full game that finished is Ended", () => {
    const done = game({ status: "completed", spots_remaining: 0, ended_at: iso(-10 * MIN) });
    expect(gameStatus(done, NOW)).toEqual({ label: "Ended", tone: "ended" });
  });

  it("reads a game the host ended early as Ended, not Live", () => {
    const early = game({
      status: "completed",
      starts_at: iso(-20 * MIN),
      ends_at: iso(70 * MIN),
      ended_at: iso(-MIN),
    });
    expect(gameStatus(early, NOW).label).toBe("Ended");
  });

  it("does not claim Full when capacity is unknown", () => {
    // spots_remaining is optional on GameRow; an absent column must not turn
    // people away from a game that is actually open.
    expect(gameStatus(game({ spots_remaining: undefined }), NOW).label).toBe("Recruiting");
    expect(gameStatus(game({ spots_needed: 0, spots_remaining: 0 }), NOW).label).toBe("Recruiting");
  });

  it("is stable exactly at the boundary between states", () => {
    expect(gameStatus(game({ spots_needed: 8, spots_remaining: 2 }), NOW).label).toBe("Filling up");
    expect(gameStatus(game({ spots_needed: 8, spots_remaining: 3 }), NOW).label).toBe("Recruiting");
  });
});
