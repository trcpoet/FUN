-- Untimed games (starts_at is null): only return if created within the last 3 days (map listing TTL).
-- Matches app filter in `filterGamesVisibleOnMap` / `MAP_UNTIMED_TTL_MS`.

drop function if exists public.get_games_nearby(double precision, double precision, double precision);

create or replace function public.get_games_nearby(
  lat double precision,
  lng double precision,
  radius_km double precision default 10
)
returns table (
  id uuid,
  title text,
  sport text,
  spots_needed int,
  starts_at timestamptz,
  created_by uuid,
  created_at timestamptz,
  status text,
  location_label text,
  description text,
  requirements jsonb,
  participant_count int,
  spots_remaining int,
  distance_km double precision,
  lat double precision,
  lng double precision
)
language sql
stable
security definer
set search_path = public
as $$
  select
    g.id,
    g.title,
    g.sport,
    g.spots_needed,
    g.starts_at,
    g.created_by,
    g.created_at,
    g.status,
    g.location_label,
    g.description,
    coalesce(g.requirements, '{}'::jsonb) as requirements,
    coalesce(part.cnt, 0)::int as participant_count,
    greatest(g.spots_needed - coalesce(part.cnt, 0), 0)::int as spots_remaining,
    (st_distance(g.location, st_point(lng, lat)::geography) / 1000.0) as distance_km,
    st_y(g.location::geometry) as lat,
    st_x(g.location::geometry) as lng
  from public.games g
  left join lateral (
    select count(*)::int as cnt
    from public.game_participants gp
    where gp.game_id = g.id
  ) part on true
  where st_dwithin(g.location, st_point(lng, lat)::geography, radius_km * 1000.0)
    and (
      g.starts_at is not null
      or g.created_at >= (now() - interval '3 days')
    )
  order by g.location <-> st_point(lng, lat)::geography
  limit 50;
$$;

grant execute on function public.get_games_nearby(double precision, double precision, double precision)
  to authenticated;
grant execute on function public.get_games_nearby(double precision, double precision, double precision)
  to anon;
