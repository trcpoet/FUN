-- Migration: live game start/end + TTL + inactive location filtering
--
-- Adds:
-- - games: status includes 'live', plus timestamps
-- - RPCs: start_game, end_game
-- - get_games_nearby: hides live games older than 24h and excludes completed/cancelled
-- - get_profiles_nearby: hides inactive players (stale profile_locations)

-- ----- 1) Extend games status + timestamps -----
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'games' and column_name = 'live_started_at'
  ) then
    alter table public.games add column live_started_at timestamptz;
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'games' and column_name = 'ended_at'
  ) then
    alter table public.games add column ended_at timestamptz;
  end if;
end $$;

-- Relax + re-apply status check to include 'live'
do $$ begin
  begin
    alter table public.games drop constraint if exists games_status_check;
  exception when undefined_object then
    -- ignore
  end;
end $$;

alter table public.games
  add constraint games_status_check
  check (status in ('open', 'full', 'live', 'completed', 'cancelled'));

-- ----- 2) Host RPCs: start_game / end_game -----
drop function if exists public.start_game(uuid);
create or replace function public.start_game(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_host uuid;
  v_status text;
begin
  select created_by, status into v_host, v_status
  from public.games
  where id = p_game_id;

  if v_host is null then
    raise exception 'Game not found';
  end if;
  if auth.uid() is null or auth.uid() <> v_host then
    raise exception 'Only the host can start the game';
  end if;
  if v_status in ('completed', 'cancelled') then
    raise exception 'Game already ended';
  end if;

  update public.games
    set status = 'live',
        live_started_at = coalesce(live_started_at, now()),
        updated_at = now()
  where id = p_game_id;
end;
$$;

grant execute on function public.start_game(uuid) to authenticated;

drop function if exists public.end_game(uuid);
create or replace function public.end_game(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_host uuid;
  v_status text;
  v_starts_at timestamptz;
begin
  select created_by, status, starts_at into v_host, v_status, v_starts_at
  from public.games
  where id = p_game_id;

  if v_host is null then
    raise exception 'Game not found';
  end if;
  if auth.uid() is null or auth.uid() <> v_host then
    raise exception 'Only the host can end the game';
  end if;
  if v_status in ('completed', 'cancelled') then
    return;
  end if;

  -- End Game before it begins => treat as delete game.
  if v_status <> 'live' and (v_starts_at is null or v_starts_at > now()) then
    delete from public.games where id = p_game_id and created_by = auth.uid();
    return;
  end if;

  update public.games
    set status = 'completed',
        ended_at = now(),
        updated_at = now()
  where id = p_game_id;
end;
$$;

grant execute on function public.end_game(uuid) to authenticated;

-- ----- 3) get_games_nearby: hide stale live games (>24h) -----
-- PG cannot CREATE OR REPLACE when the returned columns change; DROP must match the
-- exact signature (and there may be multiple overloads). Drop every public variant.
do $$
declare
  fn regprocedure;
begin
  for fn in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'get_games_nearby'
  loop
    execute 'drop function if exists ' || fn::text || ' cascade';
  end loop;
end $$;

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
  lng double precision,
  live_started_at timestamptz,
  ended_at timestamptz
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
    st_x(g.location::geometry) as lng,
    g.live_started_at,
    g.ended_at
  from public.games g
  left join lateral (
    select count(*)::int as cnt
    from public.game_participants gp
    where gp.game_id = g.id
  ) part on true
  where st_dwithin(g.location, st_point(lng, lat)::geography, radius_km * 1000.0)
    and g.status in ('open', 'full', 'live')
    and (
      g.status <> 'live'
      or (coalesce(g.live_started_at, g.updated_at, g.created_at) > now() - interval '24 hours')
    )
  order by g.location <-> st_point(lng, lat)::geography
  limit 50;
$$;

grant execute on function public.get_games_nearby(double precision, double precision, double precision)
  to authenticated;
grant execute on function public.get_games_nearby(double precision, double precision, double precision)
  to anon;

-- ----- 4) get_profiles_nearby: hide inactive locations -----
do $$
declare
  fn regprocedure;
begin
  for fn in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'get_profiles_nearby'
  loop
    execute 'drop function if exists ' || fn::text || ' cascade';
  end loop;
end $$;

create or replace function public.get_profiles_nearby(
  lat double precision,
  lng double precision,
  radius_km double precision default 5,
  limit_count int default 50
)
returns table (
  profile_id uuid,
  display_name text,
  avatar_url text,
  avatar_id text,
  sportsmanship double precision,
  status_body text,
  status_expires_at timestamptz,
  lat double precision,
  lng double precision,
  distance_km double precision
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id as profile_id,
    p.display_name,
    p.avatar_url,
    p.avatar_id,
    rep.sportsmanship_avg as sportsmanship,
    st.body as status_body,
    st.expires_at as status_expires_at,
    pl.lat,
    pl.lng,
    (st_distance(st_setsrid(st_makePoint(pl.lng, pl.lat), 4326)::geography, st_setsrid(st_makePoint(lng, lat), 4326)::geography) / 1000.0) as distance_km
  from public.profile_locations pl
  join public.profiles p on p.id = pl.profile_id
  left join lateral (
    select coalesce(avg(e.rating)::double precision, null) as sportsmanship_avg
    from public.athlete_endorsements e
    where e.athlete_id = p.id
  ) rep on true
  left join lateral (
    select s.body, s.expires_at
    from public.status_updates s
    where s.user_id = p.id
      and s.expires_at > now()
    limit 1
  ) st on true
  where st_dwithin(
      st_setsrid(st_makePoint(pl.lng, pl.lat), 4326)::geography,
      st_setsrid(st_makePoint(lng, lat), 4326)::geography,
      radius_km * 1000.0
    )
    and pl.updated_at > now() - interval '45 minutes'
  order by pl.updated_at desc
  limit limit_count;
$$;

grant execute on function public.get_profiles_nearby(double precision, double precision, double precision, int)
  to authenticated;
grant execute on function public.get_profiles_nearby(double precision, double precision, double precision, int)
  to anon;

notify pgrst, 'reload schema';

