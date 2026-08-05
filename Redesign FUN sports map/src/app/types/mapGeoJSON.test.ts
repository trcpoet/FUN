import { describe, it, expect } from "vitest";
import type { GameRow } from "../../lib/supabase";
import { gamesToGeoJSON } from "./mapGeoJSON";

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
