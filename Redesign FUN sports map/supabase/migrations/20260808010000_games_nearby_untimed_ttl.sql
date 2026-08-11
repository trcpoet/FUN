-- Align get_games_nearby with get_live_nearby's untimed TTL.
--
-- Bug: search "N games in current radius" counted raw RPC rows. Untimed pickups
-- (starts_at/ends_at null) stay status='open' forever, so
--   (g.ends_at is null or g.ends_at > now())
-- kept shipping March soccer ghosts. The map correctly hid them via
-- MAP_UNTIMED_TTL_MS (3 days) in filterGamesVisibleOnMap — search did not.
--
-- get_live_nearby already ages untimed rows out after 3 days; mirror that here.

create or replace function public.get_games_nearby(
  lat double precision,
  lng double precision,
  radius_km double precision default 10
)
returns table(
  id uuid,
  title text,
  sport text,
  spots_needed integer,
  starts_at timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone,
  status text,
  location_label text,
  description text,
  requirements jsonb,
  participant_count integer,
  substitute_count integer,
  spots_remaining integer,
  distance_km double precision,
  lat double precision,
  lng double precision,
  live_started_at timestamp with time zone,
  ended_at timestamp with time zone,
  visibility text,
  ends_at timestamp with time zone,
  duration_minutes integer
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with viewer as (
    select p.gender from public.profiles p where p.id = auth.uid()
  )
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
    coalesce(g.requirements, '{}'::jsonb)                          as requirements,
    coalesce(part.player_cnt, 0)::int                              as participant_count,
    coalesce(part.sub_cnt, 0)::int                                 as substitute_count,
    greatest(g.spots_needed - coalesce(part.player_cnt, 0), 0)::int as spots_remaining,
    (st_distance(g.location, st_point(lng, lat)::geography) / 1000.0) as distance_km,
    st_y(g.location::geometry)                                     as lat,
    st_x(g.location::geometry)                                     as lng,
    g.live_started_at,
    g.ended_at,
    g.visibility,
    g.ends_at,
    g.duration_minutes
  from public.games g
  left join lateral (
    select
      count(*) filter (where gp.role != 'substitute')::int as player_cnt,
      count(*) filter (where gp.role  = 'substitute')::int as sub_cnt
    from public.game_participants gp
    where gp.game_id = g.id
  ) part on true
  left join public.profiles host on host.id = g.created_by
  where st_dwithin(g.location, st_point(lng, lat)::geography, radius_km * 1000.0)
    and g.status in ('open', 'full', 'live')
    and (
      g.status <> 'live'
      or (coalesce(g.live_started_at, g.updated_at, g.created_at) > now() - interval '24 hours')
    )
    -- Timed: expire at ends_at. Untimed: age out on the same 3-day map TTL as get_live_nearby.
    and (
      (g.ends_at is not null and g.ends_at > now())
      or (g.ends_at is null and g.created_at > now() - interval '3 days')
    )
    and (
      g.live_started_at is null
      or g.live_started_at + make_interval(mins => coalesce(g.duration_minutes, 90)) > now()
    )
    and public.can_view_game_for_gender(
      (select gender from viewer),
      host.gender,
      g.requirements->>'matchType'
    )
  order by distance_km asc;
$function$;

revoke execute on function public.get_games_nearby(double precision, double precision, double precision) from public;
grant execute on function public.get_games_nearby(double precision, double precision, double precision) to anon, authenticated;

-- Close untimed ghosts that already outlived the map TTL (keeps tables honest).
update public.games
   set status     = 'completed',
       ended_at   = coalesce(ended_at, now()),
       updated_at = now()
 where status in ('open', 'full')
   and starts_at is null
   and ends_at is null
   and created_at <= now() - interval '3 days';
