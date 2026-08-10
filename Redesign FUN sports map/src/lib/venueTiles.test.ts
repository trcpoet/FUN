import { describe, it, expect } from "vitest";
import {
  bboxFromCenterRadius,
  isCoverageStale,
  sortTilesByProximity,
  tileCountForBbox,
  tileRangeForBbox,
  tileToBbox,
  tileXForLng,
  tileYForLat,
  tilesForBbox,
  VENUE_COVERAGE_TTL_DAYS,
  VENUE_TILE_DEG,
} from "../../server/lib/venueTiles";

/**
 * The coverage grid is shared by three callers that must agree exactly: the map (asking
 * "has this been imported?"), the warm route and the backfill script (both answering
 * "yes, this tile has"). If they disagree by a single tile the client asks about ground
 * nobody writes, and the cache looks permanently cold — which is the failure mode this
 * whole mechanism exists to end. Hence tests on the arithmetic itself.
 */

describe("tile indexing", () => {
  it("floors toward negative infinity, so western/southern tiles are not off by one", () => {
    // The trap: truncation would put -97.13 and -97.03 in the same tile as -97.0.
    expect(tileXForLng(-97.13)).toBe(-972);
    expect(tileXForLng(-97.03)).toBe(-971);
    expect(tileYForLat(-0.05)).toBe(-1);
    expect(tileYForLat(0.05)).toBe(0);
  });

  it("puts a coordinate on a seam in the tile that starts there", () => {
    expect(tileXForLng(-97.1)).toBe(-971);
    expect(tileToBbox({ x: -971, y: 0 }).minLng).toBeCloseTo(-97.1, 9);
  });

  it("round-trips a tile through its bbox", () => {
    for (const tile of [{ x: -972, y: 327 }, { x: 0, y: 0 }, { x: 1397, y: 515 }]) {
      const b = tileToBbox(tile);
      expect(tileXForLng(b.minLng)).toBe(tile.x);
      expect(tileYForLat(b.minLat)).toBe(tile.y);
      expect(b.maxLng - b.minLng).toBeCloseTo(VENUE_TILE_DEG, 9);
    }
  });
});

describe("tiles for a bbox", () => {
  const BBOX = { minLat: 32.72, maxLat: 32.74, minLng: -97.13, maxLng: -97.1 };

  it("counts every tile the box touches, including the one its edge lands on", () => {
    expect(tileRangeForBbox(BBOX)).toEqual({ minX: -972, maxX: -971, minY: 327, maxY: 327 });
    expect(tileCountForBbox(BBOX)).toBe(2);
    expect(tilesForBbox(BBOX)).toHaveLength(2);
  });

  it("agrees with the enumerated tiles, so 'fully covered' can be a count comparison", () => {
    // fetchSportsVenuesFromDb decides coverage by comparing a row count against
    // tileCountForBbox — that shortcut is only valid while these two cannot diverge.
    for (const box of [
      BBOX,
      { minLat: 51.3, maxLat: 51.7, minLng: -0.5, maxLng: 0.3 },
      { minLat: -34.7, maxLat: -34.5, minLng: -58.5, maxLng: -58.3 },
    ]) {
      expect(tilesForBbox(box)).toHaveLength(tileCountForBbox(box));
    }
  });

  it("keeps a warm request bounded — a 6 km radius is a handful of tiles, not hundreds", () => {
    const box = bboxFromCenterRadius(34.0522, -118.2437, 6);
    expect(tileCountForBbox(box)).toBeLessThanOrEqual(9);
  });
});

describe("sortTilesByProximity", () => {
  it("returns the tile containing the point first, so the viewport fills in before the ring", () => {
    const lat = 32.73;
    const lng = -97.115;
    const tiles = tilesForBbox(bboxFromCenterRadius(lat, lng, 6));
    const sorted = sortTilesByProximity(tiles, lat, lng);
    expect(sorted[0]).toEqual({ x: tileXForLng(lng), y: tileYForLat(lat) });
  });

  it("does not mutate the caller's array", () => {
    const tiles = [{ x: 5, y: 5 }, { x: 0, y: 0 }];
    const before = [...tiles];
    sortTilesByProximity(tiles, 0, 0);
    expect(tiles).toEqual(before);
  });
});

describe("isCoverageStale", () => {
  it("trusts a fresh import and expires an old one", () => {
    const day = 24 * 60 * 60 * 1000;
    expect(isCoverageStale(new Date().toISOString())).toBe(false);
    expect(
      isCoverageStale(new Date(Date.now() - (VENUE_COVERAGE_TTL_DAYS - 1) * day).toISOString())
    ).toBe(false);
    expect(
      isCoverageStale(new Date(Date.now() - (VENUE_COVERAGE_TTL_DAYS + 1) * day).toISOString())
    ).toBe(true);
  });

  it("treats an unparseable timestamp as stale rather than trusting it forever", () => {
    expect(isCoverageStale("not a date")).toBe(true);
  });
});
