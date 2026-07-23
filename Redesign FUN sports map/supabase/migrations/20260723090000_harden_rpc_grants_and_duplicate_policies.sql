-- Loop 1: Harden SECURITY DEFINER RPC grants + dedupe overlapping policies.
-- App uses RequireAuth — client RPCs need authenticated only, not anon/PUBLIC.

-- ---------------------------------------------------------------------------
-- 1) Drop debug RPCs (SECURITY DEFINER + publicly executable)
-- ---------------------------------------------------------------------------
drop function if exists public.debug_active_hosted_games(uuid);
drop function if exists public.debug_bools(uuid);
drop function if exists public.debug_get_source();

-- ---------------------------------------------------------------------------
-- 2) Revoke EXECUTE from PUBLIC + anon on all FUN SECURITY DEFINER functions
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.proname not like 'st_%'
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3) Internal / trigger-only: also revoke from authenticated
-- ---------------------------------------------------------------------------
revoke execute on function public.enforce_game_participants_visibility() from authenticated;
revoke execute on function public.enqueue_notification(uuid, text, jsonb) from authenticated;
revoke execute on function public.handle_new_user() from authenticated;
revoke execute on function public.mark_ended_games_completed() from authenticated;
revoke execute on function public.trg_notify_game_invite() from authenticated;
revoke execute on function public.trg_notify_nearby_on_game() from authenticated;
revoke execute on function public.trg_notify_nearby_on_map_note() from authenticated;
revoke execute on function public.trg_notify_note_comment_liked() from authenticated;
revoke execute on function public.trg_notify_note_thread_participants() from authenticated;
revoke execute on function public.trg_notify_on_follow() from authenticated;

-- ---------------------------------------------------------------------------
-- 4) Client-facing RPCs: grant EXECUTE to authenticated
-- ---------------------------------------------------------------------------
grant execute on function public.add_note_comment(uuid, text) to authenticated;
grant execute on function public.add_post_comment(uuid, text) to authenticated;
grant execute on function public.add_status_comment(uuid, text) to authenticated;
grant execute on function public.can_dm(uuid) to authenticated;
grant execute on function public.check_nearby_similar_games(text, double precision, double precision, timestamptz, double precision) to authenticated;
grant execute on function public.complete_game(uuid, text, jsonb) to authenticated;
grant execute on function public.create_game(text, text, double precision, double precision, integer, timestamptz, text, text, jsonb) to authenticated;
grant execute on function public.create_game(text, text, integer, double precision, double precision, timestamptz, text, text, jsonb, integer, text) to authenticated;
grant execute on function public.create_map_note(double precision, double precision, text, text, text) to authenticated;
grant execute on function public.delete_my_status(uuid) to authenticated;
grant execute on function public.end_game(uuid) to authenticated;
grant execute on function public.endorse_athlete(uuid, uuid, integer, text[]) to authenticated;
grant execute on function public.get_active_hosted_games_count(uuid) to authenticated;
grant execute on function public.get_athlete_reputation(uuid) to authenticated;
grant execute on function public.get_follow_requests() to authenticated;
grant execute on function public.get_game_lat_lng(uuid) to authenticated;
grant execute on function public.get_games_nearby(double precision, double precision, double precision) to authenticated;
grant execute on function public.get_my_dm_inbox() to authenticated;
grant execute on function public.get_my_game_inbox() to authenticated;
grant execute on function public.get_my_note_inbox() to authenticated;
grant execute on function public.get_my_pending_invites() to authenticated;
grant execute on function public.get_or_create_dm_thread(uuid) to authenticated;
grant execute on function public.get_profiles_nearby(double precision, double precision, double precision, integer) to authenticated;
grant execute on function public.get_shared_completed_games(uuid) to authenticated;
grant execute on function public.is_eligible_to_join_game(uuid, uuid) to authenticated;
grant execute on function public.join_game(uuid) to authenticated;
grant execute on function public.leave_game(uuid) to authenticated;
grant execute on function public.redeem_invite_token(uuid) to authenticated;
grant execute on function public.request_chat_invite(uuid, uuid) to authenticated;
grant execute on function public.request_follow(uuid) to authenticated;
grant execute on function public.respond_chat_invite(uuid, text) to authenticated;
grant execute on function public.respond_follow_request(uuid, boolean) to authenticated;
grant execute on function public.search_profiles(text, double precision, double precision, double precision, integer, uuid) to authenticated;
grant execute on function public.update_my_location(double precision, double precision) to authenticated;
grant execute on function public.update_my_presence(double precision, double precision, text) to authenticated;
grant execute on function public.upsert_my_status(text) to authenticated;

-- Future functions: do not auto-grant EXECUTE to PUBLIC/anon
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;

-- ---------------------------------------------------------------------------
-- 5) Deduplicate notifications policies → single authenticated pair
-- ---------------------------------------------------------------------------
drop policy if exists "Notifications readable by owner" on public.notifications;
drop policy if exists "Notifications updatable by owner" on public.notifications;
drop policy if exists "notifications: read own" on public.notifications;
drop policy if exists "notifications: update own" on public.notifications;

create policy "notifications: read own"
  on public.notifications
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "notifications: update own"
  on public.notifications
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 6) Deduplicate osm_sports_venues public read → single policy
-- ---------------------------------------------------------------------------
drop policy if exists "Anyone can read osm sports venues" on public.osm_sports_venues;
drop policy if exists "osm_sports_venues_public_read" on public.osm_sports_venues;

create policy "osm_sports_venues_public_read"
  on public.osm_sports_venues
  for select
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- 7) Best-effort: revoke API-role grants on PostGIS spatial_ref_sys
--    (ENABLE RLS still requires table owner — may fail on hosted Supabase)
-- ---------------------------------------------------------------------------
do $$
begin
  execute 'revoke all on table public.spatial_ref_sys from anon, authenticated';
exception
  when insufficient_privilege or undefined_table then
    raise notice 'spatial_ref_sys revoke skipped: %', sqlerrm;
end $$;
