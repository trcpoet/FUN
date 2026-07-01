/**
 * Client helpers for Mapbox Directions (via /api/directions proxy).
 */

export type DirectionsProfile = "walking" | "cycling" | "driving";

export type DirectionsResult = {
  durationSec: number;
  distanceM: number;
  geometry: GeoJSON.LineString;
};

const PROFILE_LABEL: Record<DirectionsProfile, string> = {
  walking: "walk",
  cycling: "bike",
  driving: "drive",
};

export function formatDistanceImperial(meters: number): string {
  const miles = meters / 1609.34;
  if (miles < 0.1) return `${Math.round(meters)} m`;
  return `${miles.toFixed(miles < 10 ? 1 : 0)} mi`;
}

export function formatDurationMinutes(seconds: number): string {
  const mins = Math.max(1, Math.round(seconds / 60));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function formatDirectionsSummary(
  profile: DirectionsProfile,
  result: Pick<DirectionsResult, "durationSec" | "distanceM">
): string {
  return `${formatDurationMinutes(result.durationSec)} ${PROFILE_LABEL[profile]} · ${formatDistanceImperial(result.distanceM)}`;
}

export async function fetchDirections(args: {
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
  profile?: DirectionsProfile;
}): Promise<{ data: DirectionsResult | null; error: Error | null }> {
  try {
    const res = await fetch("/api/directions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    if (!res.ok) {
      return { data: null, error: new Error(`Directions failed (${res.status})`) };
    }
    const json = (await res.json()) as DirectionsResult;
    return { data: json, error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e : new Error(String(e)) };
  }
}
