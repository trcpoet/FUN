import { describe, it, expect } from "vitest";
import type { GameInboxRow } from "../../lib/supabase";
import { isGameEnded, isGameLive, getCountdownRemainingMs } from "../../lib/mapGameTimer";
import { gameViewerRole } from "./gameViewerRole";
import { inboxGameRow, threadGameRow, type ThreadGameSource } from "./threadGameRow";

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

describe("a game the host ended early", () => {
  // The bug this covers: the host ends a 90-minute game 20 minutes in, and every
  // surface that only knows `starts_at + duration` keeps saying "Live · 70:00 left".
  const endedEarly = {
    startsAt: iso(-20 * MIN),
    durationMinutes: 90,
    endsAt: iso(70 * MIN),
  } as const;

  it("reads as live while it is still only scheduled to end later", () => {
    const row = threadGameRow(focus(endedEarly));
    expect(isGameLive(row, NOW)).toBe(true);
    expect(isGameEnded(row, NOW)).toBe(false);
  });

  it("reads as ended the moment ended_at is carried through", () => {
    const row = threadGameRow(focus({ ...endedEarly, endedAt: iso(-1 * MIN) }));
    expect(isGameEnded(row, NOW)).toBe(true);
    expect(isGameLive(row, NOW)).toBe(false);
  });

  it("takes ended_at off the inbox row when the focus is silent", () => {
    const row = threadGameRow(
      focus({ startsAt: endedEarly.startsAt, durationMinutes: 90 }),
      inbox({ ends_at: endedEarly.endsAt, ended_at: iso(-1 * MIN) }),
    );
    expect(row.ended_at).toBe(iso(-1 * MIN));
    expect(isGameEnded(row, NOW)).toBe(true);
  });

  it("carries status from the focus, so the opener can be ahead of the inbox", () => {
    const row = threadGameRow(focus({ status: "completed" }), inbox({ status: "live" }));
    expect(row.status).toBe("completed");
    expect(isGameEnded(row, NOW)).toBe(true);
  });
});

describe("an untimed game the host started", () => {
  it("ends a duration after the press, not never", () => {
    // No starts_at to add a duration to: live_started_at is the only anchor.
    const row = threadGameRow(focus({ liveStartedAt: iso(-2 * HOUR), durationMinutes: 90 }));
    expect(row.starts_at).toBeNull();
    expect(isGameEnded(row, NOW)).toBe(true);
  });

  it("is still running inside that window", () => {
    const row = threadGameRow(focus({ liveStartedAt: iso(-30 * MIN), durationMinutes: 90 }));
    expect(isGameEnded(row, NOW)).toBe(false);
  });
});

describe("inboxGameRow", () => {
  // The inbox list and the thread header must agree about the same game, which is
  // only true while both ask the same predicate the same question.
  it("agrees with the thread row that an early-ended game is over", () => {
    const row = inbox({ starts_at: iso(-20 * MIN), duration_minutes: 90, ends_at: iso(70 * MIN), ended_at: iso(-MIN) });
    expect(isGameEnded(inboxGameRow(row), NOW)).toBe(true);
    expect(isGameEnded(threadGameRow(focus(), row), NOW)).toBe(true);
  });

  it("does not call a running game over", () => {
    const row = inbox({ starts_at: iso(-20 * MIN), duration_minutes: 90, ends_at: iso(70 * MIN) });
    expect(isGameEnded(inboxGameRow(row), NOW)).toBe(false);
    expect(isGameLive(inboxGameRow(row), NOW)).toBe(true);
  });

  it("reads a cancelled game as over whatever its window says", () => {
    const row = inbox({ starts_at: iso(HOUR), ends_at: iso(2 * HOUR), status: "cancelled" });
    expect(isGameEnded(inboxGameRow(row), NOW)).toBe(true);
  });

  it("does not date a scheduleless row to 1970", () => {
    const row = inboxGameRow(inbox());
    expect(row.created_at).toBe("");
    expect(isGameEnded(row, NOW)).toBe(false);
  });

  it("rebuilds spots_needed from the two halves", () => {
    const row = inboxGameRow(inbox({ participant_count: 2, spots_remaining: 6 }));
    expect(row.spots_needed).toBe(8);
  });
});
