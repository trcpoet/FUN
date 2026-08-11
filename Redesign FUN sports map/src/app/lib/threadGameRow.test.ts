import { describe, it, expect } from "vitest";
import type { GameInboxRow } from "../../lib/supabase";
import { isGameEnded, isGameLive, getCountdownRemainingMs } from "../../lib/mapGameTimer";
import { gameViewerRole } from "./gameViewerRole";
import { threadGameRow, type ThreadGameSource } from "./threadGameRow";

const NOW = new Date("2026-08-11T12:00:00Z").getTime();
const MIN = 60_000;
const HOUR = 60 * MIN;

function iso(msFromNow: number): string {
  return new Date(NOW + msFromNow).toISOString();
}

function focus(overrides: Partial<ThreadGameSource> = {}): ThreadGameSource {
  return { gameId: "g1", title: "Pickup game", sport: "soccer", ...overrides };
}

function inbox(overrides: Partial<GameInboxRow> = {}): GameInboxRow {
  return {
    id: "g1",
    title: "Pickup game",
    sport: "soccer",
    starts_at: null,
    location_label: null,
    last_message_body: null,
    last_message_at: null,
    participant_count: 0,
    spots_remaining: 0,
    ...overrides,
  };
}

describe("field precedence", () => {
  it("prefers the focus over the inbox row", () => {
    const row = threadGameRow(
      focus({ startsAt: iso(HOUR), createdBy: "host-1" }),
      inbox({ starts_at: iso(5 * HOUR), created_by: "someone-else" }),
    );
    expect(row.starts_at).toBe(iso(HOUR));
    expect(row.created_by).toBe("host-1");
  });

  it("falls back to the inbox row when the focus is silent", () => {
    const row = threadGameRow(
      focus(),
      inbox({ starts_at: iso(HOUR), created_by: "host-1", status: "live", visibility: "friends_only" }),
    );
    expect(row.starts_at).toBe(iso(HOUR));
    expect(row.created_by).toBe("host-1");
    expect(row.status).toBe("live");
    expect(row.visibility).toBe("friends_only");
  });

  it("survives with no inbox row at all", () => {
    const row = threadGameRow(focus({ startsAt: iso(HOUR) }));
    expect(row.id).toBe("g1");
    expect(row.starts_at).toBe(iso(HOUR));
    expect(row.created_by).toBeNull();
    expect(row.status).toBeUndefined();
  });
});

describe("spots", () => {
  it("rebuilds spots_needed from the two halves the inbox does return", () => {
    const row = threadGameRow(focus(), inbox({ participant_count: 3, spots_remaining: 5 }));
    expect(row.participant_count).toBe(3);
    expect(row.spots_remaining).toBe(5);
    expect(row.spots_needed).toBe(8);
  });

  it("reads a full game as full", () => {
    const row = threadGameRow(focus({ participantCount: 4, spotsRemaining: 0 }));
    expect(row.spots_needed).toBe(4);
    expect(row.spots_remaining).toBe(0);
  });
});

describe("liveness reads correctly off the rebuilt row", () => {
  it("treats a scheduled game past its window as ended", () => {
    const row = threadGameRow(focus({ startsAt: iso(-5 * HOUR), durationMinutes: 60 }));
    expect(isGameEnded(row, NOW)).toBe(true);
    expect(isGameLive(row, NOW)).toBe(false);
  });

  it("treats a game inside its window as live", () => {
    const row = threadGameRow(focus({ startsAt: iso(-10 * MIN), durationMinutes: 90 }));
    expect(isGameLive(row, NOW)).toBe(true);
    expect(isGameEnded(row, NOW)).toBe(false);
  });

  it("counts down an untimed game from its created_at TTL anchor", () => {
    const row = threadGameRow(focus({ createdAt: iso(-HOUR) }));
    expect(row.starts_at).toBeNull();
    const left = getCountdownRemainingMs(row, NOW);
    expect(left).not.toBeNull();
    // 3-day TTL minus the hour it has already been up.
    expect(Math.round(left! / HOUR)).toBe(71);
  });

  it("does not date an anchorless game to 1970", () => {
    // An empty created_at parses to NaN, which reads as "no countdown" — not as an
    // untimed game posted at the epoch and therefore expired.
    const row = threadGameRow(focus());
    expect(row.created_at).toBe("");
    expect(getCountdownRemainingMs(row, NOW)).toBeNull();
    expect(isGameEnded(row, NOW)).toBe(false);
  });
});

describe("the row a host acts on", () => {
  it("gives a host their controls on a game days away", () => {
    const row = threadGameRow(
      focus({ startsAt: iso(72 * HOUR), createdBy: "host-1" }),
      inbox({ participant_count: 1, spots_remaining: 3 }),
    );
    const role = gameViewerRole(row, {
      currentUserId: "host-1",
      joinedGameIds: new Set(["g1"]),
      nowMs: NOW,
    });
    expect(role.isHost).toBe(true);
    expect(role.canStart).toBe(true);
    expect(role.canDelete).toBe(true);
    expect(role.canArchive).toBe(false);
  });

  it("gives a host archive — and never leave — once the game is over", () => {
    const row = threadGameRow(
      focus({ startsAt: iso(-5 * HOUR), durationMinutes: 60, createdBy: "host-1" }),
    );
    const role = gameViewerRole(row, {
      currentUserId: "host-1",
      joinedGameIds: new Set(["g1"]),
      nowMs: NOW,
    });
    expect(role.canArchive).toBe(true);
    expect(role.canLeave).toBe(false);
    expect(role.canStart).toBe(false);
  });
});
