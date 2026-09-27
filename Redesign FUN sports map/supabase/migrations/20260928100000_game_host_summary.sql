-- The map read carries the host.
--
-- `games.created_by` is a bare uuid, and there is no batch profile lookup
-- anywhere in the client — every use of `created_by` is an identity comparison
-- (`=== currentUserId`) to decide host-ness, never a name fetch. So a card that
-- wants to say "hosted by Alex, rated 4.6" has two choices: two round-trips per
-- pin tap, or denormalise onto the row that is already being read.
--
-- On a map where tapping around is the main gesture, per-tap fetches are the
-- wrong answer, and CLAUDE.md already says so: "RPC over Table Queries —
-- complex aggregations/joins use Postgres functions, not direct SELECT" and
-- "fewer round-trips, stable shapes".
--
-- The guest wrapper projects all three as NULL. That is the point of doing it
-- here rather than in JSX: "a guest never learns who hosts" stays a property of
-- the schema, exactly as `created_by` already is, and the client renders no host
-- row simply because there is no host name to render.
--
-- Both are drop + create because the return type changes; ACLs are re-granted
-- below. Filters, ordering and every existing column are byte-for-byte the ones
-- from 20260922130000 — only the projection grows.
--
-- Additive: a deployed client that ignores three extra columns is unaffected.
-- Ships BEFORE the client that reads them.

-- ---------------------------------------------------------------------------
-- 1) The member read
-- ---------------------------------------------------------------------------

drop function if exists public.get_games_nearby(double precision, double precision, double precision);

create function public.get_games_nearby(
  lat double precision,
  lng double precision,
  radius_km double precision default 10
)
returns table (
  id uuid,
  title text,
  sport text,
  spots_needed integer,
  starts_at timestamptz,
  created_by uuid,
  created_at timestamptz,
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
  live_started_at timestamptz,
  ended_at timestamptz,
  visibility text,
  ends_at timestamptz,
  duration_minutes integer,
  host_name text,
  host_avatar_url text,
  host_sportsmanship double precision
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
    g.duration_minutes,
    host.display_name                                              as host_name,
    host.avatar_url                                                as host_avatar_url,
    host.sportsmanship_avg                                         as host_sportsmanship
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
    -- Timed: expire at ends_at. Untimed: age out on the same 3-day map TTL.
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

comment on function public.get_games_nearby(double precision, double precision, double precision) is
  'Games near a point for a signed-in viewer, nearest first, gender- and TTL-filtered. '
  'Carries the host denormalised (name, avatar, sportsmanship) so a card can name '
  'the host without a second round-trip per pin.';

revoke execute on function public.get_games_nearby(double precision, double precision, double precision) from public, anon;
grant execute on function public.get_games_nearby(double precision, double precision, double precision) to authenticated;
grant execute on function public.get_games_nearby(double precision, double precision, double precision) to service_role;

-- ---------------------------------------------------------------------------
-- 2) The guest read — same shape, host withheld
-- ---------------------------------------------------------------------------

drop function if exists public.get_guest_games_nearby(double precision, double precision, double precision);

create function public.get_guest_games_nearby(
  lat double precision,
  lng double precision,
  radius_km double precision default 10
)
returns table (
  id uuid,
  title text,
  sport text,
  spots_needed integer,
  starts_at timestamptz,
  created_by uuid,
  created_at timestamptz,
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
  live_started_at timestamptz,
  ended_at timestamptz,
  visibility text,
  ends_at timestamptz,
  duration_minutes integer,
  host_name text,
  host_avatar_url text,
  host_sportsmanship double precision
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    g.id,
    g.title,
    g.sport,
    g.spots_needed,
    g.starts_at,
    null::uuid as created_by, -- the whole point: a guest never learns who hosts
    g.created_at,
    g.status,
    g.location_label,
    g.description,
    g.requirements,
    g.participant_count,
    g.substitute_count,
    g.spots_remaining,
    g.distance_km,
    g.lat,
    g.lng,
    g.live_started_at,
    g.ended_at,
    g.visibility,
    g.ends_at,
    g.duration_minutes,
    -- Same promise as created_by, kept in SQL rather than in JSX. The client
    -- renders no host row because there is no host name, not because it checked.
    null::text as host_name,
    null::text as host_avatar_url,
    null::double precision as host_sportsmanship
  from public.get_games_nearby(lat, lng, radius_km) g
  where coalesce(g.visibility, 'public') = 'public';
$function$;

revoke execute on function public.get_guest_games_nearby(double precision, double precision, double precision) from public;
grant execute on function public.get_guest_games_nearby(double precision, double precision, double precision) to anon;

-- ---------------------------------------------------------------------------
-- 3) The suggestion scorer already returns host_sportsmanship — give it the
--    other two, so the map nudge and the Explore shelf can name a host too.
-- ---------------------------------------------------------------------------

drop function if exists public.get_suggested_games(double precision, double precision, double precision, int);

create function public.get_suggested_games(
  p_lat       double precision,
  p_lng       double precision,
  p_radius_km double precision default 25,
  p_limit     int default 20
)
returns table (
  id                uuid,
  title             text,
  sport             text,
  spots_needed      int,
  starts_at         timestamptz,
  created_by        uuid,
  created_at        timestamptz,
  status            text,
  location_label    text,
  description       text,
  requirements      jsonb,
  participant_count int,
  substitute_count  int,
  spots_remaining   int,
  distance_km       double precision,
  lat               double precision,
  lng               double precision,
  live_started_at   timestamptz,
  ended_at          timestamptz,
  visibility        text,
  ends_at           timestamptz,
  duration_minutes  int,
  match_score       double precision,
  sport_match       boolean,
  host_sportsmanship double precision,
  host_name          text,
  host_avatar_url    text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_uid    uuid := auth.uid();
  v_origin geography := st_point(p_lng, p_lat)::geography;
  v_radius double precision := greatest(1.0, least(200.0, coalesce(p_radius_km, 25.0)));
  v_limit  int := greatest(1, least(100, coalesce(p_limit, 20)));
  v_gender text;
  v_primary   text[];
  v_secondary text[];
begin
  if v_uid is null then
    return;
  end if;

  select
    p.gender,
    coalesce(
      array(select distinct x from jsonb_array_elements_text(
        coalesce(nullif(p.athlete_profile->'primarySports', 'null'::jsonb), '[]'::jsonb)) x),
      array[]::text[]),
    coalesce(
      array(select distinct x from jsonb_array_elements_text(
        coalesce(nullif(p.athlete_profile->'secondarySports', 'null'::jsonb), '[]'::jsonb)) x),
      array[]::text[])
    into v_gender, v_primary, v_secondary
  from public.profiles p
  where p.id = v_uid;

  return query
  with candidates as (
    select
      g.*,
      coalesce(part.player_cnt, 0)::int as p_cnt,
      coalesce(part.sub_cnt, 0)::int    as s_cnt,
      (st_distance(g.location, v_origin) / 1000.0) as dist_km,
      host.sportsmanship_avg as host_trust,
      host.display_name      as host_nm,
      host.avatar_url        as host_av
    from public.games g
    left join lateral (
      select
        count(*) filter (where gp.role != 'substitute')::int as player_cnt,
        count(*) filter (where gp.role  = 'substitute')::int as sub_cnt
      from public.game_participants gp
      where gp.game_id = g.id
    ) part on true
    left join public.profiles host on host.id = g.created_by
    where st_dwithin(g.location, v_origin, v_radius * 1000.0)
      and g.status in ('open', 'full', 'live')
      and (
        g.status <> 'live'
        or (coalesce(g.live_started_at, g.updated_at, g.created_at) > now() - interval '24 hours')
      )
      and (
        (g.ends_at is not null and g.ends_at > now())
        or (g.ends_at is null and g.created_at > now() - interval '3 days')
      )
      and (
        g.live_started_at is null
        or g.live_started_at + make_interval(mins => coalesce(g.duration_minutes, 90)) > now()
      )
      and public.can_view_game_for_gender(v_gender, host.gender, g.requirements->>'matchType')
      and coalesce(g.created_by, '00000000-0000-0000-0000-000000000000'::uuid) <> v_uid
      and not exists (
        select 1 from public.game_participants gp
         where gp.game_id = g.id and gp.user_id = v_uid
      )
  ),
  scored as (
    select
      c.*,
      (lower(btrim(c.sport)) = any(select lower(btrim(x)) from unnest(v_primary) x))   as is_primary,
      (lower(btrim(c.sport)) = any(select lower(btrim(x)) from unnest(v_secondary) x)) as is_secondary,
      case
        when c.starts_at is null then null::double precision
        else extract(epoch from (c.starts_at - now())) / 3600.0
      end as hours_out
    from candidates c
  )
  select
    s.id, s.title, s.sport, s.spots_needed, s.starts_at, s.created_by, s.created_at,
    s.status, s.location_label, s.description, coalesce(s.requirements, '{}'::jsonb),
    s.p_cnt, s.s_cnt, greatest(s.spots_needed - s.p_cnt, 0)::int, s.dist_km,
    st_y(s.location::geometry), st_x(s.location::geometry),
    s.live_started_at, s.ended_at, s.visibility, s.ends_at, s.duration_minutes,
    (
        0.40 * (case when s.is_primary then 1.0 when s.is_secondary then 0.7 else 0.0 end)
      + 0.25 * (
          case
            when s.hours_out is null then 0.5
            when s.hours_out < 0 then 0.55
            when s.hours_out <= 1 then 0.8 + 0.2 * s.hours_out
            when s.hours_out <= 12 then greatest(0.15, 1.0 - (s.hours_out - 1) / 13.0)
            else greatest(0.05, 0.15 - (s.hours_out - 12) / 400.0)
          end
        )
      + 0.20 * greatest(0.0, 1.0 - (s.dist_km / nullif(v_radius, 0)))
      + 0.10 * (
          case
            when greatest(s.spots_needed - s.p_cnt, 0) = 0 then 0.15
            when s.spots_needed <= 0 then 0.5
            else 0.4 + 0.6 * (greatest(s.spots_needed - s.p_cnt, 0)::double precision / s.spots_needed)
          end
        )
      + 0.05 * ((coalesce(s.host_trust, 3.0) - 1.0) / 4.0)
    )::double precision as match_score,
    (s.is_primary or s.is_secondary) as sport_match,
    s.host_trust,
    s.host_nm,
    s.host_av
  from scored s
  order by match_score desc, s.dist_km asc
  limit v_limit;
end;
$function$;

comment on function public.get_suggested_games(double precision, double precision, double precision, int) is
  'Games near a point, ranked for the caller: sport match 40%, time-to-start 25%, '
  'distance 20%, spots left 10%, host reputation 5%. Carries the host denormalised. '
  'Returns nothing for a guest — suggestions are personal.';

revoke execute on function public.get_suggested_games(double precision, double precision, double precision, int) from public, anon;
grant execute on function public.get_suggested_games(double precision, double precision, double precision, int) to authenticated, service_role;

notify pgrst, 'reload schema';

-- Verification:
--   -- as a member: the host is named
--   select title, host_name, host_sportsmanship is not null as has_rating
--     from public.get_games_nearby(32.7357, -97.1081, 50) limit 5;
--   -- as anon: all three host columns null on every row
--   set role anon;
--   select count(*) filter (where host_name is not null
--                              or host_avatar_url is not null
--                              or host_sportsmanship is not null) as leaked
--     from public.get_guest_games_nearby(32.7357, -97.1081, 50);   -- expect 0
--   reset role;
--   -- and the row count is unchanged from before this migration.
