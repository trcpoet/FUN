/**
 * Mapbox Directions API v5 — travel time, distance, and route geometry.
 */

export type DirectionsProfile = "walking" | "cycling" | "driving";

export type DirectionsResult = {
  durationSec: number;
  distanceM: number;
  geometry: GeoJSON.LineString;
};

type MapboxRoute = {
  duration?: number;
  distance?: number;
  geometry?: GeoJSON.LineString;
};

type MapboxDirectionsResponse = {
  routes?: MapboxRoute[];
  code?: string;
  message?: string;
};

export function resolveMapboxToken(): string | null {
  const token =
    process.env.MAPBOX_ACCESS_TOKEN?.trim() ||
    process.env.VITE_MAPBOX_ACCESS_TOKEN?.trim() ||
    "";
  return token || null;
}

export async function fetchMapboxDirections(args: {
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
  profile?: DirectionsProfile;
  accessToken: string;
}): Promise<DirectionsResult | null> {
  const profile = args.profile ?? "walking";
  const { from, to } = args;
  const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
  const url = new URL(
    `https://api.mapbox.com/directions/v5/mapbox/${profile}/${coords}`
  );
  url.searchParams.set("geometries", "geojson");
  url.searchParams.set("overview", "full");
  url.searchParams.set("access_token", args.accessToken);

  const res = await fetch(url.toString());
  if (!res.ok) {
    console.warn("[mapboxDirections] upstream", res.status);
    return null;
  }

  const json = (await res.json()) as MapboxDirectionsResponse;
  const route = json.routes?.[0];
  if (!route?.geometry || route.duration == null || route.distance == null) {
    console.warn("[mapboxDirections] no route", json.code, json.message);
    return null;
  }

  return {
    durationSec: route.duration,
    distanceM: route.distance,
    geometry: route.geometry,
  };
}
