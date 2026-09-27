-- Guest browsing, part 2 of 2: take away the doors the guest wrappers replaced.
--
-- APPLY AFTER the client that reads through `get_guest_*` is deployed. Part 1
-- is additive and safe at any time; this one removes access the shipped client
-- would otherwise still be using.
--
-- Until now "guests don't see people" was a statement about the UI, not about
-- the database. Every table grants anon full privileges, so row-level security
-- is the only gate — and these policies open to `public`, which includes anon:
--
--   select * from profiles  -> every display name, avatar, gender, handle, city
--   select * from user_follows -> the whole social graph
--   select * from map_notes -> every public note, with created_by
--   select * from venue_reviews / venue_comments / venue_photos -> with user_id
--   select * from status_updates / user_statuses / feed_media_posts -> the feed
--
-- The venue card proves the gap rather than hiding it: `hydrateAuthors` in
-- venueSocial.ts reads `profiles` directly to put a name and face on every
-- review a signed-out visitor is shown.
--
-- Each policy below moves from `public` / `anon` to `authenticated`. Members are
-- unaffected — the USING expressions are untouched. Guests keep exactly what the
-- map needs and nothing about anyone: venue rows (`osm_sports_venues`,
-- `venue_coverage`), the badge catalogue, and the six `get_guest_*` functions.

-- 1) People and their social graph -------------------------------------------
alter policy "Profiles are viewable by everyone" on public.profiles to authenticated;
alter policy "user_follows: read public" on public.user_follows to authenticated;
alter policy "User badges readable by everyone" on public.user_badges to authenticated;
alter policy "Game results readable by everyone" on public.game_results to authenticated;

-- 2) Map notes and their threads ----------------------------------------------
alter policy "map_notes: read visible" on public.map_notes to authenticated;
alter policy "map_note_comments: read if can see note" on public.map_note_comments to authenticated;
alter policy "map_note_likes: read" on public.map_note_likes to authenticated;
alter policy "map_note_comment_likes: read" on public.map_note_comment_likes to authenticated;

-- 3) Venue social ---------------------------------------------------------------
alter policy "venue_reviews: read all" on public.venue_reviews to authenticated;
alter policy "venue_comments: read all" on public.venue_comments to authenticated;
alter policy "venue_comment_likes: read if comment exists" on public.venue_comment_likes to authenticated;
alter policy "venue_photos: read visible or own" on public.venue_photos to authenticated;

-- 4) Feed, stories, statuses ----------------------------------------------------
alter policy "feed_media_posts: visible" on public.feed_media_posts to authenticated;
alter policy "post_comments: read" on public.feed_media_post_comments to authenticated;
alter policy "post_likes: read" on public.feed_media_post_likes to authenticated;
alter policy "user_statuses: read non-expired" on public.user_statuses to authenticated;
alter policy status_updates_select_public on public.status_updates to authenticated;
alter policy "status_comments: read" on public.status_comments to authenticated;
alter policy "status_likes: read" on public.status_likes to authenticated;

-- Deliberately untouched, because a guest needs them and they describe places,
-- not people: osm_sports_venues, venue_coverage, and the badge catalogue.

-- 5) The member read RPCs stop answering anon ----------------------------------
-- Each of these projects a user id, and each now has a `get_guest_*` counterpart
-- (part 1) or is a members-only surface (feed, live, note threads, statuses).
-- The guest wrappers call these from inside SECURITY DEFINER, where privileges
-- are the owner's, so revoking anon here does not break them.
--
-- Revoked from PUBLIC as well as anon: Postgres grants EXECUTE to PUBLIC on
-- every new function, and the 20260723090000 hardening loop only stripped that
-- from the SECURITY DEFINER ones — these are INVOKER, so a revoke aimed at anon
-- alone could leave the inherited PUBLIC grant answering for it. Every function
-- below has an explicit grant to authenticated and service_role in the baseline,
-- so members are unaffected.

revoke execute on function public.get_games_nearby(double precision, double precision, double precision) from public, anon;
revoke execute on function public.get_notes_nearby(double precision, double precision, double precision, integer) from public, anon;
revoke execute on function public.get_note_by_id(uuid, double precision, double precision) from public, anon;
revoke execute on function public.get_live_nearby(double precision, double precision, double precision, integer) from public, anon;
revoke execute on function public.get_unified_feed(double precision, double precision, double precision, integer) from public, anon;
revoke execute on function public.get_venue_reviews(text, int, int) from public, anon;
revoke execute on function public.get_venue_comments_with_likes(text, int, int) from public, anon;
revoke execute on function public.get_venue_photos(text, int) from public, anon;

do $$
declare
  v_sig text;
begin
  -- These four vary by deployment age (note-comment reads, statuses), so revoke
  -- whatever signature is actually installed rather than guessing one.
  for v_sig in
    select p.oid::regprocedure::text
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'get_note_comments',
         'get_note_comments_with_likes',
         'get_recent_statuses',
         'get_latest_status',
         'get_status_comments'
       )
  loop
    execute format('revoke execute on function %s from public, anon', v_sig);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- Verification, as anon:
--   set role anon;
--   select count(*) from public.profiles;        -- 0 rows (policy), not an error
--   select count(*) from public.map_notes;       -- 0
--   select count(*) from public.venue_reviews;   -- 0
--   select count(*) from public.get_guest_games_nearby(32.73, -97.11, 25);  -- works
--   select count(*) from public.get_games_nearby(32.73, -97.11, 25);        -- 42501
--   select count(*) from public.osm_sports_venues;                          -- still readable
--   reset role;
