-- Phase 4: guest map browsing.
--
-- The map route "/" is public, but get_games_nearby (SECURITY DEFINER) was
-- revoked from anon by the 20260723090000 hardening loop and only re-granted to
-- authenticated. So a logged-out visitor's RPC returns 42501 → the client shows
-- "Couldn't load games". Grant anon EXECUTE so guests can browse games on the map.
--
-- Deliberately NOT granted to anon (privacy — stays signed-in only):
--   * get_profiles_nearby  (player locations)
--   * get_notes_nearby     (map notes; client also hides the layer for guests)
--
-- get_games_nearby is SECURITY DEFINER and its body projects only public
-- GameRow columns, so exposing it to anon reveals nothing a signed-in user
-- couldn't already see.

grant execute on function public.get_games_nearby(double precision, double precision, double precision) to anon;

notify pgrst, 'reload schema';
