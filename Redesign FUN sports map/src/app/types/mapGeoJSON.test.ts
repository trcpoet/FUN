import { describe, it, expect } from "vitest";
import type { GameRow } from "../../lib/supabase";
import { gamesToGeoJSON, getGameStatus } from "./mapGeoJSON";

const VENUE_LAT = 32.712213;
const VENUE_LNG = -97.115704;

function game(id: string, over: Partial<GameRow> = {}): GameRow {
  return {
    id,
    lat: VENUE_LAT,
    lng: VENUE_LNG,
    created_at: new Date().toISOString(),
    starts_at: new Date(Date.now() + 3_600_000).toISOString(),
    spots_needed: 4,
    sport: "Tennis",
    // A game created from a venue card carries the venue's label — that is what routes it to
    // the GL symbol layer rather than an HTML pin.
    location_label: "Riverside Tennis Courts",
    ...over,
  } as GameRow;
}

/**
 * These lock in the seam that produced the reported bug: a game created on a tennis court drew
 * its own 🎾 exactly over the venue's 🎾 and, because the game layer paints last, made the venue
 * invisible and unclickable. The fix is that an absorbed game keeps its feature (so the low-zoom
 * cluster bubbles still count it) but is tagged `at_venue`, which the icon and roster layers
 * filter out.
 */
describe("gamesToGeoJSON absorption", () => {
  it("tags an absorbed game so the icon layer skips it", () => {
    const out = gamesToGeoJSON([game("g1")], null, new Set(["g1"]));
    expect(out.features).toHaveLength(1);
    expect(out.features[0]!.properties.marker_kind).toBe("at_venue");
  });

  it("keeps the feature in the source so cluster counts stay honest", () => {
    const absorbed = gamesToGeoJSON([game("g1")], null, new Set(["g1"]));
    const plain = gamesToGeoJSON([game("g1")], null);
    expect(absorbed.features).toHaveLength(plain.features.length);
  });

  it("leaves an un-absorbed game drawable", () => {
    const out = gamesToGeoJSON([game("g1")], null, new Set(["someone-else"]));
    expect(out.features[0]!.properties.marker_kind).toBeUndefined();
  });

  it("behaves exactly as before when no absorption set is passed", () => {
    const out = gamesToGeoJSON([game("g1")], null);
    expect(out.features[0]!.properties.marker_kind).toBeUndefined();
  });

  it("tags a colocated group only when every game in it is absorbed", () => {
    const pair = [game("g1"), game("g2")]; // identical coords => one colocated group
    const all = gamesToGeoJSON(pair, null, new Set(["g1", "g2"]));
    expect(all.features).toHaveLength(1);
    expect(all.features[0]!.properties.marker_kind).toBe("at_venue");

    const partial = gamesToGeoJSON(pair, null, new Set(["g1"]));
    expect(partial.features[0]!.properties.marker_kind).toBe("colocated");
  });
});

/**
 * The pin's ring colour used to be derived from `starts_at` alone, which is a third, subtly
 * different answer to "is this live?". A finished game still wore a red ring, and a
 * host-started game whose scheduled start was in the future did not.
 */
describe("getGameStatus", () => {
  const NOW = Date.parse("2026-08-06T12:00:00.000Z");
  const MIN = 60_000;
  const iso = (offset: number) => new Date(NOW + offset).toISOString();

  it("reads live once the start time has passed", () => {
    const g = game("g", { starts_at: iso(-10 * MIN), ends_at: iso(80 * MIN) });
    expect(getGameStatus(g, NOW)).toBe("live");
  });

  it("reads live for a host-started game whose scheduled start is still ahead", () => {
    const g = game("g", { status: "live", starts_at: iso(60 * MIN), ends_at: iso(90 * MIN) });
    expect(getGameStatus(g, NOW)).toBe("live");
  });

  it("does not read live for a game that has already finished", () => {
    const g = game("g", { starts_at: iso(-5 * 60 * MIN), ends_at: iso(-60 * MIN) });
    expect(getGameStatus(g, NOW)).not.toBe("live");
  });

  it("reads soon within the hour, scheduled beyond it", () => {
    expect(getGameStatus(game("a", { starts_at: iso(30 * MIN) }), NOW)).toBe("soon");
    expect(getGameStatus(game("b", { starts_at: iso(3 * 60 * MIN) }), NOW)).toBe("scheduled");
  });

  it("reads scheduled for an untimed game", () => {
    expect(getGameStatus(game("g", { starts_at: null }), NOW)).toBe("scheduled");
  });
});
