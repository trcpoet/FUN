/**
 * Client helpers for Mapbox Directions (via /api/directions proxy).
 */

export type DirectionsProfile = "walking" | "cycling" | "driving";

export type DirectionsResult = {
  durationSec: number;
  distanceM: number;
  geometry: GeoJSON.LineString;
};

/**
 * Extras a "show me this route" caller can hand over. Popups already fetch the route to render
 * their ETA label, so passing `result` back up avoids a second identical Directions call.
 */
export type NavigateToOptions = {
  result?: DirectionsResult | null;
  label?: string | null;
};

/** Assumed cooldown when a 429 arrives without a usable Retry-After header. */
export const RATE_LIMIT_FALLBACK_SEC = 60;

/** A failed Directions request, carrying enough for callers to branch without string-matching. */
export class DirectionsError extends Error {
  readonly status: number;
  readonly retryAfterSec: number | null;

  constructor(message: string, status: number, retryAfterSec: number | null = null) {
    super(message);
    this.name = "DirectionsError";
    this.status = status;
    this.retryAfterSec = retryAfterSec;
  }

  get rateLimited(): boolean {
    return this.status === 429;
  }
}

/**
 * Circuit breaker for /api/directions.
 *
 * The proxy rate-limits per IP (40 req / 60s) and answers with Retry-After. Once we've been
 * told to back off, further calls short-circuit locally instead of adding to the flood — a
 * client that keeps knocking during its own cooldown is the thing the limit exists to stop.
 */
let rateLimitedUntil = 0;

/** Milliseconds left on the 429 cooldown; 0 when requests are flowing. */
export function directionsCooldownMsLeft(now = Date.now()): number {
  return Math.max(0, rateLimitedUntil - now);
}

/** Our proxy sends Retry-After in seconds; anything else we can't use. */
function parseRetryAfterSec(header: string | null): number | null {
  if (!header) return null;
  const sec = Number(header);
  return Number.isFinite(sec) && sec > 0 ? sec : null;
}

function rateLimitMessage(sec: number): string {
  return `Directions rate limited — retry in ${sec}s`;
}

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
  const cooldownMs = directionsCooldownMsLeft();
  if (cooldownMs > 0) {
    const sec = Math.ceil(cooldownMs / 1000);
    return { data: null, error: new DirectionsError(rateLimitMessage(sec), 429, sec) };
  }

  try {
    const res = await fetch("/api/directions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    if (!res.ok) {
      if (res.status === 429) {
        const retryAfterSec =
          parseRetryAfterSec(res.headers.get("Retry-After")) ?? RATE_LIMIT_FALLBACK_SEC;
        rateLimitedUntil = Date.now() + retryAfterSec * 1000;
        return {
          data: null,
          error: new DirectionsError(rateLimitMessage(retryAfterSec), 429, retryAfterSec),
        };
      }
      return {
        data: null,
        error: new DirectionsError(`Directions failed (${res.status})`, res.status),
      };
    }
    rateLimitedUntil = 0;
    const json = (await res.json()) as DirectionsResult;
    return { data: json, error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e : new Error(String(e)) };
  }
}
