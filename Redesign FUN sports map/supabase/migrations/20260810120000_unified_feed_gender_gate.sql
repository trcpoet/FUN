-- =======================================================================
-- Unified feed: apply the gender gate to game rows
-- =======================================================================
-- `20260801130000_profile_gender_and_game_gating.sql` made "Same gender" a
-- server-enforced visibility rule and added `can_view_game_for_gender(...)` to
-- `get_games_nearby` (the map) and `get_live_nearby` (Discovery "Live").
-- `get_unified_feed` was missed: its definition still descended from
-- `20260505170000`, which predates that work, and it filtered game rows on
-- distance, status and `ends_at` only.
--
-- Consequence: a game the rule hides everywhere else was still listed in the
-- main feed carrying title, description, sport, exact lat/lng, created_at and
-- created_by — enough to identify and turn up to a single-gender game you are
-- not eligible for. Latent rather than active at the time of writing (no game
-- on prod currently passes the feed's own status/ends_at filters), but it
-- activates the moment someone hosts a live "Same gender" game.
--
-- The gate is reused verbatim rather than reimplemented, so game visibility
-- has exactly one definition. Its first clause also means a viewer with no
-- gender on file (guests included) now sees no games in the feed, matching the
-- map and Live — an intended consequence, confirmed before writing this.
--
-- The return type is unchanged, so this is a plain CREATE OR REPLACE: no DROP,
-- and the existing ACLs (PUBLIC already revoked by `20260809120000`) survive.
-- The SET clause is re-declared because CREATE OR REPLACE replaces it too.
--
-- Idempotent and safe to re-run.
-- After applying: NOTIFY pgrst, 'reload schema';
-- =======================================================================

set search_path = public;

create or replace function public.get_unified_feed(
  p_lat double precision,
  p_lng double precision,
  p_map_radius_km double precision default 120,
  p_limit integer default 80
) returns table (
  kind text,
  id text,
  created_at timestamptz,
  lat double precision,
  lng double precision,
  title text,
  body text,
  sport text,
  visibility text,
  comment_count integer,
  created_by uuid,
  like_count integer,
  liked_by_me boolean
)
language sql
stable
set search_path = public, extensions
as $$
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
      coalesce(nl.mine, false) as liked_by_me
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
      0::int as comment_count,
      g.created_by,
      0::int as like_count,
      false as liked_by_me
    from public.games g
    left join public.profiles host on host.id = g.created_by
    where public.haversine_km((select qlat from cfg), (select qlng from cfg), g.lat, g.lng) <= (select rkm from cfg)
      and coalesce(g.status::text, '') not in ('completed','cancelled')
      and (g.ends_at is null or g.ends_at > now())
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
      coalesce(slc.mine, false) as liked_by_me
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
$$;

revoke execute on function public.get_unified_feed(double precision, double precision, double precision, integer) from public;
grant execute on function public.get_unified_feed(double precision, double precision, double precision, integer) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
