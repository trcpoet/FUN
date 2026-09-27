-- "Is anyone playing my sport near me tonight?"
--
-- Nothing in the app answers that. `get_games_nearby` orders by distance,
-- `get_unified_feed` orders by created_at, and the client's `rankGameRows` is a
-- four-key sort. So the thing a person actually opens the app for — a game they
-- would go to — is something they have to find by reading every pin.
--
-- `get_similar_athletes` is the only weighted scorer in the schema, and this is
-- modelled on it: one function, scored once, used by both the map and the feed,
-- so those two surfaces cannot disagree about what is worth showing you.
--
-- The five terms, and why each is weighted as it is:
--
--   sport match   0.40  The whole point. Your primary sports score full, your
--                       secondary sports most of it, anything else nothing —
--                       but a game you do not play can still surface on the
--                       other terms, because a full basketball court two streets
--                       away on a Tuesday is worth knowing about.
--   time          0.25  A game starting in two hours beats one on Saturday.
--                       Peaks around an hour out: too soon to reach is no better
--                       than too far away to plan for.
--   distance      0.20  Linear decay to the radius. Nothing beyond it scores.
--   spots         0.10  A game needing players beats a full one. A full game is
--                       not excluded — you can still join the waitlist.
--   host trust    0.05  Deliberately small. Reputation should tip a tie, not
--                       bury a new host who has never been rated. An unrated
--                       host scores the same as a 3.5, not zero.
--
-- Also here: `get_games_at_venue`, the "played here" history a venue card needs.
-- Over time that is the honest per-sport confidence signal — "basketball, played
-- 14 times here this month" answers "can I actually play this sport at this
-- park" without anyone mapping every park's rules by hand.
--
-- Depends on: 20260922130000 (can_view_game_for_gender's current shape).

-- ---------------------------------------------------------------------------
-- 1) The scorer
-- ---------------------------------------------------------------------------

create or replace function public.get_suggested_games(
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
  -- The three things a "why am I seeing this?" line needs.
  match_score       double precision,
  sport_match       boolean,
  host_sportsmanship double precision
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
    return;  -- suggestions are personal; a guest gets the plain nearby list
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
      host.sportsmanship_avg as host_trust
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
      -- Identical liveness and TTL rules to get_games_nearby. A suggestion for a
      -- game the map will not draw is worse than no suggestion.
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
      -- Your own games are not suggestions. You know about them.
      and coalesce(g.created_by, '00000000-0000-0000-0000-000000000000'::uuid) <> v_uid
      -- Nor is one you already joined.
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
      -- Hours until it starts. An untimed game has no clock, so it sits at the
      -- middle of the curve rather than at either end.
      case
        when c.starts_at is null then null::double precision
        else extract(epoch from (c.starts_at - now())) / 3600.0
      end as hours_out
    from candidates c
  )
  select
    s.id,
    s.title,
    s.sport,
    s.spots_needed,
    s.starts_at,
    s.created_by,
    s.created_at,
    s.status,
    s.location_label,
    s.description,
    coalesce(s.requirements, '{}'::jsonb),
    s.p_cnt,
    s.s_cnt,
    greatest(s.spots_needed - s.p_cnt, 0)::int,
    s.dist_km,
    st_y(s.location::geometry),
    st_x(s.location::geometry),
    s.live_started_at,
    s.ended_at,
    s.visibility,
    s.ends_at,
    s.duration_minutes,
    (
        0.40 * (case when s.is_primary then 1.0 when s.is_secondary then 0.7 else 0.0 end)
      + 0.25 * (
          case
            -- Already under way: still relevant, but you have missed the start.
            when s.hours_out is null then 0.5
            when s.hours_out < 0 then 0.55
            -- Peaks at one hour out and decays either side. Twelve hours or more
            -- is a plan, not a suggestion.
            when s.hours_out <= 1 then 0.8 + 0.2 * s.hours_out
            when s.hours_out <= 12 then greatest(0.15, 1.0 - (s.hours_out - 1) / 13.0)
            else greatest(0.05, 0.15 - (s.hours_out - 12) / 400.0)
          end
        )
      + 0.20 * greatest(0.0, 1.0 - (s.dist_km / nullif(v_radius, 0)))
      + 0.10 * (
          case
            when greatest(s.spots_needed - s.p_cnt, 0) = 0 then 0.15  -- waitlist only
            when s.spots_needed <= 0 then 0.5
            else 0.4 + 0.6 * (greatest(s.spots_needed - s.p_cnt, 0)::double precision / s.spots_needed)
          end
        )
        -- An unrated host is not a bad host. Null lands at the middle of the
        -- 1-5 scale rather than at the bottom.
      + 0.05 * ((coalesce(s.host_trust, 3.0) - 1.0) / 4.0)
    )::double precision as match_score,
    (s.is_primary or s.is_secondary) as sport_match,
    s.host_trust
  from scored s
  order by match_score desc, s.dist_km asc
  limit v_limit;
end;
$function$;

comment on function public.get_suggested_games(double precision, double precision, double precision, int) is
  'Games near a point, ranked for the caller: sport match 40%, time-to-start 25%, '
  'distance 20%, spots left 10%, host reputation 5%. Excludes your own games and '
  'ones you already joined. Enforces the same gender, liveness and TTL rules as '
  'get_games_nearby, so a suggestion is always a game the map would draw. Returns '
  'nothing for a guest — suggestions are personal.';

revoke execute on function public.get_suggested_games(double precision, double precision, double precision, int) from public, anon;
grant execute on function public.get_suggested_games(double precision, double precision, double precision, int) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) What has actually been played here
-- ---------------------------------------------------------------------------
-- Venues come from OpenStreetMap, which records what a place is tagged as, not
-- what people do there. A park tagged `leisure=park` may have three basketball
-- hoops; a `pitch` may be locked every evening. The games hosted at those
-- coordinates are the only first-hand evidence either way.

create or replace function public.get_games_at_venue(
  p_lat               double precision,
  p_lng               double precision,
  p_radius_m          double precision default 150,
  p_include_completed boolean default true,
  p_limit             int default 30
)
returns table (
  id               uuid,
  title            text,
  sport            text,
  starts_at        timestamptz,
  ends_at          timestamptz,
  ended_at         timestamptz,
  status           text,
  spots_needed     int,
  participant_count int,
  distance_m       double precision,
  is_past          boolean
)
language sql
stable
security invoker
set search_path to 'public'
as $function$
  -- SECURITY INVOKER on purpose: the games read policy decides which of these
  -- rows the caller may see, exactly as it does everywhere else.
  select
    g.id,
    g.title,
    g.sport,
    g.starts_at,
    g.ends_at,
    g.ended_at,
    g.status,
    g.spots_needed,
    coalesce(part.cnt, 0)::int as participant_count,
    st_distance(g.location, st_point(p_lng, p_lat)::geography) as distance_m,
    (
      g.status in ('completed', 'cancelled')
      or g.ended_at is not null
      or (g.ends_at is not null and g.ends_at <= now())
    ) as is_past
  from public.games g
  left join lateral (
    select count(*)::int as cnt
      from public.game_participants gp
     where gp.game_id = g.id and gp.role != 'substitute'
  ) part on true
  where st_dwithin(
          g.location,
          st_point(p_lng, p_lat)::geography,
          greatest(10.0, least(2000.0, coalesce(p_radius_m, 150.0)))
        )
    and (
      coalesce(p_include_completed, true)
      or g.status not in ('completed', 'cancelled')
    )
  order by coalesce(g.starts_at, g.created_at) desc
  limit greatest(1, least(100, coalesce(p_limit, 30)));
$function$;

comment on function public.get_games_at_venue(double precision, double precision, double precision, boolean, int) is
  'Games hosted within a radius of a point, newest first, past ones flagged. The '
  'venue card''s "played here" history, and over time the per-sport confidence '
  'signal that OSM tags cannot give: what people actually play at this place.';

revoke execute on function public.get_games_at_venue(double precision, double precision, double precision, boolean, int) from public;
grant execute on function public.get_games_at_venue(double precision, double precision, double precision, boolean, int) to authenticated, service_role;

-- The guest version. Same history, public games only, and no host.
create or replace function public.get_guest_games_at_venue(
  p_lat      double precision,
  p_lng      double precision,
  p_radius_m double precision default 150,
  p_limit    int default 30
)
returns table (
  id               uuid,
  title            text,
  sport            text,
  starts_at        timestamptz,
  ends_at          timestamptz,
  ended_at         timestamptz,
  status           text,
  spots_needed     int,
  participant_count int,
  distance_m       double precision,
  is_past          boolean
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    g.id, g.title, g.sport, g.starts_at, g.ends_at, g.ended_at, g.status,
    g.spots_needed,
    coalesce(part.cnt, 0)::int,
    st_distance(g.location, st_point(p_lng, p_lat)::geography),
    (
      g.status in ('completed', 'cancelled')
      or g.ended_at is not null
      or (g.ends_at is not null and g.ends_at <= now())
    )
  from public.games g
  left join lateral (
    select count(*)::int as cnt
      from public.game_participants gp
     where gp.game_id = g.id and gp.role != 'substitute'
  ) part on true
  where st_dwithin(
          g.location,
          st_point(p_lng, p_lat)::geography,
          greatest(10.0, least(2000.0, coalesce(p_radius_m, 150.0)))
        )
    -- A definer function sees every row, so the guest rule is restated here:
    -- public games only, and Co-ed only, matching get_guest_games_nearby.
    and coalesce(g.visibility, 'public') = 'public'
    and public.can_view_game_for_gender(null, null, g.requirements->>'matchType')
  order by coalesce(g.starts_at, g.created_at) desc
  limit greatest(1, least(100, coalesce(p_limit, 30)));
$function$;

revoke execute on function public.get_guest_games_at_venue(double precision, double precision, double precision, int) from public;
grant execute on function public.get_guest_games_at_venue(double precision, double precision, double precision, int) to anon, authenticated;

notify pgrst, 'reload schema';

-- Verification:
--   -- as a member with basketball in primarySports, near Arlington:
--   select title, sport, sport_match, round(match_score::numeric, 3) as score,
--          round(distance_km::numeric, 1) as km, starts_at
--     from public.get_suggested_games(32.7357, -97.1081, 25, 20);
--   -- basketball games should outrank equidistant games in other sports, and a
--   -- game two hours out should outrank the same game three days out.
--   -- as anon: zero rows (suggestions are personal).
--
--   select sport, count(*) filter (where is_past) as played, count(*) as total
--     from public.get_games_at_venue(32.7357, -97.1081, 150, true, 100)
--    group by sport order by played desc;
