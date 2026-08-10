import { describe, it, expect } from "vitest";
import type { GameRow } from "../../lib/supabase";
import { gameViewerRole } from "./gameViewerRole";

const NOW = new Date("2026-08-06T12:00:00Z").getTime();
const MIN = 60_000;
const HOUR = 60 * MIN;

function iso(msFromNow: number): string {
  return new Date(NOW + msFromNow).toISOString();
}

function makeGame(overrides: Partial<GameRow> = {}): GameRow {
  return {
    id: "g1",
    title: "Test Game",
    sport: "soccer",
    spots_needed: 10,
    starts_at: null,
    created_by: "host-1",
    created_at: iso(-10 * MIN),
    distance_km: 1,
    lat: 40,
    lng: -73,
    ...overrides,
  };
}

const HOST = "host-1";
const GUEST = "guest-1";

function role(game: GameRow, opts: Partial<Parameters<typeof gameViewerRole>[1]> = {}) {
  return gameViewerRole(game, {
    currentUserId: null,
    joinedGameIds: new Set<string>(),
    nowMs: NOW,
    ...opts,
  });
}

describe("host identification", () => {
  it("treats created_by === currentUserId as host", () => {
    expect(role(makeGame(), { currentUserId: HOST }).isHost).toBe(true);
    expect(role(makeGame(), { currentUserId: GUEST }).isHost).toBe(false);
  });

  it("prefers an explicit hostGameIds set when one is supplied", () => {
    // The map passes an authoritative set built from game_participants; it wins over
    // created_by so a transferred/edge-case host row is still respected.
    const g = makeGame({ created_by: "someone-else" });
    expect(role(g, { currentUserId: GUEST, hostGameIds: new Set(["g1"]) }).isHost).toBe(true);
    expect(role(g, { currentUserId: "someone-else", hostGameIds: new Set() }).isHost).toBe(false);
  });

  it("is never host for a signed-out viewer", () => {
    expect(role(makeGame({ created_by: null })).isHost).toBe(false);
    expect(role(makeGame()).isHost).toBe(false);
  });
});

describe("chat gating", () => {
  it("requires joining before chat", () => {
    expect(role(makeGame(), { currentUserId: GUEST }).canChat).toBe(false);
    expect(
      role(makeGame(), { currentUserId: GUEST, joinedGameIds: new Set(["g1"]) }).canChat,
    ).toBe(true);
  });

  it("lets a host chat — hosts hold a participant row, so they count as joined", () => {
    const r = role(makeGame(), { currentUserId: HOST, joinedGameIds: new Set(["g1"]) });
    expect(r.isHost).toBe(true);
    expect(r.canChat).toBe(true);
  });
});

describe("join / leave", () => {
  it("offers join to a viewer who has not joined", () => {
    const r = role(makeGame({ starts_at: iso(HOUR) }), { currentUserId: GUEST });
    expect(r.canJoin).toBe(true);
    expect(r.canLeave).toBe(false);
  });

  it("offers leave once joined, but never to the host", () => {
    const joined = new Set(["g1"]);
    expect(role(makeGame(), { currentUserId: GUEST, joinedGameIds: joined }).canLeave).toBe(true);
    expect(role(makeGame(), { currentUserId: HOST, joinedGameIds: joined }).canLeave).toBe(false);
  });

  it("does not offer join on a game that already ended", () => {
    const ended = makeGame({ starts_at: iso(-5 * HOUR), duration_minutes: 60 });
    expect(role(ended, { currentUserId: GUEST }).canJoin).toBe(false);
  });

  it("reports substitutes so the caller can say 'Leave Waitlist'", () => {
    const r = role(makeGame(), {
      currentUserId: GUEST,
      joinedGameIds: new Set(["g1"]),
      substituteGameIds: new Set(["g1"]),
    });
    expect(r.isSubstitute).toBe(true);
    expect(r.canLeave).toBe(true);
  });
});

describe("host controls", () => {
  const joined = new Set(["g1"]);

  it("offers start before the game is live", () => {
    const r = role(makeGame({ starts_at: iso(HOUR) }), { currentUserId: HOST, joinedGameIds: joined });
    expect(r.canStart).toBe(true);
    expect(r.canEnd).toBe(false);
  });

  it("offers end once the game is live", () => {
    const r = role(makeGame({ status: "live", live_started_at: iso(-10 * MIN) }), {
      currentUserId: HOST,
      joinedGameIds: joined,
    });
    expect(r.canStart).toBe(false);
    expect(r.canEnd).toBe(true);
  });

  it("treats a scheduled game past its start time as live", () => {
    // isGameLive covers this even without status==='live'; end must follow.
    const r = role(makeGame({ starts_at: iso(-10 * MIN), duration_minutes: 90 }), {
      currentUserId: HOST,
      joinedGameIds: joined,
    });
    expect(r.canStart).toBe(false);
    expect(r.canEnd).toBe(true);
  });

  it("never offers start or end on an ended game", () => {
    const r = role(makeGame({ starts_at: iso(-5 * HOUR), duration_minutes: 60 }), {
      currentUserId: HOST,
      joinedGameIds: joined,
    });
    expect(r.canStart).toBe(false);
    expect(r.canEnd).toBe(false);
  });

  it("keeps start and end mutually exclusive across every state", () => {
    const states: Partial<GameRow>[] = [
      {},
      { starts_at: iso(HOUR) },
      { starts_at: iso(-10 * MIN) },
      { status: "live" },
      { status: "completed" },
      { status: "cancelled" },
      { starts_at: iso(-5 * HOUR), duration_minutes: 60 },
    ];
    for (const s of states) {
      const r = role(makeGame(s), { currentUserId: HOST, joinedGameIds: joined });
      expect(r.canStart && r.canEnd).toBe(false);
    }
  });

  it("offers delete to the host and to nobody else", () => {
    expect(role(makeGame(), { currentUserId: HOST, joinedGameIds: joined }).canDelete).toBe(true);
    expect(role(makeGame(), { currentUserId: GUEST, joinedGameIds: joined }).canDelete).toBe(false);
  });

  it("hides every host control from a guest", () => {
    const r = role(makeGame({ status: "live" }), { currentUserId: GUEST, joinedGameIds: joined });
    expect(r.canStart).toBe(false);
    expect(r.canEnd).toBe(false);
    expect(r.canDelete).toBe(false);
  });
});
