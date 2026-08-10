-- =======================================================================
-- Map-note likes: give them a read path
-- =======================================================================
-- `map_note_likes` and `toggleMapNoteLike()` have shipped since
-- `20260501160000_live_feed_social_notifications.sql`, but nothing ever
-- returned a *viewer's* like state. The consequences on the client:
--
--   * `get_notes_nearby` returned neither `like_count` nor `liked_by_me`, so
--     the map dialog could not show a heart at all.
--   * `get_live_nearby` / `get_unified_feed` returned `like_count` but no
--     `liked_by_me`, so the feed card hardcoded `liked = false` on mount —
--     tapping a note you had already liked sent a *delete* and decremented a
--     count that was never right.
--   * Deep-linked notes were read straight off the table, so they had no
--     counts at all.
--
-- This migration closes all four holes:
--   1. get_notes_nearby  + like_count, + liked_by_me
--   2. get_note_by_id    new — replaces the direct-table read for deep links
--   3. get_live_nearby   + liked_by_me
--   4. get_unified_feed  + liked_by_me  (notes *and* statuses; games have no
--                                        like feature, so they report false)
--
-- Adding a column to a set-returning function requires DROP + CREATE, so each
-- body below is the currently-deployed definition with only the like columns
-- added. Two consequences worth naming:
--   * `set search_path` does not survive a DROP, so every function re-declares
--     the `public, extensions` value pinned in `20260617070000`.
--   * A fresh CREATE grants EXECUTE to PUBLIC. We revoke that and grant the
--     three roles explicitly, matching the hardening already applied to
--     `get_games_nearby` and the venue RPCs.
--
-- Idempotent and safe to re-run.
-- After applying: NOTIFY pgrst, 'reload schema';
-- =======================================================================

set search_path = public;

-- Both like lookups below are covered by existing indexes: the (note_id,
-- user_id) primary key answers `liked_by_me`, and `map_note_likes_note_idx`
-- answers the count. No new index needed.

-- -----------------------------------------------------------------------
-- 1) get_notes_nearby — the map surface
-- -----------------------------------------------------------------------
drop function if exists public.get_notes_nearby(double precision, double precision, double precision, integer);

create function public.get_notes_nearby(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision default 10,
  p_limit integer default 50
) returns table (
  id uuid,
  created_at timestamptz,
  created_by uuid,
  lat double precision,
  lng double precision,
  body text,
  visibility text,
  place_name text,
  distance_km double precision,
  comment_count integer,
  like_count integer,
  liked_by_me boolean
)
language sql
stable
set search_path = public, extensions
as $$
  with bounds as (
    select
      greatest(0.5, least(100.0, coalesce(p_radius_km, 10.0))) as rkm,
      coalesce(p_lat, 0.0) as qlat,
      coalesce(p_lng, 0.0) as qlng
  ),
  box as (
    select
      rkm,
      qlat,
      qlng,
      (rkm / 111.0) as dlat,
      (rkm / (111.0 * greatest(0.2, cos(radians(qlat))))) as dlng
    from bounds
  ),
  comments as (
    select note_id, count(*)::int as cnt
      from public.map_note_comments
     group by note_id
  ),
  -- One pass for both the public count and the viewer's own state. `bool_or`
  -- is null for an anonymous viewer (uid is null, so every comparison is
  -- null), which coalesces to false below.
  likes as (
    select
      note_id,
      count(*)::int as cnt,
      bool_or(user_id = (select auth.uid())) as mine
      from public.map_note_likes
     group by note_id
  )
  select
    n.id,
    n.created_at,
    n.created_by,
    n.lat,
    n.lng,
    n.body,
    n.visibility,
    n.place_name,
    public.haversine_km((select qlat from box), (select qlng from box), n.lat, n.lng) as distance_km,
    coalesce(c.cnt, 0) as comment_count,
    coalesce(l.cnt, 0) as like_count,
    coalesce(l.mine, false) as liked_by_me
  from public.map_notes n
  left join comments c on c.note_id = n.id
  left join likes l on l.note_id = n.id
  where
    n.lat between (select qlat - dlat from box) and (select qlat + dlat from box)
    and n.lng between (select qlng - dlng from box) and (select qlng + dlng from box)
    and public.haversine_km((select qlat from box), (select qlng from box), n.lat, n.lng) <= (select rkm from box)
  order by n.created_at desc
  limit greatest(1, least(200, coalesce(p_limit, 50)));
$$;

revoke execute on function public.get_notes_nearby(double precision, double precision, double precision, integer) from public;
grant execute on function public.get_notes_nearby(double precision, double precision, double precision, integer) to anon, authenticated, service_role;

-- -----------------------------------------------------------------------
-- 2) get_note_by_id — deep links / messenger header
-- -----------------------------------------------------------------------
-- Replaces a direct `select ... from map_notes where id = ?`, which returned
-- no comment_count, no like state and no distance. SECURITY INVOKER, so the
-- `map_notes: read visible` policy still decides whether the row comes back
-- at all — a note you may not see returns zero rows, exactly as before.
--
-- Viewer coordinates are optional: pass them to get `distance_km`, omit them
-- (or pass null) when the caller has no fix yet and the column reads null.
create or replace function public.get_note_by_id(
  p_note_id uuid,
  p_lat double precision default null,
  p_lng double precision default null
) returns table (
  id uuid,
  created_at timestamptz,
  created_by uuid,
  lat double precision,
  lng double precision,
  body text,
  visibility text,
  place_name text,
  distance_km double precision,
  comment_count integer,
  like_count integer,
  liked_by_me boolean
)
language sql
stable
set search_path = public, extensions
as $$
  select
    n.id,
    n.created_at,
    n.created_by,
    n.lat,
    n.lng,
    n.body,
    n.visibility,
    n.place_name,
    case
      when p_lat is null or p_lng is null then null::double precision
      else public.haversine_km(p_lat, p_lng, n.lat, n.lng)
    end as distance_km,
    (select count(*)::int from public.map_note_comments c where c.note_id = n.id) as comment_count,
    (select count(*)::int from public.map_note_likes l where l.note_id = n.id) as like_count,
    exists (
      select 1
        from public.map_note_likes ml
       where ml.note_id = n.id
         and ml.user_id = (select auth.uid())
    ) as liked_by_me
  from public.map_notes n
  where n.id = p_note_id;
$$;

revoke execute on function public.get_note_by_id(uuid, double precision, double precision) from public;
grant execute on function public.get_note_by_id(uuid, double precision, double precision) to anon, authenticated, service_role;

-- -----------------------------------------------------------------------
-- 3) get_live_nearby — Discovery "Live"
-- -----------------------------------------------------------------------
-- Body is the deployed `20260801130000` version (gender-gated games) with
-- `liked_by_me` appended to every branch of the union.
drop function if exists public.get_live_nearby(double precision, double precision, double precision, integer);

create function public.get_live_nearby(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision default 25,
  p_limit integer default 40
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
      greatest(0.5, least(100.0, coalesce(p_radius_km, 25.0))) as rkm,
      greatest(1, least(200, coalesce(p_limit, 40))) as lim
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
      0::int as like_count,
      -- Games have no like feature; false is the honest answer, not a placeholder.
      false as liked_by_me
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
$$;

revoke execute on function public.get_live_nearby(double precision, double precision, double precision, integer) from public;
grant execute on function public.get_live_nearby(double precision, double precision, double precision, integer) to anon, authenticated, service_role;

-- -----------------------------------------------------------------------
-- 4) get_unified_feed — the main feed
-- -----------------------------------------------------------------------
-- Body is the deployed `20260505170000` version with `liked_by_me` appended.
-- Statuses get a real value from `status_likes` (the status card has the same
-- hardcoded-false bug as the note card); games report false.
drop function if exists public.get_unified_feed(double precision, double precision, double precision, integer);

create function public.get_unified_feed(
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
    where public.haversine_km((select qlat from cfg), (select qlng from cfg), g.lat, g.lng) <= (select rkm from cfg)
      and coalesce(g.status::text, '') not in ('completed','cancelled')
      and (g.ends_at is null or g.ends_at > now())
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
