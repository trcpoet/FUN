/**
 * Shared guards for the serverless /api/* routes (Edge runtime).
 *
 * RATE-LIMIT CAVEAT: Edge functions run as many short-lived isolates with no shared
 * memory, so the in-memory limiter below is *best-effort* — each isolate keeps its own
 * counters. It blunts naive single-isolate floods but is not a hard global limit. For a
 * strict cross-region limit, back this with Upstash/Vercel KV (follow-up, out of scope).
 */

export type Bbox = { minLat: number; minLng: number; maxLat: number; maxLng: number };

/**
 * Max bbox area we accept, in square degrees. The largest legitimate venue fetch is a
 * 25 km radius (FiltersModal slider cap) ≈ 0.265 deg²; 0.6 leaves ~2.3× headroom while
 * rejecting continent-scale (≥ ~38 km radius) abuse of the Overpass upstream.
 */
export const MAX_BBOX_DEG2 = 0.6;

type BboxValidation = { ok: true; bbox: Bbox } | { ok: false; error: string };

/** Validate an untrusted `{ minLat, minLng, maxLat, maxLng }` body. */
export function validateBbox(body: unknown): BboxValidation {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Invalid bbox" };
  }
  const { minLat, minLng, maxLat, maxLng } = body as Partial<Bbox>;
  if (
    typeof minLat !== "number" || !Number.isFinite(minLat) ||
    typeof minLng !== "number" || !Number.isFinite(minLng) ||
    typeof maxLat !== "number" || !Number.isFinite(maxLat) ||
    typeof maxLng !== "number" || !Number.isFinite(maxLng) ||
    minLat >= maxLat ||
    minLng >= maxLng
  ) {
    return { ok: false, error: "Invalid bbox" };
  }
  if (minLat < -90 || maxLat > 90 || minLng < -180 || maxLng > 180) {
    return { ok: false, error: "bbox out of range" };
  }
  if ((maxLat - minLat) * (maxLng - minLng) > MAX_BBOX_DEG2) {
    return { ok: false, error: `bbox too large (max ${MAX_BBOX_DEG2} deg²)` };
  }
  return { ok: true, bbox: { minLat, minLng, maxLat, maxLng } };
}

/** Best-effort client IP from Vercel's forwarding headers (unknowns share one bucket). */
export function getClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  const first = xff?.split(",")[0]?.trim();
  if (first) return first;
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

type RateLimitResult = { ok: true } | { ok: false; retryAfter: number };
type RateBucket = { count: number; resetAt: number };

const rateBuckets = new Map<string, RateBucket>();

/** Fixed-window, per-IP, in-memory rate limit. Best-effort on Edge — see module caveat. */
export function rateLimit(
  request: Request,
  opts: { key: string; limit: number; windowMs: number },
): RateLimitResult {
  const now = Date.now();

  // Opportunistic prune so the bucket map can't grow without bound in a long-lived isolate.
  if (rateBuckets.size > 5000) {
    for (const [k, v] of rateBuckets) {
      if (v.resetAt <= now) rateBuckets.delete(k);
    }
  }

  const bucketKey = `${opts.key}:${getClientIp(request)}`;
  const bucket = rateBuckets.get(bucketKey);

  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(bucketKey, { count: 1, resetAt: now + opts.windowMs });
    return { ok: true };
  }
  if (bucket.count >= opts.limit) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }
  bucket.count += 1;
  return { ok: true };
}

const JSON_HEADERS: Record<string, string> = { "Content-Type": "application/json" };

type JsonResponseInit = { status?: number; headers?: Record<string, string> };

/**
 * Consistent response envelope: `{ success: false, error: { code, message } }` on errors,
 * `{ success: true, data }` on success. Routes with an established client contract (venue
 * GeoJSON, enrichment object, import summary) keep their existing success shape and use
 * `error` only — so client parsers don't break.
 */
export const apiResponse = {
  success(data: unknown, init?: JsonResponseInit): Response {
    return new Response(JSON.stringify({ success: true, data }), {
      status: init?.status ?? 200,
      headers: { ...JSON_HEADERS, ...(init?.headers ?? {}) },
    });
  },
  error(code: string, message: string, status: number, init?: JsonResponseInit): Response {
    return new Response(JSON.stringify({ success: false, error: { code, message } }), {
      status,
      headers: { ...JSON_HEADERS, ...(init?.headers ?? {}) },
    });
  },
};
