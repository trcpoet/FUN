-- Guest browsing, part 1 of 2: the read paths a signed-out visitor is allowed.
--
-- Today a guest sees an empty map. `can_view_game_for_gender` opens with
-- "viewer gender is not null", so every caller without a profile — which is
-- every guest — gets zero games from all three read RPCs (20260801130000:51-52,
-- an intended consequence at the time). The map's answer to a first-time
-- visitor is therefore a card explaining that there is nothing to see.
--
-- The product decision this implements: guests browse. They see WHAT is
-- happening, WHERE, WHEN and HOW MANY are in — never WHO. Every action (join,
-- create, comment, chat, feed, profile) asks them to sign up at the moment they
-- reach for it.
--
-- Two rules make that safe, and both live here rather than in the client:
--
--   * Same-gender games stay invisible to anyone without a matching gender,
--     guests included. The predicate below now says "Co-ed is open to everyone;
--     Same gender needs an exact match" instead of "no gender, no games", which
--     is the rule everything else already assumed.
--   * Guests read through `get_guest_*` wrappers that project no identity at
--     all — no created_by, no user_id — and are granted to `anon` only. They are
--     thin selects over the functions signed-in users already use, so the
--     filters (TTL, liveness, distance, gender) keep exactly one definition and
--     cannot drift apart.
--
-- Part 2 (`..._guest_browse_lock_anon_tables.sql`) closes the direct table reads
-- these wrappers replace. It ships after the client that calls them.

-- 1) One gender rule, for every viewer --------------------------------------
-- Unchanged for a viewer who has a gender on file. The only difference is that
-- "no gender" now means "Co-ed only" rather than "nothing at all", which is what
-- lets a guest — and a member who has not finished onboarding — see the games
-- that are open to everybody anyway.

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
    coalesce(nullif(trim(p_match_type), ''), 'Co-ed') <> 'Same gender'
    or (p_viewer_gender is not null and p_host_gender = p_viewer_gender);
$function$;

-- 2) Games for guests ---------------------------------------------------------
-- `get_games_nearby` is SECURITY DEFINER and already applies the gender gate to
-- `auth.uid()`, which is null here — so with the rule above it hands back the
-- Co-ed games. This wrapper adds what a guest additionally must not receive:
-- non-public games, and the host's id.

create or replace function public.get_guest_games_nearby(
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
    g.duration_minutes
  from public.get_games_nearby(lat, lng, radius_km) g
  -- Friends-only and invite-only games are hidden from the map in JS for members;
  -- for a guest there is no "later" where that filter runs, so it runs here.
  where coalesce(g.visibility, 'public') = 'public';
$function$;

revoke execute on function public.get_guest_games_nearby(double precision, double precision, double precision) from public;
grant execute on function public.get_guest_games_nearby(double precision, double precision, double precision) to anon;

-- 3) Map notes for guests -----------------------------------------------------
-- `get_notes_nearby` is SECURITY INVOKER: called from inside this DEFINER
-- wrapper it runs as the owner and row-level security does NOT apply, so the
-- `visibility = 'public'` filter below is load-bearing, not belt-and-braces.

create or replace function public.get_guest_notes_nearby(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision default 10,
  p_limit integer default 50
)
returns table(
  id uuid,
  created_at timestamp with time zone,
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
security definer
set search_path to 'public'
as $function$
  select
    n.id,
    n.created_at,
    null::uuid as created_by,
    n.lat,
    n.lng,
    n.body,
    n.visibility,
    n.place_name,
    n.distance_km,
    n.comment_count,
    n.like_count,
    false as liked_by_me
  from public.get_notes_nearby(p_lat, p_lng, p_radius_km, p_limit) n
  where n.visibility = 'public';
$function$;

revoke execute on function public.get_guest_notes_nearby(double precision, double precision, double precision, integer) from public;
grant execute on function public.get_guest_notes_nearby(double precision, double precision, double precision, integer) to anon;

create or replace function public.get_guest_note_by_id(
  p_note_id uuid,
  p_lat double precision default null,
  p_lng double precision default null
)
returns table(
  id uuid,
  created_at timestamp with time zone,
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
security definer
set search_path to 'public'
as $function$
  select
    n.id,
    n.created_at,
    null::uuid as created_by,
    n.lat,
    n.lng,
    n.body,
    n.visibility,
    n.place_name,
    n.distance_km,
    n.comment_count,
    n.like_count,
    false as liked_by_me
  from public.get_note_by_id(p_note_id, p_lat, p_lng) n
  where n.visibility = 'public';
$function$;

revoke execute on function public.get_guest_note_by_id(uuid, double precision, double precision) from public;
grant execute on function public.get_guest_note_by_id(uuid, double precision, double precision) to anon;

-- 4) Venue reviews / comments / photos for guests ------------------------------
-- The member versions are SECURITY INVOKER and rely on those tables' read
-- policies. Inside these wrappers RLS is bypassed, so each one re-states the
-- visibility rule it depends on (photos: `status = 'visible'`; reviews and
-- comments are readable in full by design — it is the author that is withheld).

create or replace function public.get_guest_venue_reviews(
  p_venue_id text,
  p_limit int default 20,
  p_offset int default 0
)
returns table(
  id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  venue_id text,
  user_id uuid,
  rating smallint,
  body text,
  is_mine boolean,
  total_count int,
  avg_rating numeric
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    r.id, r.created_at, r.updated_at, r.venue_id,
    null::uuid as user_id,
    r.rating, r.body,
    false as is_mine,
    r.total_count, r.avg_rating
  from public.get_venue_reviews(p_venue_id, p_limit, p_offset) r;
$function$;

revoke execute on function public.get_guest_venue_reviews(text, int, int) from public;
grant execute on function public.get_guest_venue_reviews(text, int, int) to anon;

create or replace function public.get_guest_venue_comments(
  p_venue_id text,
  p_limit int default 50,
  p_offset int default 0
)
returns table(
  id uuid,
  created_at timestamptz,
  venue_id text,
  user_id uuid,
  body text,
  like_count int,
  liked_by_me boolean
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    c.id, c.created_at, c.venue_id,
    null::uuid as user_id,
    c.body, c.like_count,
    false as liked_by_me
  from public.get_venue_comments_with_likes(p_venue_id, p_limit, p_offset) c;
$function$;

revoke execute on function public.get_guest_venue_comments(text, int, int) from public;
grant execute on function public.get_guest_venue_comments(text, int, int) to anon;

create or replace function public.get_guest_venue_photos(
  p_venue_id text,
  p_limit int default 12
)
returns table(
  id uuid,
  created_at timestamptz,
  venue_id text,
  user_id uuid,
  storage_path text,
  caption text,
  status text
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    p.id, p.created_at, p.venue_id,
    null::uuid as user_id,
    p.storage_path, p.caption, p.status
  from public.get_venue_photos(p_venue_id, p_limit) p
  where p.status = 'visible';
$function$;

revoke execute on function public.get_guest_venue_photos(text, int) from public;
grant execute on function public.get_guest_venue_photos(text, int) to anon;

notify pgrst, 'reload schema';

-- Verification:
--   set role anon;
--   select created_by, visibility, title from public.get_guest_games_nearby(32.73, -97.11, 25);
--     -- expect: created_by null on every row, visibility 'public' on every row,
--     --         no game whose requirements->>'matchType' = 'Same gender'
--   select created_by, visibility from public.get_guest_notes_nearby(32.73, -97.11, 25, 50);
--     -- expect: created_by null, visibility 'public' only
--   reset role;
--   -- and unchanged for members:
--   set role authenticated;
--   select set_config('request.jwt.claim.sub', '<a woman''s uuid>', false);
--   select count(*) from public.get_games_nearby(32.73, -97.11, 25);  -- her games, as before
