-- Migration: Game Creation Quality & Anti-Spam
-- Adds RPCs for host rate-limiting and smart-merging overlapping games

-- 1. Host Rate Limiting
-- Returns the number of active games a user has created currently.
create or replace function public.get_active_hosted_games_count(p_user_id uuid default auth.uid())
returns int
language sql
security definer
set search_path = public
as $$
  select count(*)::int
  from public.games
  where created_by = coalesce(p_user_id, auth.uid())
    and status in ('open', 'full')
    -- Only count games starting in the future (ignores past ghost games)
    and (starts_at is null or starts_at >= now());
$$;

-- 2. Smart Merge (Nearby Similar Games)
-- Returns up to 5 nearby open games of the same sport starting within +/- 2 hours.
create or replace function public.check_nearby_similar_games(
  p_sport text,
  p_lat double precision,
  p_lng double precision,
  p_starts_at timestamptz,
  p_radius_km double precision default 5.0
)
returns table (
  id uuid,
  title text,
  sport text,
  starts_at timestamptz,
  status text,
  distance_km double precision
)
language sql
security definer
set search_path = public
as $$
  select
    id, title, sport, starts_at, status,
    (st_distance(location, st_point(p_lng, p_lat)::geography) / 1000.0) as distance_km
  from public.games
  where sport = p_sport
    and status = 'open'
    and starts_at is not null
    and starts_at >= (p_starts_at - interval '2 hours')
    and starts_at <= (p_starts_at + interval '2 hours')
    and st_dwithin(location, st_point(p_lng, p_lat)::geography, p_radius_km * 1000.0)
  order by distance_km asc
  limit 5;
$$;
