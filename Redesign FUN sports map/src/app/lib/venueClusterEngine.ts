/**
 * Pure venue clustering for map rendering (shared by main thread + Web Worker).
 */

import type { Feature, FeatureCollection, Point, Polygon } from "geojson";
import { venueMatchesSelectedSports } from "../../lib/osmSportTags";
import type {
  SportsVenueGeoJSON,
  SportsVenueProperties,
  VenueClusterPoint,
  VenueDotProperties,
} from "./sportsVenueTypes";
import { VENUE_AREA_RADIUS_METERS } from "../map/mapConfig";
import { primaryVenueSportSuffix, venueSportKey, venueSportMapIconId } from "./venueSportIcon";

// Builds a circle (as a many-sided polygon) around a lng/lat point, sized in real-world meters.
// Used to draw the round "footprint" area around each venue cluster on the map.
export function circlePolygon(
  centerLng: number,
  centerLat: number,
  radiusMeters: number,
  steps = 32 // how many points form the circle — more steps = smoother edge
): Polygon {
  const coordinates: [number, number][] = [];
  const earthRadius = 6378137; // Earth's radius in meters (used to convert meters → degrees)

  // Walk around the full circle, placing one point at each step.
  for (let i = 0; i <= steps; i++) {
    const angle = (2 * Math.PI * i) / steps; // current angle around the circle, in radians
    const dx = (radiusMeters * Math.cos(angle)) / earthRadius; // east/west offset (in radians)
    const dy = (radiusMeters * Math.sin(angle)) / earthRadius; // north/south offset (in radians)

    // Convert the offsets back into longitude/latitude degrees.
    const lng = centerLng + (dx * 180) / Math.PI;
    // Latitude is scaled by cos(lat) because longitude lines bunch together near the poles.
    const lat = centerLat + (dy * 180) / Math.PI / Math.cos((centerLat * Math.PI) / 180);

    coordinates.push([lng, lat]);
  }

  // GeoJSON polygon: an outer ring of coordinates (must start and end at the same point).
  return {
    type: "Polygon",
    coordinates: [coordinates],
  };
}

// Helper: convert degrees to radians (trig math works in radians).
const toRadians = (deg: number) => (deg * Math.PI) / 180;

// Returns the straight-line distance in meters between two lng/lat points.
// Uses the Haversine formula, which accounts for the Earth's curvature.
function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6378137; // Earth's radius in meters
  const dLat = toRadians(lat2 - lat1); // difference in latitude
  const dLng = toRadians(lng2 - lng1); // difference in longitude
  // 'a' is the square of half the chord length between the points.
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); // angular distance in radians
  return R * c; // arc length = radius × angle = distance in meters
}

// The output of clustering, ready to hand to the map:
export type ClusterVenueResult = {
  areaCollection: FeatureCollection<Polygon, SportsVenueProperties>; // round footprint shapes
  dotCollection: FeatureCollection<Point, VenueDotProperties>; // center dots + sport icons
  clusters: VenueClusterPoint[]; // the raw merged cluster centers
};

/** Enrich raw OSM points with icon ids for Mapbox symbol layers / native clustering. */
export function enrichVenueGeoJSON(geojson: SportsVenueGeoJSON, venueSportsFilter: string[]): SportsVenueGeoJSON {
  const features = geojson.features
    .filter((f) => f.geometry?.type === "Point")
    .filter((f) => venueMatchesSelectedSports(f.properties.sport, venueSportsFilter, f.properties.leisure))
    .map((f) => ({
      ...f,
      properties: {
        ...f.properties,
        sport_map_icon: venueSportMapIconId(f.properties.sport, f.properties.leisure),
        sport_key: venueSportKey(f.properties.sport, f.properties.leisure),
      },
    }));
  return { type: "FeatureCollection", features };
}

/**
 * Cluster nearby OSM points into footprint polygons + dot layer payloads.
 */
export function clusterVenuePoints(
  geojson: SportsVenueGeoJSON,
  opts: {
    venueSportsFilter: string[];
    maxDistanceMeters: number;
    venueAreaRadiusMeters: number;
  }
): ClusterVenueResult {
  const { venueSportsFilter, maxDistanceMeters, venueAreaRadiusMeters } = opts;

  const clusters: VenueClusterPoint[] = []; // merged groups built up as we scan points

  // Keep only Point features that match the sports the user is filtering for.
  const pointFeatures = geojson.features.filter((f) => {
    if (!f.geometry || f.geometry.type !== "Point") return false; // skip lines/polygons
    return venueMatchesSelectedSports(f.properties.sport, venueSportsFilter, f.properties.leisure);
  });

  // Go through each venue point and either add it to a nearby cluster or start a new one.
  pointFeatures.forEach((f) => {
    const [lng, lat] = f.geometry.coordinates;

    const pointSport = primaryVenueSportSuffix(f.properties.sport, f.properties.leisure);

    // Look for an existing cluster within maxDistanceMeters of this point (same primary sport only).
    let targetCluster: VenueClusterPoint | null = null;
    for (const cluster of clusters) {
      const clusterSport = primaryVenueSportSuffix(cluster.properties.sport, cluster.properties.leisure);
      if (clusterSport !== pointSport) continue;
      if (distanceMeters(lat, lng, cluster.lat, cluster.lng) <= maxDistanceMeters) {
        targetCluster = cluster;
        break; // first close-enough cluster wins
      }
    }

    if (targetCluster) {
      // Found one nearby: nudge its center to the midpoint of old center and new point.
      targetCluster.lng = (targetCluster.lng + lng) / 2;
      targetCluster.lat = (targetCluster.lat + lat) / 2;
    } else {
      // Nothing close: this point becomes the seed of a brand-new cluster.
      clusters.push({ lng, lat, properties: f.properties });
    }
  });

  // Turn each cluster center into a round footprint polygon for the map's area layer.
  const areaFeatures: Feature<Polygon, SportsVenueProperties>[] = [];

  clusters.forEach((cluster) => {
    const polygon = circlePolygon(cluster.lng, cluster.lat, venueAreaRadiusMeters);
    areaFeatures.push({
      type: "Feature",
      geometry: polygon,
      properties: {
        ...cluster.properties,
        sport_map_icon: venueSportMapIconId(cluster.properties.sport, cluster.properties.leisure),
        sport_key: venueSportKey(cluster.properties.sport, cluster.properties.leisure),
      },
    });
  });

  const areaCollection: FeatureCollection<Polygon, SportsVenueProperties> = {
    type: "FeatureCollection",
    features: areaFeatures,
  };

  // Also build a lightweight dot for each cluster center (carries just id + name).
  const dotFeatures: Feature<Point, VenueDotProperties>[] = clusters.map((c) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [c.lng, c.lat] },
    properties: {
      id: c.properties.id,
      name: c.properties.name,
      sport_map_icon: venueSportMapIconId(c.properties.sport, c.properties.leisure),
      sport_key: venueSportKey(c.properties.sport, c.properties.leisure),
    },
  }));

  const dotCollection: FeatureCollection<Point, VenueDotProperties> = {
    type: "FeatureCollection",
    features: dotFeatures,
  };

  // Return all three forms so the map can draw areas, dots, and reuse raw cluster data.
  return { areaCollection, dotCollection, clusters };
}

// Default tuning values, kept in sync with how MapboxMap.tsx calls the clusterer.
export const DEFAULT_VENUE_CLUSTER_OPTS = {
  maxDistanceMeters: 80, // points within 80m of each other get merged into one cluster
  venueAreaRadiusMeters: VENUE_AREA_RADIUS_METERS, // size of each drawn footprint circle
} as const;
