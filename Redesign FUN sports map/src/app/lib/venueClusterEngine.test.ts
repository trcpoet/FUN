import { describe, it, expect } from "vitest";

import {
  circlePolygon,
  enrichVenueGeoJSON,
  clusterVenuePoints,
  DEFAULT_VENUE_CLUSTER_OPTS,
} from "./venueClusterEngine";
import type { SportsVenueFeature, SportsVenueGeoJSON } from "./sportsVenueTypes";
import { VENUE_AREA_RADIUS_METERS } from "../map/mapConfig";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

type VenueOpts = {
  id: string;
  lng: number;
  lat: number;
  sport?: string;
  leisure?: string;
  name?: string;
};

function mkVenue({ id, lng, lat, sport, leisure, name }: VenueOpts): SportsVenueFeature {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [lng, lat] },
    properties: {
      id,
      osm_type: "node",
      osm_id: 1,
      sport,
      leisure,
      name,
    },
  };
}

function fc(features: SportsVenueFeature[]): SportsVenueGeoJSON {
  return { type: "FeatureCollection", features };
}

type ClusterOpts = {
  venueSportsFilter: string[];
  maxDistanceMeters: number;
  venueAreaRadiusMeters: number;
};

function opts(over: Partial<ClusterOpts> = {}): ClusterOpts {
  return {
    venueSportsFilter: [],
    maxDistanceMeters: 200,
    venueAreaRadiusMeters: 42,
    ...over,
  };
}

// ~111.32 m separation: 0.001 degrees of latitude at the same longitude.
// (Used to probe the internal haversine distanceMeters via the merge threshold.)
const LAT_DELTA_111M = 0.001;

// ---------------------------------------------------------------------------
// circlePolygon
// ---------------------------------------------------------------------------

describe("circlePolygon", () => {
  it("returns a GeoJSON Polygon with a single outer ring", () => {
    const poly = circlePolygon(10, 45, 42);
    expect(poly.type).toBe("Polygon");
    expect(Array.isArray(poly.coordinates)).toBe(true);
    expect(poly.coordinates).toHaveLength(1); // one ring only
  });

  it("emits steps + 1 vertices (default 32 steps -> 33 points)", () => {
    const ring = circlePolygon(10, 45, 42).coordinates[0];
    expect(ring).toHaveLength(33);
  });

  it("honors a custom step count (4 steps -> 5 points)", () => {
    const ring = circlePolygon(0, 0, 100, 4).coordinates[0];
    expect(ring).toHaveLength(5);
  });

  it("produces a closed ring (first vertex ~= last vertex)", () => {
    const ring = circlePolygon(10, 45, 42).coordinates[0];
    const first = ring[0];
    const last = ring[ring.length - 1];
    expect(first[0]).toBeCloseTo(last[0], 9);
    expect(first[1]).toBeCloseTo(last[1], 9);
  });

  it("stores each vertex as a [lng, lat] pair with correct ordering", () => {
    // steps=32: index 0 is due-east (angle 0), index 8 is due-north (angle PI/2).
    const centerLng = 10;
    const centerLat = 45;
    const ring = circlePolygon(centerLng, centerLat, 42).coordinates[0];

    expect(ring.every((c) => c.length === 2)).toBe(true);

    // Due-east vertex: longitude increases, latitude is unchanged (dy = sin(0) = 0).
    const east = ring[0];
    expect(east[0]).toBeGreaterThan(centerLng);
    expect(east[1]).toBeCloseTo(centerLat, 12);

    // Due-north vertex (index steps/4): latitude increases, longitude ~ unchanged.
    const north = ring[8];
    expect(north[0]).toBeCloseTo(centerLng, 6);
    expect(north[1]).toBeGreaterThan(centerLat);
  });

  it("places the east vertex the expected meters away in degrees", () => {
    // east lng offset = radiusMeters / earthRadius * 180/PI
    // = 42 / 6378137 * (180/PI) ~= 0.0003772863 degrees
    const ring = circlePolygon(10, 45, 42).coordinates[0];
    expect(ring[0][0]).toBeCloseTo(10.0003772863, 6);
  });
});

// ---------------------------------------------------------------------------
// enrichVenueGeoJSON
// ---------------------------------------------------------------------------

describe("enrichVenueGeoJSON", () => {
  it("keeps all Point features when the sport filter is empty", () => {
    const input = fc([
      mkVenue({ id: "a", lng: 0, lat: 0, sport: "basketball" }),
      mkVenue({ id: "b", lng: 1, lat: 1, sport: "tennis" }),
    ]);
    const out = enrichVenueGeoJSON(input, []);
    expect(out.type).toBe("FeatureCollection");
    expect(out.features).toHaveLength(2);
  });

  it("drops non-Point and null-geometry features", () => {
    const line = {
      type: "Feature",
      geometry: { type: "LineString", coordinates: [[0, 0], [1, 1]] },
      properties: { id: "line", osm_type: "way", osm_id: 2, sport: "basketball" },
    } as unknown as SportsVenueFeature;
    const nullGeom = {
      type: "Feature",
      geometry: null,
      properties: { id: "ng", osm_type: "node", osm_id: 3, sport: "basketball" },
    } as unknown as SportsVenueFeature;

    const out = enrichVenueGeoJSON(
      fc([mkVenue({ id: "pt", lng: 0, lat: 0, sport: "basketball" }), line, nullGeom]),
      []
    );
    expect(out.features).toHaveLength(1);
    expect(out.features[0].properties.id).toBe("pt");
  });

  it("passes through only venues matching the selected sport", () => {
    // Tennis venue carries NO leisure, so it cannot match Basketball via a shared 'pitch' leisure.
    const input = fc([
      mkVenue({ id: "bball", lng: 0, lat: 0, sport: "basketball" }),
      mkVenue({ id: "tennis", lng: 1, lat: 1, sport: "tennis" }),
    ]);
    const out = enrichVenueGeoJSON(input, ["Basketball"]);
    expect(out.features).toHaveLength(1);
    expect(out.features[0].properties.id).toBe("bball");
  });

  it("enriches each feature with sport_map_icon + sport_key", () => {
    const out = enrichVenueGeoJSON(fc([mkVenue({ id: "b", lng: 0, lat: 0, sport: "basketball" })]), []);
    const props = out.features[0].properties;
    expect(props.sport_map_icon).toBe("fun-game-sport-basketball");
    // basketball is the first catalog entry -> stable numeric key 1
    expect(props.sport_key).toBe(1);
    expect(typeof props.sport_key).toBe("number");
  });

  it("preserves the original [lng, lat] geometry ordering", () => {
    const out = enrichVenueGeoJSON(
      fc([mkVenue({ id: "b", lng: 12.34, lat: 56.78, sport: "basketball" })]),
      []
    );
    expect(out.features[0].geometry.coordinates).toEqual([12.34, 56.78]);
  });

  it("returns an empty collection for an empty input", () => {
    const out = enrichVenueGeoJSON(fc([]), []);
    expect(out.type).toBe("FeatureCollection");
    expect(out.features).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// clusterVenuePoints
// ---------------------------------------------------------------------------

describe("clusterVenuePoints", () => {
  it("returns empty area/dot/cluster outputs for an empty collection", () => {
    const res = clusterVenuePoints(fc([]), opts());
    expect(res.clusters).toHaveLength(0);
    expect(res.areaCollection.type).toBe("FeatureCollection");
    expect(res.areaCollection.features).toHaveLength(0);
    expect(res.dotCollection.type).toBe("FeatureCollection");
    expect(res.dotCollection.features).toHaveLength(0);
  });

  it("keeps two same-sport points far apart as separate clusters", () => {
    // ~111 m apart but maxDistance is only 50 m -> no merge.
    const res = clusterVenuePoints(
      fc([
        mkVenue({ id: "a", lng: 0, lat: 0, sport: "basketball" }),
        mkVenue({ id: "b", lng: 0, lat: LAT_DELTA_111M, sport: "basketball" }),
      ]),
      opts({ maxDistanceMeters: 50 })
    );
    expect(res.clusters).toHaveLength(2);
    expect(res.areaCollection.features).toHaveLength(2);
    expect(res.dotCollection.features).toHaveLength(2);
  });

  it("merges two nearby same-sport points and moves the center to their midpoint", () => {
    // ~11 m apart, well under the 200 m threshold.
    const res = clusterVenuePoints(
      fc([
        mkVenue({ id: "a", lng: 0, lat: 0, sport: "basketball" }),
        mkVenue({ id: "b", lng: 0, lat: 0.0001, sport: "basketball" }),
      ]),
      opts({ maxDistanceMeters: 200 })
    );
    expect(res.clusters).toHaveLength(1);
    // seed (0,0) + point (0,0.0001) -> midpoint lat = 0.00005, lng = 0
    expect(res.clusters[0].lng).toBeCloseTo(0, 12);
    expect(res.clusters[0].lat).toBeCloseTo(0.00005, 12);
    // dot geometry reflects the merged center, still [lng, lat] ordered
    expect(res.dotCollection.features[0].geometry.coordinates[0]).toBeCloseTo(0, 12);
    expect(res.dotCollection.features[0].geometry.coordinates[1]).toBeCloseTo(0.00005, 12);
  });

  it("does NOT merge nearby points of different primary sports", () => {
    // ~11 m apart (within 200 m) but basketball vs tennis -> stays two clusters.
    const res = clusterVenuePoints(
      fc([
        mkVenue({ id: "a", lng: 0, lat: 0, sport: "basketball" }),
        mkVenue({ id: "b", lng: 0, lat: 0.0001, sport: "tennis" }),
      ]),
      opts({ maxDistanceMeters: 200 })
    );
    expect(res.clusters).toHaveLength(2);
  });

  it("merges at the distance threshold (distance <= maxDistanceMeters)", () => {
    // Separation ~111.32 m; maxDistance 112 m is >= that, so they merge.
    const res = clusterVenuePoints(
      fc([
        mkVenue({ id: "a", lng: 0, lat: 0, sport: "basketball" }),
        mkVenue({ id: "b", lng: 0, lat: LAT_DELTA_111M, sport: "basketball" }),
      ]),
      opts({ maxDistanceMeters: 112 })
    );
    expect(res.clusters).toHaveLength(1);
  });

  it("does not merge just under the distance threshold", () => {
    // Separation ~111.32 m; maxDistance 111 m is below that, so no merge.
    const res = clusterVenuePoints(
      fc([
        mkVenue({ id: "a", lng: 0, lat: 0, sport: "basketball" }),
        mkVenue({ id: "b", lng: 0, lat: LAT_DELTA_111M, sport: "basketball" }),
      ]),
      opts({ maxDistanceMeters: 111 })
    );
    expect(res.clusters).toHaveLength(2);
  });

  it("applies the sport filter before clustering (passthrough)", () => {
    // Tennis venue has no leisure, so a Basketball filter drops it entirely.
    const res = clusterVenuePoints(
      fc([
        mkVenue({ id: "bball", lng: 0, lat: 0, sport: "basketball" }),
        mkVenue({ id: "tennis", lng: 0, lat: 0.0001, sport: "tennis" }),
      ]),
      opts({ venueSportsFilter: ["Basketball"] })
    );
    expect(res.clusters).toHaveLength(1);
    // Only the basketball venue survives.
    expect(res.dotCollection.features[0].properties.sport_key).toBe(1);
    expect(res.dotCollection.features[0].properties.id).toBe("bball");
  });

  it("builds Polygon area features and Point dot features with enriched props", () => {
    const res = clusterVenuePoints(
      fc([mkVenue({ id: "b1", lng: 0, lat: 0, sport: "basketball", name: "Court One" })]),
      opts({ venueAreaRadiusMeters: VENUE_AREA_RADIUS_METERS })
    );

    // Area layer: circular footprint polygon (default 32 steps -> 33 vertices).
    const area = res.areaCollection.features[0];
    expect(area.geometry.type).toBe("Polygon");
    expect(area.geometry.coordinates[0]).toHaveLength(33);
    expect(area.properties.id).toBe("b1");
    expect(area.properties.sport_map_icon).toBe("fun-game-sport-basketball");

    // Dot layer: center point, [lng, lat] ordering, lightweight props.
    const dot = res.dotCollection.features[0];
    expect(dot.geometry.type).toBe("Point");
    expect(dot.geometry.coordinates).toEqual([0, 0]);
    expect(dot.properties).toMatchObject({
      id: "b1",
      name: "Court One",
      sport_map_icon: "fun-game-sport-basketball",
      sport_key: 1,
    });
  });

  it("throws when the collection has no features array (no null guard)", () => {
    // Documents the real (unguarded) behavior: geojson.features.filter on undefined throws.
    expect(() => clusterVenuePoints({} as unknown as SportsVenueGeoJSON, opts())).toThrow();
  });
});

// ---------------------------------------------------------------------------
// DEFAULT_VENUE_CLUSTER_OPTS
// ---------------------------------------------------------------------------

describe("DEFAULT_VENUE_CLUSTER_OPTS", () => {
  it("exposes the tuned defaults kept in sync with mapConfig", () => {
    expect(DEFAULT_VENUE_CLUSTER_OPTS.maxDistanceMeters).toBe(80);
    expect(DEFAULT_VENUE_CLUSTER_OPTS.venueAreaRadiusMeters).toBe(VENUE_AREA_RADIUS_METERS);
    expect(DEFAULT_VENUE_CLUSTER_OPTS.venueAreaRadiusMeters).toBe(42);
  });
});
