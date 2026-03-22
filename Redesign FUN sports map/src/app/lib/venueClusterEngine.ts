/**
 * Pure venue clustering for map rendering (shared by main thread + Web Worker).
 */

import type { Feature, FeatureCollection, Point, Polygon } from "geojson";
import { venueMatchesSelectedSports } from "../../lib/osmSportTags";
import type { SportsVenueGeoJSON, SportsVenueProperties, VenueClusterPoint } from "./sportsVenueTypes";
import { VENUE_AREA_RADIUS_METERS } from "../map/mapConfig";

export function circlePolygon(
  centerLng: number,
  centerLat: number,
  radiusMeters: number,
  steps = 32
): Polygon {
  const coordinates: [number, number][] = [];
  const earthRadius = 6378137;

  for (let i = 0; i <= steps; i++) {
    const angle = (2 * Math.PI * i) / steps;
    const dx = (radiusMeters * Math.cos(angle)) / earthRadius;
    const dy = (radiusMeters * Math.sin(angle)) / earthRadius;

    const lng = centerLng + (dx * 180) / Math.PI;
    const lat = centerLat + (dy * 180) / Math.PI / Math.cos((centerLat * Math.PI) / 180);

    coordinates.push([lng, lat]);
  }

  return {
    type: "Polygon",
    coordinates: [coordinates],
  };
}

const toRadians = (deg: number) => (deg * Math.PI) / 180;

function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6378137;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export type ClusterVenueResult = {
  areaCollection: FeatureCollection<Polygon, SportsVenueProperties>;
  dotCollection: FeatureCollection<Point, { id: string; name?: string }>;
  clusters: VenueClusterPoint[];
};

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

  const clusters: VenueClusterPoint[] = [];

  const pointFeatures = geojson.features.filter((f) => {
    if (!f.geometry || f.geometry.type !== "Point") return false;
    return venueMatchesSelectedSports(f.properties.sport, venueSportsFilter, f.properties.leisure);
  });

  pointFeatures.forEach((f) => {
    const [lng, lat] = f.geometry.coordinates;

    let targetCluster: VenueClusterPoint | null = null;
    for (const cluster of clusters) {
      if (distanceMeters(lat, lng, cluster.lat, cluster.lng) <= maxDistanceMeters) {
        targetCluster = cluster;
        break;
      }
    }

    if (targetCluster) {
      targetCluster.lng = (targetCluster.lng + lng) / 2;
      targetCluster.lat = (targetCluster.lat + lat) / 2;
    } else {
      clusters.push({ lng, lat, properties: f.properties });
    }
  });

  const areaFeatures: Feature<Polygon, SportsVenueProperties>[] = [];

  clusters.forEach((cluster) => {
    const polygon = circlePolygon(cluster.lng, cluster.lat, venueAreaRadiusMeters);
    areaFeatures.push({
      type: "Feature",
      geometry: polygon,
      properties: cluster.properties,
    });
  });

  const areaCollection: FeatureCollection<Polygon, SportsVenueProperties> = {
    type: "FeatureCollection",
    features: areaFeatures,
  };

  const dotFeatures: Feature<Point, { id: string; name?: string }>[] = clusters.map((c) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [c.lng, c.lat] },
    properties: { id: c.properties.id, name: c.properties.name },
  }));

  const dotCollection: FeatureCollection<Point, { id: string; name?: string }> = {
    type: "FeatureCollection",
    features: dotFeatures,
  };

  return { areaCollection, dotCollection, clusters };
}

/** Defaults matching MapboxMap.tsx */
export const DEFAULT_VENUE_CLUSTER_OPTS = {
  maxDistanceMeters: 80,
  venueAreaRadiusMeters: VENUE_AREA_RADIUS_METERS,
} as const;
