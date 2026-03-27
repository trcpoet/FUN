-- Migration: Enforce Guest & Profile Restrictions on Map
-- Re-applies auth restrictions to get_profiles_nearby and adds them to get_games_nearby

-- ----- 1) get_games_nearby: enforce caller is authenticated non-guest and complete profile -----
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
    -- PRIVACY: Caller must not be anonymous and must have completed onboarding
    and exists (
      select 1
      from auth.users u
      join public.profiles p on p.id = u.id
      where u.id = auth.uid()
        and not coalesce(u.is_anonymous, false)
        and coalesce(p.onboarding_completed, false) = true
    )
  order by g.location <-> st_point(lng, lat)::geography
  limit 50;
$$;

grant execute on function public.get_games_nearby(double precision, double precision, double precision) to authenticated;
grant execute on function public.get_games_nearby(double precision, double precision, double precision) to anon;

-- ----- 2) get_profiles_nearby: enforce target and caller restrictions -----
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
    null::timestamptz as status_expires_at,
    pl.lat,
    pl.lng,
    (st_distance(st_setsrid(st_makePoint(pl.lng, pl.lat), 4326)::geography, st_setsrid(st_makePoint(lng, lat), 4326)::geography) / 1000.0) as distance_km
  from public.profile_locations pl
  join public.profiles p on p.id = pl.profile_id
  -- PRIVACY: Ensure the target user we are querying is an actual verified auth user (not anon)
  join auth.users u on u.id = p.id
  left join lateral (
    select coalesce(avg(e.rating)::double precision, null) as sportsmanship_avg
    from public.athlete_endorsements e
    where e.athlete_id = p.id
  ) rep on true
  left join lateral (
    select s.body
    from public.status_updates s
    where s.user_id = p.id
    limit 1
  ) st on true
  where st_dwithin(
      st_setsrid(st_makePoint(pl.lng, pl.lat), 4326)::geography,
      st_setsrid(st_makePoint(lng, lat), 4326)::geography,
      radius_km * 1000.0
    )
    and pl.updated_at > now() - interval '45 minutes'
    -- PRIVACY: Target must not be anonymous and must have completed onboarding
    and not coalesce(u.is_anonymous, false)
    and coalesce(p.onboarding_completed, false) = true
    -- PRIVACY: Caller must not be anonymous and must be onboarded to see others
    and exists (
      select 1
      from auth.users caller_u
      join public.profiles caller_p on caller_p.id = caller_u.id
      where caller_u.id = auth.uid()
        and not coalesce(caller_u.is_anonymous, false)
        and coalesce(caller_p.onboarding_completed, false) = true
    )
  order by pl.updated_at desc
  limit limit_count;
$$;

grant execute on function public.get_profiles_nearby(double precision, double precision, double precision, int) to authenticated;
grant execute on function public.get_profiles_nearby(double precision, double precision, double precision, int) to anon;

notify pgrst, 'reload schema';
