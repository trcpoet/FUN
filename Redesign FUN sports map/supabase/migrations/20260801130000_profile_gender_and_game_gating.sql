-- Gender-aware game visibility.
--
-- Match type moves from ("Co-ed" | "Men's" | "Women's") to ("Co-ed" | "Same gender").
-- "Same gender" resolves against the HOST's profile gender at query time, so a
-- game's audience follows its creator and cannot be spoofed from the client.
--
-- This is a safety feature, not a preference: a women's-only game's coordinates
-- must never reach a non-matching client. Filtering was previously 100%
-- client-side, so the rows were shipped to every browser and merely hidden in
-- JS. Enforcement therefore lives here, in the read RPCs.
--
-- Consequence, intended: a caller with no gender on file — including every
-- signed-out guest — sees NO games at all.

-- 1) Profile gender ---------------------------------------------------------

alter table public.profiles
  add column if not exists gender text
  check (gender is null or gender in ('man', 'woman', 'nonbinary'));

-- The read RPCs join on this for every nearby query.
create index if not exists profiles_gender_idx on public.profiles (gender);

-- 2) Retire the named-gender match types ------------------------------------
-- Must run BEFORE the new client ships: parseRequirements() degrades unknown
-- matchType values to "Any", which means "visible to everyone" — so leaving
-- these as-is would publish the very games this feature protects.

update public.games
   set requirements = jsonb_set(coalesce(requirements, '{}'::jsonb), '{matchType}', '"Same gender"')
 where requirements->>'matchType' in ('Men''s', 'Women''s');

-- 3) Shared predicate --------------------------------------------------------

/**
 * True when `p_viewer` may see a game hosted by `p_host` with match type
 * `p_match_type`. Co-ed games are open to any caller who has a gender on file;
 * same-gender games require an exact match with the host.
 */
create or replace function public.can_view_game_for_gender(
  p_viewer_gender text,
  p_host_gender text,
  p_match_type text
)
returns boolean
language sql
immutable
set search_path to 'public'
as $function$
  select
    -- No gender on file (guests included) => no games.
    p_viewer_gender is not null
    and (
      coalesce(nullif(trim(p_match_type), ''), 'Co-ed') <> 'Same gender'
      or p_host_gender = p_viewer_gender
    );
$function$;

revoke execute on function public.can_view_game_for_gender(text, text, text) from public;
grant execute on function public.can_view_game_for_gender(text, text, text) to anon, authenticated;

-- 4) get_games_nearby --------------------------------------------------------
-- Return type changes (adds ends_at + duration_minutes), so this needs a drop.
-- Those two columns were never projected, which meant every client-side timer
-- silently fell back to the 90-minute default instead of the host's duration.

drop function if exists public.get_games_nearby(double precision, double precision, double precision);

create function public.get_games_nearby(
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
    -- A finished game is not a nearby game.
    and (g.ends_at is null or g.ends_at > now())
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

-- 5) get_live_nearby ---------------------------------------------------------
-- Same gender gate on the feed's game rows. (Notes are unaffected.)

create or replace function public.get_live_nearby(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision default 25,
  p_limit integer default 40
)
returns table(
  kind text,
  id text,
  created_at timestamp with time zone,
  lat double precision,
  lng double precision,
  title text,
  body text,
  sport text,
  visibility text,
  comment_count integer,
  created_by uuid,
  like_count integer
)
language sql
stable
set search_path to 'public', 'extensions'
as $function$
  with cfg as (
    select
      coalesce(p_lat, 0.0) as qlat,
      coalesce(p_lng, 0.0) as qlng,
      greatest(0.5, least(100.0, coalesce(p_radius_km, 25.0))) as rkm,
      greatest(1, least(200, coalesce(p_limit, 40))) as lim
  ),
  viewer as (
    select p.gender from public.profiles p where p.id = auth.uid()
  ),
  note_likes as (
    select l.note_id, count(*)::int as cnt from public.map_note_likes l group by l.note_id
  ),
  note_comments as (
    select c.note_id, count(*)::int as cnt from public.map_note_comments c group by c.note_id
  ),
  notes as (
    select
      'note'::text as kind,
      n.id::text as id,
      n.created_at,
      n.lat,
      n.lng,
      null::text as title,
      n.body,
      null::text as sport,
      n.visibility,
      coalesce(nc.cnt, 0) as comment_count,
      n.created_by,
      coalesce(nl.cnt, 0) as like_count
    from public.map_notes n
    left join note_likes nl on nl.note_id = n.id
    left join note_comments nc on nc.note_id = n.id
    -- Keep strict boundary behavior for Live: notes at exactly radius are excluded.
    where public.haversine_km((select qlat from cfg), (select qlng from cfg), n.lat, n.lng) < (select rkm from cfg)
  ),
  games as (
    select
      'game'::text as kind,
      g.id::text as id,
      g.created_at,
      g.lat,
      g.lng,
      g.title as title,
      g.description as body,
      g.sport,
      g.visibility::text as visibility,
      0::int as comment_count,
      g.created_by,
      0::int as like_count
    from public.games g
    left join public.profiles host on host.id = g.created_by
    where public.haversine_km((select qlat from cfg), (select qlng from cfg), g.lat, g.lng) <= (select rkm from cfg)
      and coalesce(g.status::text, '') not in ('completed','cancelled')
      -- Scheduled games expire at ends_at; unscheduled ones age out on the map TTL.
      and (
            (g.ends_at is not null and g.ends_at > now())
         or (g.ends_at is null and g.created_at > now() - interval '3 days')
      )
      -- A host-started game is over once its duration has run from the press.
      and (
            g.live_started_at is null
         or g.live_started_at + make_interval(mins => coalesce(g.duration_minutes, 90)) > now()
      )
      and public.can_view_game_for_gender(
        (select gender from viewer),
        host.gender,
        g.requirements->>'matchType'
      )
  )
  select * from (
    select * from notes
    union all
    select * from games
  ) u
  order by u.created_at desc
  limit (select lim from cfg);
$function$;
