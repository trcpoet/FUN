-- Baseline OSM sports venues cache (public read, service-role write via import routes).
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

drop policy if exists "osm_sports_venues_public_read" on public.osm_sports_venues;
create policy "osm_sports_venues_public_read"
  on public.osm_sports_venues
  for select
  to anon, authenticated
  using (true);
