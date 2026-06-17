-- Pin search_path on the 14 functions the Supabase advisor flags as
-- function_search_path_mutable. All are SECURITY INVOKER (run with the caller's
-- privileges, so there is no privilege-escalation vector) — this is hygiene that
-- clears the advisor and prevents surprises from a caller-controlled search_path.
--
-- Value `public, extensions` is non-breaking: unqualified references resolve in
-- public (app tables + PostGIS, which lives in public here) and the extensions
-- schema; qualified references (e.g. auth.uid()) are unaffected; a non-existent
-- schema in a search_path is silently ignored. Idempotent (re-running re-sets the
-- same value).

alter function public.fun_games_sync_lat_lng() set search_path = public, extensions;
alter function public.games_set_ends_at() set search_path = public, extensions;
alter function public.get_latest_status(p_user uuid) set search_path = public, extensions;
alter function public.get_live_nearby(p_lat double precision, p_lng double precision, p_radius_km double precision, p_limit integer) set search_path = public, extensions;
alter function public.get_note_comments(p_note_id uuid) set search_path = public, extensions;
alter function public.get_note_comments_with_likes(p_note_id uuid) set search_path = public, extensions;
alter function public.get_notes_nearby(p_lat double precision, p_lng double precision, p_radius_km double precision, p_limit integer) set search_path = public, extensions;
alter function public.get_recent_statuses(p_limit integer) set search_path = public, extensions;
alter function public.get_status_comments(p_status_id uuid) set search_path = public, extensions;
alter function public.get_unified_feed(p_lat double precision, p_lng double precision, p_map_radius_km double precision, p_limit integer) set search_path = public, extensions;
alter function public.haversine_km(p_lat1 double precision, p_lng1 double precision, p_lat2 double precision, p_lng2 double precision) set search_path = public, extensions;
alter function public.is_game_visible_on_map(p_game_id uuid) set search_path = public, extensions;
alter function public.maintain_game_participant_count() set search_path = public, extensions;
alter function public.maintain_profile_endorsement_stats() set search_path = public, extensions;

notify pgrst, 'reload schema';
