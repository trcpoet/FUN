-- The map read stops carrying the venue card's data.
--
-- `get_venues_in_bbox` returns 20 columns for up to 1,000 venues. Measured against
-- production today: 416 KB per map load, of which 303 KB (73%) is data the map
-- never draws — wikidata_description, photo_attributions, hero_image_url,
-- enrichment_source, wikidata_label, opening_hours, website, operator, surface,
-- lit. Every one of those is downloaded, parsed, turned into a GeoJSON feature
-- property, and held in memory for every pin in the viewport, so that the venue
-- card can then re-read the same row through `fetchVenueById` the moment it opens.
--
-- What the map actually uses: the pin's position and identity (id, lat, lng,
-- osm_type, osm_id), what to draw (name, sport, leisure) and whether to draw it
-- at all (access — `venueAccess.ts` decides open / restricted / hidden). That is
-- 113 KB. `osmVenueColumns.ts` already documents the rule this restores: "MAP
-- selects up to 8000 rows for the venue layer, so it stays lean."
--
-- The return type changes, so this is a drop + create; the ACLs are re-granted
-- below. Filters, ordering and the cap are byte-for-byte the ones from
-- 20260812120000 — only the projection narrows.
--
-- Deploy order: the client that stops reading the dropped columns off map rows
-- ships first. It is tolerant either way (the venue card refetches the full row
-- on open), so an older client simply shows hours and hero a few hundred
-- milliseconds later, once `fetchVenueById` lands.

drop function if exists public.get_venues_in_bbox(double precision, double precision, double precision, double precision, int);

create function public.get_venues_in_bbox(
  p_min_lat double precision,
  p_min_lng double precision,
  p_max_lat double precision,
  p_max_lng double precision,
  p_limit   int default 1000
)
returns table (
  id       text,
  lat      double precision,
  lng      double precision,
  name     text,
  sport    text,
  leisure  text,
  osm_type text,
  osm_id   bigint,
  access   text
)
language sql
stable
security invoker
set search_path = public
as $$
  with anchor as (
    -- Ordering is relative to the middle of the requested box, which is the
    -- viewport centre for the map and the viewer's own position for the
    -- Popular Venues list. Deriving it here keeps the client signature a plain
    -- bbox, exactly as before.
    select
      (p_min_lat + p_max_lat) / 2.0 as clat,
      (p_min_lng + p_max_lng) / 2.0 as clng
  )
  select
    v.id, v.lat, v.lng, v.name, v.sport, v.leisure, v.osm_type, v.osm_id, v.access
  from public.osm_sports_venues v, anchor a
  where v.lat between p_min_lat and p_max_lat
    and v.lng between p_min_lng and p_max_lng
    -- Rule 1: the venue says the public is not welcome. Trust it.
    and coalesce(lower(btrim(v.access)) not in ('private', 'no'), true)
    -- Rule 2: an unnamed pool claiming no access is somebody's back garden.
    and not coalesce(
      lower(btrim(v.leisure)) = 'swimming_pool'
      and btrim(coalesce(v.name, '')) = ''
      and (
        v.access is null
        or lower(btrim(v.access)) not in
             ('yes', 'public', 'permissive', 'customers', 'members', 'membership', 'permit')
      ),
      false
    )
  order by
    ((v.lng - a.clng) * cos(radians(a.clat))) ^ 2 + (v.lat - a.clat) ^ 2
  limit greatest(1, least(coalesce(p_limit, 1000), 5000));
$$;

comment on function public.get_venues_in_bbox(double precision, double precision, double precision, double precision, int) is
  'Venues inside a bbox, nearest-first from the bbox centre, private and residential '
  'excluded. Projection is deliberately the nine columns the map draws with — the '
  'venue card reads the rest one row at a time through fetchVenueById. Do not widen '
  'it: every column here is multiplied by up to 1000 pins on every map load.';

revoke execute on function public.get_venues_in_bbox(double precision, double precision, double precision, double precision, int) from public;
grant execute on function public.get_venues_in_bbox(double precision, double precision, double precision, double precision, int) to anon, authenticated;

notify pgrst, 'reload schema';

-- Verification:
--   select pg_column_size(t)::int as row_bytes from public.get_venues_in_bbox(32.6, -97.25, 32.85, -97.0, 1000) t limit 1;
--   select count(*) from public.get_venues_in_bbox(32.6, -97.25, 32.85, -97.0, 1000);  -- unchanged row count
--   -- and as anon: still executable, still excludes private/residential.
