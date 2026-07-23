-- Rebuild-safety: explicit EXECUTE grants for 7 client-called read RPCs.
--
-- These are defined `security definer` in earlier migrations
-- (20260501130000, 20260501160000, 20260501180000, 20260628020000) with
-- `grant execute ... to authenticated, anon`. On LIVE prod they have since
-- drifted to SECURITY INVOKER, so the 20260723090000 hardening revoke loop
-- (which only targets prosecdef functions) never touched them — authenticated
-- users can call them today, verified via has_function_privilege + REST.
--
-- However, a FRESH rebuild from these migrations creates them as DEFINER, and
-- the 20260723090000 revoke loop then strips anon/public EXECUTE while its
-- re-grant allowlist omits all 7 → 42501 for every signed-in user on a fresh
-- database. This migration runs AFTER 090000 and restores their original
-- grants so the committed migration set produces a working DB. Idempotent:
-- a no-op on prod, corrective on a rebuild.
--
-- Grants mirror the original definitions (authenticated + anon), except
-- get_post_comments which is authenticated-only on prod (kept as-is). The
-- public feed / status strips rely on the anon grants; map-layer guest gating
-- is handled at the app layer (App.tsx refetchNotes) + Phase 4 grants.

grant execute on function public.get_notes_nearby(double precision, double precision, double precision, integer) to authenticated, anon;
grant execute on function public.get_note_comments(uuid) to authenticated, anon;
grant execute on function public.get_note_comments_with_likes(uuid) to authenticated, anon;
grant execute on function public.get_recent_statuses(integer) to authenticated, anon;
grant execute on function public.get_latest_status(uuid) to authenticated, anon;
grant execute on function public.get_status_comments(uuid) to authenticated, anon;
grant execute on function public.get_post_comments(uuid) to authenticated;

notify pgrst, 'reload schema';
