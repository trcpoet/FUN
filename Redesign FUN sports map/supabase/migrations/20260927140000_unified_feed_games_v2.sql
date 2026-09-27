-- The feed learns enough about a game to let you join it.
--
-- `get_unified_feed` has always returned games, and the client has always thrown
-- them away — `Feed.tsx` filtered `kind === "game"` out of both streams — because
-- the row it got back could not be rendered as anything you could act on. The
-- games CTE hard-coded `comment_count = 0, like_count = 0, liked_by_me = false`
-- and returned no start time, no status, no spots and no venue, so there was
-- nothing to put on a card beyond a title and a description.
--
-- Two changes:
--
--  1. Real social counts, now that `game_social` has the tables to count.
--
--  2. A `game` jsonb column carrying what a joinable card renders: when it
--     starts and ends, its status, how full it is, where it is, and who hosts it.
--     One column rather than nine, because the union has three arms and notes and
--     statuses would have to carry eight nulls each — and because it keeps
--     "these fields are about a game" legible at a glance. Notes and statuses
--     pass null.
--
-- Also fixes the predicate this function never had: an untimed game (no
-- `starts_at`, so no `ends_at`) was visible in the feed forever. The map has
-- retired those after three days since 20260808010000; the feed now agrees.
--
-- Return type changes, so drop + create. Everything not mentioned above is
-- byte-for-byte the body from 20260810120000_unified_feed_gender_gate.
--
-- Depends on: 20260927130000_game_social.

drop function if exists public.get_unified_feed(double precision, double precision, double precision, integer);

create function public.get_unified_feed(
  p_lat double precision,
  p_lng double precision,
  p_map_radius_km double precision default 120,
  p_limit integer default 80
)
returns table (
  kind          text,
  id            text,
  created_at    timestamptz,
  lat           double precision,
  lng           double precision,
  title         text,
  body          text,
  sport         text,
  visibility    text,
  comment_count integer,
  created_by    uuid,
  like_count    integer,
  liked_by_me   boolean,
  game          jsonb
)
language sql
stable
set search_path to 'public', 'extensions'
as $function$
  with cfg as (
    select
      coalesce(p_lat, 0.0) as qlat,
      coalesce(p_lng, 0.0) as qlng,
      greatest(1.0, least(300.0, coalesce(p_map_radius_km, 120.0))) as rkm,
      greatest(1, least(200, coalesce(p_limit, 80))) as lim
  ),
  viewer as (
    select p.gender from public.profiles p where p.id = auth.uid()
  ),
  note_likes as (
    select
      l.note_id,
      count(*)::int as cnt,
      bool_or(l.user_id = (select auth.uid())) as mine
      from public.map_note_likes l
     group by l.note_id
  ),
  note_comments as (
    select c.note_id, count(*)::int as cnt from public.map_note_comments c group by c.note_id
  ),
  status_likes_c as (
    select
      l.status_id,
      count(*)::int as cnt,
      bool_or(l.user_id = (select auth.uid())) as mine
      from public.status_likes l
     group by l.status_id
  ),
  status_comments_c as (
    select c.status_id, count(*)::int as cnt from public.status_comments c group by c.status_id
  ),
  game_likes_c as (
    select
      l.game_id,
      count(*)::int as cnt,
      bool_or(l.user_id = (select auth.uid())) as mine
      from public.game_likes l
     group by l.game_id
  ),
  game_comments_c as (
    select c.game_id, count(*)::int as cnt from public.game_comments c group by c.game_id
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
      coalesce(nl.cnt, 0) as like_count,
      coalesce(nl.mine, false) as liked_by_me,
      null::jsonb as game
    from public.map_notes n
    left join note_likes nl on nl.note_id = n.id
    left join note_comments nc on nc.note_id = n.id
    where public.haversine_km((select qlat from cfg), (select qlng from cfg), n.lat, n.lng) <= (select rkm from cfg)
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
      coalesce(gc.cnt, 0) as comment_count,
      g.created_by,
      coalesce(gl.cnt, 0) as like_count,
      coalesce(gl.mine, false) as liked_by_me,
      jsonb_build_object(
        'starts_at',         g.starts_at,
        'ends_at',           g.ends_at,
        'ended_at',          g.ended_at,
        'live_started_at',   g.live_started_at,
        'duration_minutes',  g.duration_minutes,
        'status',            g.status,
        'location_label',    g.location_label,
        'spots_needed',      g.spots_needed,
        'participant_count', coalesce(part.player_cnt, 0),
        'substitute_count',  coalesce(part.sub_cnt, 0),
        'spots_remaining',   greatest(g.spots_needed - coalesce(part.player_cnt, 0), 0),
        'distance_km',       public.haversine_km((select qlat from cfg), (select qlng from cfg), g.lat, g.lng),
        'requirements',      coalesce(g.requirements, '{}'::jsonb),
        -- Whether the viewer is already in it, so the card can say "You're in"
        -- without a second round-trip per game.
        'joined_by_me',      exists (
                               select 1 from public.game_participants gp
                                where gp.game_id = g.id and gp.user_id = (select auth.uid())
                             )
      ) as game
    from public.games g
    left join lateral (
      select
        count(*) filter (where gp.role != 'substitute')::int as player_cnt,
        count(*) filter (where gp.role  = 'substitute')::int as sub_cnt
      from public.game_participants gp
      where gp.game_id = g.id
    ) part on true
    left join public.profiles host on host.id = g.created_by
    left join game_likes_c gl on gl.game_id = g.id
    left join game_comments_c gc on gc.game_id = g.id
    where public.haversine_km((select qlat from cfg), (select qlng from cfg), g.lat, g.lng) <= (select rkm from cfg)
      and coalesce(g.status::text, '') not in ('completed','cancelled')
      and (g.ends_at is null or g.ends_at > now())
      -- Untimed games age out on the same 3-day TTL the map uses. Without this
      -- a pickup game with no start time stayed in the feed indefinitely.
      and (g.ends_at is not null or g.created_at > now() - interval '3 days')
      -- Same rule the map and Live enforce. A null viewer gender (guest, or a
      -- profile that never set one) yields false, so the feed shows no games.
      and public.can_view_game_for_gender(
        (select gender from viewer),
        host.gender,
        g.requirements->>'matchType'
      )
  ),
  statuses as (
    select
      'status'::text as kind,
      s.id::text as id,
      s.created_at,
      null::double precision as lat,
      null::double precision as lng,
      null::text as title,
      s.body,
      null::text as sport,
      'public'::text as visibility,
      coalesce(sc.cnt, 0) as comment_count,
      s.user_id as created_by,
      coalesce(slc.cnt, 0) as like_count,
      coalesce(slc.mine, false) as liked_by_me,
      null::jsonb as game
    from public.get_recent_statuses(80) s
    left join status_likes_c slc on slc.status_id = s.id
    left join status_comments_c sc on sc.status_id = s.id
  )
  select *
    from (
      select * from notes
      union all
      select * from games
      union all
      select * from statuses
    ) u
   order by u.created_at desc
   limit (select lim from cfg);
$function$;

comment on function public.get_unified_feed(double precision, double precision, double precision, integer) is
  'One feed of notes, games and statuses near a point, newest first. The `game` '
  'jsonb column carries everything a joinable game card renders (schedule, status, '
  'spots, venue, whether you are already in); notes and statuses leave it null. '
  'Games respect the same gender and TTL rules as the map.';

revoke execute on function public.get_unified_feed(double precision, double precision, double precision, integer) from public, anon;
grant execute on function public.get_unified_feed(double precision, double precision, double precision, integer) to authenticated, service_role;

notify pgrst, 'reload schema';

-- Verification:
--   select kind, count(*) from public.get_unified_feed(32.7357, -97.1081, 120, 80) group by kind;
--   -- games now come back with a populated `game` object and real counts:
--   select id, title, comment_count, like_count, liked_by_me, game
--     from public.get_unified_feed(32.7357, -97.1081, 120, 80) where kind = 'game' limit 3;
--   -- and an untimed game older than three days is gone:
--   select count(*) from public.get_unified_feed(32.7357, -97.1081, 300, 200)
--    where kind = 'game' and (game->>'starts_at') is null;
