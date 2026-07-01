/**
 * World News API proxy — sports-focused headlines near the user.
 * POST JSON: { lat, lng, radiusKm?, limit?, offset? }
 */
import { rateLimit, apiResponse } from "../server/lib/apiGuards";

export const config = { runtime: "edge" };

export type LocalNewsItem = {
  id: number;
  title: string;
  summary: string | null;
  url: string;
  image: string | null;
  publishDate: string;
  category: string | null;
  sourceCountry: string | null;
  sentiment: number | null;
  authors: string[];
  video: string | null;
};

type WorldNewsArticle = {
  id?: number;
  title?: string;
  summary?: string;
  url?: string;
  image?: string;
  publish_date?: string;
  category?: string;
  source_country?: string;
  sentiment?: number;
  authors?: string[];
  video?: string;
};

type WorldNewsSearchResponse = {
  news?: WorldNewsArticle[];
  available?: number;
};

type SearchParams = {
  lat: number;
  lng: number;
  radiusKm: number;
  limit: number;
  offset: number;
  categories?: string;
  text?: string;
};

const SPORT_KEYWORDS =
  "basketball OR football OR soccer OR baseball OR hockey OR tennis OR volleyball OR sports";

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function parseRequest(body: unknown): SearchParams | null {
  if (!body || typeof body !== "object") return null;
  const { lat, lng, radiusKm, limit, offset } = body as {
    lat?: unknown;
    lng?: unknown;
    radiusKm?: unknown;
    limit?: unknown;
    offset?: unknown;
  };
  if (typeof lat !== "number" || !Number.isFinite(lat) || lat < -90 || lat > 90) return null;
  if (typeof lng !== "number" || !Number.isFinite(lng) || lng < -180 || lng > 180) return null;
  const r =
    typeof radiusKm === "number" && Number.isFinite(radiusKm)
      ? clamp(Math.round(radiusKm), 1, 100)
      : 25;
  const l =
    typeof limit === "number" && Number.isFinite(limit) ? clamp(Math.round(limit), 1, 20) : 10;
  const o =
    typeof offset === "number" && Number.isFinite(offset) ? clamp(Math.round(offset), 0, 100_000) : 0;
  return { lat, lng, radiusKm: r, limit: l, offset: o };
}

function mapArticle(raw: WorldNewsArticle): LocalNewsItem | null {
  const id = raw.id;
  const title = raw.title?.trim();
  const url = raw.url?.trim();
  if (typeof id !== "number" || !title || !url) return null;
  const authors = Array.isArray(raw.authors)
    ? raw.authors.map((a) => (typeof a === "string" ? a.trim() : "")).filter(Boolean)
    : [];
  const video = raw.video?.trim() || null;
  return {
    id,
    title,
    summary: raw.summary?.trim() || null,
    url,
    image: raw.image?.trim() || null,
    publishDate: raw.publish_date?.trim() || "",
    category: raw.category?.trim() || null,
    sourceCountry: raw.source_country?.trim() || null,
    sentiment: typeof raw.sentiment === "number" && Number.isFinite(raw.sentiment) ? raw.sentiment : null,
    authors,
    video,
  };
}

function buildSearchParams(opts: SearchParams): URLSearchParams {
  const params = new URLSearchParams({
    "location-filter": `${opts.lat},${opts.lng},${opts.radiusKm}`,
    language: "en",
    number: String(opts.limit),
    offset: String(opts.offset),
    sort: "publish-time",
    "sort-direction": "DESC",
  });
  if (opts.categories) params.set("categories", opts.categories);
  if (opts.text) params.set("text", opts.text);
  return params;
}

async function fetchWorldNewsSearch(
  apiKey: string,
  opts: SearchParams,
): Promise<{ items: LocalNewsItem[]; available: number } | { error: string; status: number }> {
  const params = buildSearchParams(opts);
  let upstream: Response;
  try {
    upstream = await fetch(`https://api.worldnewsapi.com/search-news?${params.toString()}`, {
      headers: { "x-api-key": apiKey, Accept: "application/json" },
    });
  } catch {
    return { error: "News service unavailable", status: 502 };
  }

  if (!upstream.ok) {
    const status = upstream.status === 401 || upstream.status === 403 ? 502 : upstream.status;
    return { error: `News service error (${upstream.status})`, status };
  }

  let json: WorldNewsSearchResponse;
  try {
    json = (await upstream.json()) as WorldNewsSearchResponse;
  } catch {
    return { error: "Invalid news response", status: 502 };
  }

  const items = (json.news ?? [])
    .map(mapArticle)
    .filter((item): item is LocalNewsItem => item !== null);
  const available =
    typeof json.available === "number" && Number.isFinite(json.available)
      ? json.available
      : items.length;

  return { items, available };
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return apiResponse.error("METHOD_NOT_ALLOWED", "Method Not Allowed", 405);
  }

  const limited = rateLimit(request, { key: "local-news", limit: 30, windowMs: 60_000 });
  if (!limited.ok) {
    return apiResponse.error("RATE_LIMITED", "Too many requests", 429, {
      headers: { "Retry-After": String(limited.retryAfter) },
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiResponse.error("INVALID_JSON", "Invalid JSON", 400);
  }

  const parsed = parseRequest(body);
  if (!parsed) {
    return apiResponse.error("INVALID_COORDS", "Invalid lat/lng", 400);
  }

  const apiKey = (process.env.WORLD_NEWS_API_KEY ?? "").trim();
  if (!apiKey) {
    return apiResponse.error(
      "CONFIG",
      "Missing WORLD_NEWS_API_KEY — add it to .env (server-only) and restart dev / redeploy",
      500,
    );
  }

  const { lat, lng, radiusKm, limit, offset } = parsed;

  let primary = await fetchWorldNewsSearch(apiKey, {
    lat,
    lng,
    radiusKm,
    limit,
    offset,
    categories: "sports",
  });

  if ("error" in primary) {
    return apiResponse.error("UPSTREAM_ERROR", primary.error, primary.status);
  }

  let { items, available } = primary;

  if (offset === 0 && items.length < 3) {
    const fallback = await fetchWorldNewsSearch(apiKey, {
      lat,
      lng,
      radiusKm,
      limit,
      offset: 0,
      text: SPORT_KEYWORDS,
    });
    if (!("error" in fallback) && fallback.items.length > items.length) {
      items = fallback.items;
      available = fallback.available;
    }
  }

  return apiResponse.success({ items, available, offset });
}
