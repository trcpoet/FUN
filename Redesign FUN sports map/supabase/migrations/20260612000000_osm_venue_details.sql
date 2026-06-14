-- Extended OSM tags + lazy Wikidata enrichment cache for venue sheets.
alter table public.osm_sports_venues
  add column if not exists surface text,
  add column if not exists lit text,
  add column if not exists access text,
  add column if not exists opening_hours text,
  add column if not exists website text,
  add column if not exists operator text,
  add column if not exists wikidata text,
  add column if not exists hero_image_url text,
  add column if not exists wikidata_label text,
  add column if not exists wikidata_description text,
  add column if not exists enriched_at timestamptz;
