-- Cached OSM sports venues (pitches, sports centres) for fast map reads.
-- Populate via POST /api/osm-venues-import (secret) or scripts/import-osm-venues.mjs.

create table if not exists public.osm_sports_venues (
  id text primary key,
  lat double precision not null,
  lng double precision not null,
  name text,
  sport text,
  leisure text,
  osm_type text not null,
  osm_id bigint not null,
  imported_at timestamptz not null default now()
);

create index if not exists osm_sports_venues_lat_lng_idx
  on public.osm_sports_venues (lat, lng);

alter table public.osm_sports_venues enable row level security;

drop policy if exists "Anyone can read osm sports venues" on public.osm_sports_venues;
create policy "Anyone can read osm sports venues"
  on public.osm_sports_venues for select
  using (true);

-- Writes only via service role (import API / scripts), not anon.

notify pgrst, 'reload schema';
