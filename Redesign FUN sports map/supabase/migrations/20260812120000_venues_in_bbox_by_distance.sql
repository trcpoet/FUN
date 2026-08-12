-- ===========================================================================
-- get_venues_in_bbox — the venue layer's read, ordered by proximity.
--
-- WHY
-- ---
-- PostgREST on this project enforces `db-max-rows = 1000`. Verified against
-- production: `?limit=5000` and `?limit=1500` both return exactly 1000 rows,
-- so the `.limit(8000)` the client asks for has never once been achievable.
--
-- That cap on its own is survivable. What made it a bug is the ordering. The
-- client's query was `.order("id")` and then sorted by distance *after* the
-- rows arrived — so the 1000 rows it received were the 1000 lowest OSM ids in
-- the box, an arbitrary geographic subset, and the "nearest" venues shown were
-- merely the nearest of that arbitrary sample. Measured over a 25 km box
-- around Grapevine TX: 4,818 venues pass the access filter, 1,000 came back,
-- and a 33 km pitch could appear while nearer ones were silently absent.
--
-- Ordering has to happen server-side, before the cap applies. PostgREST's
-- `order=` only accepts real columns and distance depends on where the viewer
-- is, so this has to be a function.
--
-- WHY THE DISTANCE MATH IS NOT PostGIS
-- ------------------------------------
-- `st_distance(...::geography, ...)` is the idiom `get_games_nearby` uses, and
-- it is the wrong tool here. Measured on the same 25 km box:
--
--     filter only, no ORDER BY ......  24.7 ms
--     ORDER BY st_distance(geography)  235.6 ms
--     ORDER BY the expression below ..  6.4 ms
--
-- Spheroid math cost ten times the entire rest of the query, on a read the map
-- fires on every settle. This is a *sort key*, not a reported distance — the
-- client already computes real distances for display (`haversineDistanceMeters`,
-- `distanceKmBetween`) — so it needs to rank correctly, not to be accurate in
-- metres. Scaling longitude by cos(latitude) removes the distortion that makes
-- a naive degree sort wrong (at latitude 33 a degree of longitude is ~0.84 of a
-- degree of latitude, so east-west venues would otherwise rank ~16% too near).
--
-- Squared distance is used because the square root is monotonic and would only
-- add cost. The approximation is sound for the bbox sizes this serves —
-- `apiGuards` caps a request at 0.6 square degrees — and is NOT valid across
-- the antimeridian or near the poles. If this ever has to serve a global bbox,
-- go back to geography and pay for it.
--
-- WHY THE ACCESS FILTER IS REPEATED HERE
-- --------------------------------------
-- Roughly half of `osm_sports_venues` is unnamed residential swimming pools.
-- Without excluding them here the 1000-row budget gets spent on backyards
-- before the client ever sees a pitch. This must stay a strict SUBSET of
-- `venueAccessTier` in src/app/lib/venueAccess.ts, which remains the rule and
-- still runs per row on the client as the backstop.
--
-- NULL SAFETY: `access` is NULL on 38,867 of 85,388 rows, and
-- `access NOT IN ('private','no')` evaluates to NULL — not true — for every one
-- of them. Both predicates below are wrapped in `coalesce` for exactly that
-- reason; dropping it silently deletes every untagged venue from the map.
-- ===========================================================================

create or replace function public.get_venues_in_bbox(
  p_min_lat double precision,
  p_min_lng double precision,
  p_max_lat double precision,
  p_max_lng double precision,
  p_limit   int default 1000
)
returns table (
  id                   text,
  lat                  double precision,
  lng                  double precision,
  name                 text,
  sport                text,
  leisure              text,
  osm_type             text,
  osm_id               bigint,
  surface              text,
  lit                  text,
  access               text,
  opening_hours        text,
  website              text,
  operator             text,
  wikidata             text,
  hero_image_url       text,
  wikidata_label       text,
  wikidata_description text,
  photo_attributions   jsonb,
  enrichment_source    text
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
    v.id, v.lat, v.lng, v.name, v.sport, v.leisure, v.osm_type, v.osm_id,
    v.surface, v.lit, v.access, v.opening_hours, v.website, v.operator,
    v.wikidata, v.hero_image_url, v.wikidata_label, v.wikidata_description,
    v.photo_attributions, v.enrichment_source
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
  'Venues inside a bbox, nearest-first from the bbox centre, with private and '
  'residential venues excluded. Exists because PostgREST caps responses at 1000 '
  'rows, so the ordering has to be applied before the cap rather than after.';

-- Postgres grants EXECUTE to PUBLIC on every new function; revoke first so the
-- real grant is visible here rather than inherited as a default. Guests read
-- the map, so anon needs it too.
revoke execute on function public.get_venues_in_bbox(double precision, double precision, double precision, double precision, int) from public;
grant execute on function public.get_venues_in_bbox(double precision, double precision, double precision, double precision, int) to anon, authenticated;

notify pgrst, 'reload schema';
