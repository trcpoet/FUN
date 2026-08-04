-- ===========================================================================
-- Venue enrichment v2 — richer OSM/Google data + multi-photo galleries.
--
-- WHY
-- ---
-- The venue Details modal could only ever show ONE photo: `google_photo_name`
-- is a single text column and server/lib/googlePlaces.ts kept only photos[0],
-- discarding the other nine Google returns. Meanwhile the OSM importer's tag
-- whitelist dropped ~30 useful tags (hoops, lanes, capacity, fee, covered,
-- wheelchair, phone, image, wikimedia_commons, …) that Overpass already hands
-- us for free, and Wikidata's P18 claim was read at index [0] only.
--
-- This adds the storage those three sources need.
--
-- WHY jsonb RATHER THAN ~12 FLAT COLUMNS
-- --------------------------------------
-- Every one of these fields is display-only — never filtered, never sorted,
-- never joined. A flat column costs an edit in six plumbing files
-- (supabase.ts, mapboxMapTypes.ts, sportsVenueTypes.ts, venueSelection.ts and
-- the two duplicated OSM_VENUE_SELECT strings). Promote any individual field
-- to a real column the day it needs an index.
--
-- CACHE VERSIONING
-- ----------------
-- `enrichment_version` fixes a real operational trap: venues visited before
-- this change have `enriched_at` stamped, so the 30-day freshness check would
-- keep returning "no photo" for a month even after the pipeline improved.
-- api/venue-enrich.ts now treats any row below its current ENRICHMENT_VERSION
-- as stale, so this and every future enrichment change self-heals with no
-- manual SQL and no thundering-herd re-enrichment.
-- ===========================================================================

alter table public.osm_sports_venues
  add column if not exists tags               jsonb,
  add column if not exists photos             jsonb,
  add column if not exists google_details     jsonb,
  add column if not exists enrichment_version int not null default 0;

comment on column public.osm_sports_venues.tags is
  'Whitelisted long-tail OSM tags (hoops, lanes, capacity, fee, covered, wheelchair, '
  'phone, image, wikimedia_commons, wikipedia, description, addr{...}). Display-only. '
  'Written by server/lib/osmVenueTags.ts buildOsmTagBag(). Deliberately NOT emitted '
  'into map GeoJSON properties — that path selects up to 8000 rows.';

comment on column public.osm_sports_venues.photos is
  'Merged gallery, priority-ordered: '
  '[{source:"google"|"osm"|"wikimedia"|"wikidata", ref?, url?, attribution, attribution_url}]. '
  'Google entries carry a photo RESOURCE NAME in `ref`, never bytes and never a Google URL — '
  'they are served through /api/venue-photo?venueId=..&i=N so the API key stays server-side.';

comment on column public.osm_sports_venues.google_details is
  'Google Places non-photo content (rating, userRatingCount, formattedAddress, phone, '
  'hours, editorialSummary, accessibility/parking, businessStatus, googleMapsUri) plus '
  'fetchedAt. SHORT 24h TTL per Places terms. NEVER contains review text — Google review '
  'text may not be commingled with first-party reviews, so it is not requested at all.';

comment on column public.osm_sports_venues.enrichment_version is
  'Bumped in api/venue-enrich.ts (ENRICHMENT_VERSION) whenever the enrichment shape '
  'changes. Rows below the current value are treated as stale regardless of enriched_at.';

-- No RLS change: osm_sports_venues_public_read already covers reads, and every
-- write to this table goes through the service role or a SECURITY DEFINER RPC.

notify pgrst, 'reload schema';
