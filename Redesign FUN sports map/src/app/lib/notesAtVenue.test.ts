import { describe, it, expect } from "vitest";
import type { MapNoteRow } from "../../lib/supabase";
import { notesNearPoint, partitionNotesByVenue, type VenueAnchor } from "./notesAtVenue";
import { NOTE_VENUE_ABSORB_RADIUS_METERS } from "../map/mapConfig";

const VENUE_LAT = 32.712213;
const VENUE_LNG = -97.115704;

/** Metres of latitude, in degrees — good to well under a metre at these distances. */
const METERS_PER_DEG_LAT = 111_320;
function northOf(lat: number, meters: number): number {
  return lat + meters / METERS_PER_DEG_LAT;
}

function note(id: string, lat: number, lng: number): MapNoteRow {
  return { id, lat, lng } as MapNoteRow;
}

function venue(id: string, lat: number, lng: number): VenueAnchor {
  return { id, lat, lng };
}

describe("notesNearPoint", () => {
  it("keeps notes inside the radius and drops those outside", () => {
    const inside = note("in", northOf(VENUE_LAT, 10), VENUE_LNG);
    const outside = note("out", northOf(VENUE_LAT, 200), VENUE_LNG);
    const found = notesNearPoint([inside, outside], VENUE_LAT, VENUE_LNG, 50);
    expect(found.map((n) => n.id)).toEqual(["in"]);
  });

  it("returns nothing for an empty note list", () => {
    expect(notesNearPoint([], VENUE_LAT, VENUE_LNG, 50)).toEqual([]);
  });
});

describe("partitionNotesByVenue", () => {
  const v = venue("venue-1", VENUE_LAT, VENUE_LNG);

  it("absorbs a note dropped on the venue itself", () => {
    // The original bug: this note used to render its own pin on top of the venue.
    const onVenue = note("n1", VENUE_LAT, VENUE_LNG);
    const { anchored, floating } = partitionNotesByVenue(
      [onVenue],
      [v],
      NOTE_VENUE_ABSORB_RADIUS_METERS
    );
    expect(floating).toEqual([]);
    expect(anchored.get("venue-1")?.map((n) => n.id)).toEqual(["n1"]);
  });

  it("leaves a note just beyond the radius floating", () => {
    const justOutside = note("n1", northOf(VENUE_LAT, NOTE_VENUE_ABSORB_RADIUS_METERS + 5), VENUE_LNG);
    const { anchored, floating } = partitionNotesByVenue(
      [justOutside],
      [v],
      NOTE_VENUE_ABSORB_RADIUS_METERS
    );
    expect(anchored.size).toBe(0);
    expect(floating.map((n) => n.id)).toEqual(["n1"]);
  });

  it("attaches a note to exactly one venue when two are in range", () => {
    // Both within the radius; the note is nearer the second.
    const near = venue("near", northOf(VENUE_LAT, 5), VENUE_LNG);
    const far = venue("far", northOf(VENUE_LAT, 30), VENUE_LNG);
    const n = note("n1", VENUE_LAT, VENUE_LNG);

    const { anchored, floating } = partitionNotesByVenue([n], [far, near], 100);
    expect(floating).toEqual([]);
    expect(anchored.size).toBe(1);
    expect(anchored.get("near")?.map((x) => x.id)).toEqual(["n1"]);
  });

  it("groups several notes on one venue and keeps distant ones free", () => {
    const a = note("a", VENUE_LAT, VENUE_LNG);
    const b = note("b", northOf(VENUE_LAT, 8), VENUE_LNG);
    const away = note("c", northOf(VENUE_LAT, 500), VENUE_LNG);

    const { anchored, floating } = partitionNotesByVenue(
      [a, b, away],
      [v],
      NOTE_VENUE_ABSORB_RADIUS_METERS
    );
    expect(anchored.get("venue-1")?.map((n) => n.id).sort()).toEqual(["a", "b"]);
    expect(floating.map((n) => n.id)).toEqual(["c"]);
  });

  it("floats everything when there are no venues loaded", () => {
    const { anchored, floating } = partitionNotesByVenue(
      [note("a", VENUE_LAT, VENUE_LNG)],
      [],
      NOTE_VENUE_ABSORB_RADIUS_METERS
    );
    expect(anchored.size).toBe(0);
    expect(floating.map((n) => n.id)).toEqual(["a"]);
  });
});
