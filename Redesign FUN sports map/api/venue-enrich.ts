/**
 * Lazy Wikidata/Wikimedia enrichment for venue sheets.
 * POST JSON: { id: "way/12345" }
 */
import { rateLimit, apiResponse } from "../server/lib/apiGuards";

export const config = { runtime: "edge" };

const CACHE_MS = 30 * 24 * 60 * 60 * 1000;

type VenueRow = {
  id: string;
  wikidata: string | null;
  hero_image_url: string | null;
  wikidata_label: string | null;
  wikidata_description: string | null;
  enriched_at: string | null;
};

type WikidataEntityResponse = {
  entities?: Record<
    string,
    {
      labels?: Record<string, { value?: string }>;
      descriptions?: Record<string, { value?: string }>;
      claims?: {
        P18?: Array<{ mainsnak?: { datavalue?: { value?: string } } }>;
      };
    }
  >;
};

function normalizeWikidataId(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  if (/^Q\d+$/i.test(trimmed)) return trimmed.toUpperCase();
  const match = trimmed.match(/(Q\d+)/i);
  return match ? match[1]!.toUpperCase() : null;
}

function commonsImageUrl(filename: string): string {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}?width=800`;
}

async function fetchWikidataEnrichment(wikidataId: string): Promise<{
  heroImageUrl: string | null;
  label: string | null;
  description: string | null;
}> {
  const res = await fetch(
    `https://www.wikidata.org/wiki/Special:EntityData/${wikidataId}.json`,
    { headers: { Accept: "application/json" } }
  );
  if (!res.ok) {
    return { heroImageUrl: null, label: null, description: null };
  }

  const json = (await res.json()) as WikidataEntityResponse;
  const entity = json.entities?.[wikidataId];
  if (!entity) {
    return { heroImageUrl: null, label: null, description: null };
  }

  const label =
    entity.labels?.en?.value?.trim() ??
    Object.values(entity.labels ?? {})[0]?.value?.trim() ??
    null;
  const description =
    entity.descriptions?.en?.value?.trim() ??
    Object.values(entity.descriptions ?? {})[0]?.value?.trim() ??
    null;
  const imageClaim = entity.claims?.P18?.[0]?.mainsnak?.datavalue?.value?.trim();
  const heroImageUrl = imageClaim ? commonsImageUrl(imageClaim) : null;

  return { heroImageUrl, label, description };
}

function isCacheFresh(row: VenueRow): boolean {
  if (!row.enriched_at) return false;
  const ts = Date.parse(row.enriched_at);
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts < CACHE_MS;
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return apiResponse.error("METHOD_NOT_ALLOWED", "Method Not Allowed", 405);
  }

  const limited = rateLimit(request, { key: "venue-enrich", limit: 30, windowMs: 60_000 });
  if (!limited.ok) {
    return apiResponse.error("RATE_LIMITED", "Too many requests", 429, {
      headers: { "Retry-After": String(limited.retryAfter) },
    });
  }

  let body: { id?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiResponse.error("INVALID_JSON", "Invalid JSON", 400);
  }

  // Venue ids are OSM element refs, e.g. "way/12345" — reject anything else.
  const id = body.id?.trim();
  if (!id || !/^(node|way|relation)\/\d+$/.test(id)) {
    return apiResponse.error("INVALID_ID", "Invalid venue id", 400);
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return apiResponse.error("CONFIG", "Server misconfigured", 500);
  }

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: row, error: readError } = await supabase
    .from("osm_sports_venues")
    .select("id, wikidata, hero_image_url, wikidata_label, wikidata_description, enriched_at")
    .eq("id", id)
    .maybeSingle();

  if (readError) {
    console.error("[venue-enrich] read failed", readError.message);
    return apiResponse.error("DB_ERROR", "Lookup failed", 500);
  }

  if (!row) {
    return new Response(JSON.stringify({ heroImageUrl: null, label: null, description: null }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const venue = row as VenueRow;

  if (isCacheFresh(venue)) {
    return new Response(
      JSON.stringify({
        heroImageUrl: venue.hero_image_url,
        label: venue.wikidata_label,
        description: venue.wikidata_description,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  const wikidataId = normalizeWikidataId(venue.wikidata);
  if (!wikidataId) {
    const now = new Date().toISOString();
    await supabase
      .from("osm_sports_venues")
      .update({ enriched_at: now })
      .eq("id", id);
    return new Response(JSON.stringify({ heroImageUrl: null, label: null, description: null }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const enrichment = await fetchWikidataEnrichment(wikidataId);
  const now = new Date().toISOString();

  await supabase
    .from("osm_sports_venues")
    .update({
      hero_image_url: enrichment.heroImageUrl,
      wikidata_label: enrichment.label,
      wikidata_description: enrichment.description,
      enriched_at: now,
    })
    .eq("id", id);

  return new Response(JSON.stringify(enrichment), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
