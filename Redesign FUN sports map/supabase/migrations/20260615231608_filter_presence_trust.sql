-- =======================================================================
-- Filter + Presence Trust
-- =======================================================================
-- Adds the Ghost / Close-friends (Squad) / Public PRESENCE system (who sees
-- YOU) and exposes game VISIBILITY to the map (which games you can see/join),
-- without disturbing the already-shipped client-side game FILTERS.
--
-- Audited against the LIVE (linked) schema on 2026-06-15:
--   * profile_locations(profile_id pk/fk->profiles.id, lat, lng,
--     location_geography geography, updated_at) is the REAL location source.
--     `profiles` has NO lat/lng, so presence lives on profile_locations.
--   * update_my_location(p_lat,p_lng) is the existing location writer (kept).
--   * get_profiles_nearby already enforces 45-min staleness + onboarding/
--     anonymous privacy; we AND a per-user visibility gate on top.
--   * get_games_nearby returns `requirements` but NOT `visibility`.
--   * user_follows(follower_id, followed_id) is the follow graph; visibility
--     "close_friends" uses either-direction follow (mirrors
--     is_eligible_to_join_game's friends rule).
--
-- Idempotent: guarded so re-running is safe.
-- After applying: NOTIFY pgrst, 'reload schema';
-- =======================================================================

set search_path = public;

-- -----------------------------------------------------------------------
-- 1. profile_locations: per-user presence visibility
-- -----------------------------------------------------------------------
-- ghost         = never shown to others (DEFAULT; privacy-first)
-- close_friends = shown only to either-direction follows ("Squad")
-- public        = shown to anyone in radius ("Public")
--
-- NOTE: existing rows take the 'ghost' default, so currently-visible users
-- become hidden until they pick Public/Squad. This is the intended
-- privacy-first behavior of the presence feature.
alter table public.profile_locations
  add column if not exists location_visibility text not null default 'ghost';

do $$
begin
  if not exists (
    select 1 from information_schema.check_constraints
    where constraint_schema = 'public'
      and constraint_name = 'profile_locations_visibility_valid'
  ) then
    alter table public.profile_locations
      add constraint profile_locations_visibility_valid
      check (location_visibility in ('ghost','close_friends','public'));
  end if;
end $$;

-- Supports get_profiles_nearby's visibility + freshness filter.
create index if not exists profile_locations_visibility_updated_idx
  on public.profile_locations (location_visibility, updated_at);

-- -----------------------------------------------------------------------
-- 2. Close the ghost-bypass hole in RLS
-- -----------------------------------------------------------------------
-- The prior "viewable by everyone (using true)" SELECT policy let any caller
-- read every row's lat/lng directly, bypassing get_profiles_nearby's privacy
-- filter -> ghost mode was defeatable. All real readers are SECURITY DEFINER
-- RPCs (get_profiles_nearby, search_profiles) that bypass RLS, and the client
-- never SELECTs this table directly, so restricting direct reads to the owner
-- is safe and makes presence actually private.
drop policy if exists "Profile locations viewable by everyone" on public.profile_locations;

drop policy if exists "Profile locations: read own only" on public.profile_locations;
create policy "Profile locations: read own only"
  on public.profile_locations for select
  to authenticated
  using (profile_id = (select auth.uid()));

-- (insert/update own-row policies are unchanged.)

-- -----------------------------------------------------------------------
-- 3. update_my_presence — location heartbeat + visibility mode
-- -----------------------------------------------------------------------
-- Mirrors update_my_location's upsert, additionally persisting the chosen
-- visibility. The location-only update_my_location heartbeat stays and
-- preserves the existing mode (on conflict it does not touch visibility).
create or replace function public.update_my_presence(
  p_lat double precision,
  p_lng double precision,
  p_mode text
) returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if p_mode not in ('ghost','close_friends','public') then
    raise exception 'invalid_visibility' using errcode = '22023';
  end if;

  insert into public.profiles (id, display_name)
  values (v_uid, 'Player')
  on conflict (id) do nothing;

  insert into public.profile_locations
    (profile_id, lat, lng, location_geography, location_visibility, updated_at)
  values
    (v_uid, p_lat, p_lng,
     st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
     p_mode, now())
  on conflict (profile_id) do update set
    lat = excluded.lat,
    lng = excluded.lng,
    location_geography = excluded.location_geography,
    location_visibility = excluded.location_visibility,
    updated_at = now();
end;
$function$;

grant execute on function public.update_my_presence(double precision, double precision, text) to authenticated;
-- Postgres grants EXECUTE to PUBLIC by default on new functions; lock to authenticated
-- (the body also rejects null auth.uid(), but this is defense-in-depth).
revoke execute on function public.update_my_presence(double precision, double precision, text) from public, anon;

-- -----------------------------------------------------------------------
-- 4. get_profiles_nearby — AND a per-user visibility gate (same return shape)
-- -----------------------------------------------------------------------
-- Reproduces the deployed body verbatim and adds ONE new AND-clause before
-- ORDER BY. Self is always shown; others must be public, or close_friends
-- with an either-direction follow. Ghost users are never returned to others.
create or replace function public.get_profiles_nearby(
  lat double precision,
  lng double precision,
  radius_km double precision default 5,
  limit_count integer default 50
)
 returns table(
   profile_id uuid, display_name text, avatar_url text, avatar_id text,
   sportsmanship double precision, status_body text,
   status_expires_at timestamp with time zone,
   lat double precision, lng double precision, distance_km double precision
 )
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  SELECT
    p.id as profile_id,
    p.display_name,
    p.avatar_url,
    p.avatar_id,
    p.sportsmanship_avg as sportsmanship,
    st.body as status_body,
    null::timestamptz as status_expires_at,
    pl.lat,
    pl.lng,
    (st_distance(pl.location_geography, st_point(lng, lat)::geography) / 1000.0) as distance_km
  FROM public.profile_locations pl
  JOIN public.profiles p ON p.id = pl.profile_id
  JOIN auth.users u ON u.id = p.id
  LEFT JOIN LATERAL (
    SELECT s.body
    FROM public.status_updates s
    WHERE s.user_id = p.id
    ORDER BY s.created_at DESC
    LIMIT 1
  ) st ON true
  WHERE st_dwithin(
      pl.location_geography,
      st_point(lng, lat)::geography,
      radius_km * 1000.0
    )
    -- STALE CHECK: others must be active within 45m; self always shown if in radius.
    AND (
      p.id = auth.uid()
      OR
      pl.updated_at > now() - interval '45 minutes'
    )
    -- PRIVACY RULES (onboarding / anonymous)
    AND (
      p.id = auth.uid()
      OR
      (
        NOT coalesce(u.is_anonymous, false)
        AND coalesce(p.onboarding_completed, false) = true
        AND EXISTS (
          SELECT 1
          FROM auth.users caller_u
          JOIN public.profiles caller_p ON caller_p.id = caller_u.id
          WHERE caller_u.id = auth.uid()
            AND NOT coalesce(caller_u.is_anonymous, false)
            AND coalesce(caller_p.onboarding_completed, false) = true
        )
      )
    )
    -- PRESENCE VISIBILITY (Ghost / Close-friends / Public)
    AND (
      p.id = auth.uid()
      OR pl.location_visibility = 'public'
      OR (
        pl.location_visibility = 'close_friends'
        AND EXISTS (
          SELECT 1 FROM public.user_follows uf
          WHERE (uf.follower_id = auth.uid() AND uf.followed_id = p.id)
             OR (uf.follower_id = p.id AND uf.followed_id = auth.uid())
        )
      )
    )
  ORDER BY pl.location_geography <-> st_point(lng, lat)::geography
  LIMIT limit_count;
$function$;

grant execute on function public.get_profiles_nearby(double precision, double precision, double precision, integer) to anon, authenticated;

-- -----------------------------------------------------------------------
-- 5. get_games_nearby — expose `visibility` (return-type change => drop+recreate)
-- -----------------------------------------------------------------------
-- CREATE OR REPLACE cannot change a function's return type, so we drop and
-- recreate (no other DB object depends on this leaf RPC) and re-grant. Body is
-- reproduced verbatim with `g.visibility` appended to SELECT + RETURNS TABLE.
drop function if exists public.get_games_nearby(double precision, double precision, double precision);

create or replace function public.get_games_nearby(
  lat double precision,
  lng double precision,
  radius_km double precision default 10
)
 returns table(
   id uuid, title text, sport text, spots_needed integer,
   starts_at timestamp with time zone, created_by uuid,
   created_at timestamp with time zone, status text, location_label text,
   description text, requirements jsonb, participant_count integer,
   substitute_count integer, spots_remaining integer, distance_km double precision,
   lat double precision, lng double precision,
   live_started_at timestamp with time zone, ended_at timestamp with time zone,
   visibility text
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
    g.created_by,
    g.created_at,
    g.status,
    g.location_label,
    g.description,
    coalesce(g.requirements, '{}'::jsonb)                         as requirements,
    coalesce(part.player_cnt, 0)::int                             as participant_count,
    coalesce(part.sub_cnt, 0)::int                                as substitute_count,
    greatest(g.spots_needed - coalesce(part.player_cnt, 0), 0)::int as spots_remaining,
    (st_distance(g.location, st_point(lng, lat)::geography) / 1000.0) as distance_km,
    st_y(g.location::geometry)                                   as lat,
    st_x(g.location::geometry)                                   as lng,
    g.live_started_at,
    g.ended_at,
    g.visibility
  from public.games g
  left join lateral (
    select
      count(*) filter (where gp.role != 'substitute')::int as player_cnt,
      count(*) filter (where gp.role  = 'substitute')::int as sub_cnt
    from public.game_participants gp
    where gp.game_id = g.id
  ) part on true
  where st_dwithin(g.location, st_point(lng, lat)::geography, radius_km * 1000.0)
    and g.status in ('open', 'full', 'live')
    and (
      g.status <> 'live'
      or (coalesce(g.live_started_at, g.updated_at, g.created_at) > now() - interval '24 hours')
    )
  order by distance_km asc;
$function$;

grant execute on function public.get_games_nearby(double precision, double precision, double precision) to anon, authenticated;

-- -----------------------------------------------------------------------
-- 6. PostgREST schema cache reload
-- -----------------------------------------------------------------------
notify pgrst, 'reload schema';
