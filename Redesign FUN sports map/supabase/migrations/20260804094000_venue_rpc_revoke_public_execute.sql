-- ===========================================================================
-- Strip default PUBLIC EXECUTE from the venue social RPCs.
--
-- WHY
-- ---
-- Postgres grants EXECUTE to PUBLIC on every newly created function. The
-- venue RPCs added in 20260804091000 / 20260804092000 each carried an explicit
-- `grant execute ... to authenticated`, but granting does not remove the
-- default, so all seven SECURITY DEFINER writers were left callable by PUBLIC
-- (and therefore by `anon`). Verified against production after applying those
-- migrations: only ensure_venue_row and trg_venue_photo_report_applied — the
-- two with an explicit `revoke` — were clean.
--
-- Nothing was exploitable: every writer opens with
--     if v_uid is null then raise exception 'not_signed_in' using errcode='42501';
-- so an anonymous caller only ever got an exception. This is defense in depth.
-- The whole point of 20260723090000 was to remove default PUBLIC EXECUTE from
-- SECURITY DEFINER functions in `public`, and leaving these behind means one
-- future edit that drops a guard silently becomes an anon-callable write path.
--
-- Reads are revoked from PUBLIC too, then re-granted explicitly to anon +
-- authenticated. Same effective access, but stated rather than inherited, so
-- the grant is visible in this file instead of being a Postgres default.
-- ===========================================================================

set search_path = public;

-- --- Writers: authenticated only -------------------------------------------
revoke execute on function public.upsert_venue_review(text, int, text, double precision, double precision, text, text, text) from public;
revoke execute on function public.delete_venue_review(text) from public;
revoke execute on function public.add_venue_comment(text, text, double precision, double precision, text, text, text) from public;
revoke execute on function public.delete_venue_comment(uuid) from public;
revoke execute on function public.toggle_venue_comment_like(uuid) from public;
revoke execute on function public.add_venue_photo(text, text, text, double precision, double precision, text, text, text) from public;
revoke execute on function public.delete_venue_photo(uuid) from public;
revoke execute on function public.report_venue_photo(uuid, text) from public;

grant execute on function public.upsert_venue_review(text, int, text, double precision, double precision, text, text, text) to authenticated;
grant execute on function public.delete_venue_review(text) to authenticated;
grant execute on function public.add_venue_comment(text, text, double precision, double precision, text, text, text) to authenticated;
grant execute on function public.delete_venue_comment(uuid) to authenticated;
grant execute on function public.toggle_venue_comment_like(uuid) to authenticated;
grant execute on function public.add_venue_photo(text, text, text, double precision, double precision, text, text, text) to authenticated;
grant execute on function public.delete_venue_photo(uuid) to authenticated;
grant execute on function public.report_venue_photo(uuid, text) to authenticated;

-- --- Readers: anon + authenticated, stated explicitly ----------------------
-- These are SECURITY INVOKER, so RLS still applies to whoever calls them;
-- guests are meant to be able to read reviews, comments and photos.
revoke execute on function public.get_venue_reviews(text, int, int) from public;
revoke execute on function public.get_venue_comments_with_likes(text, int, int) from public;
revoke execute on function public.get_venue_photos(text, int) from public;

grant execute on function public.get_venue_reviews(text, int, int) to authenticated, anon;
grant execute on function public.get_venue_comments_with_likes(text, int, int) to authenticated, anon;
grant execute on function public.get_venue_photos(text, int) to authenticated, anon;

notify pgrst, 'reload schema';
