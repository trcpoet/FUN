-- Google Places enrichment cache (photos + attribution) for venue detail cards.
alter table public.osm_sports_venues
  add column if not exists google_place_id text,
  add column if not exists google_photo_name text,
  add column if not exists photo_attributions jsonb,
  add column if not exists enrichment_source text;

comment on column public.osm_sports_venues.google_photo_name is
  'Places API (New) photo resource name — used by /api/venue-photo proxy.';
comment on column public.osm_sports_venues.enrichment_source is
  'google | wikidata — which provider supplied hero_image_url.';
