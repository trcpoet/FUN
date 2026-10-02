-- Two helpers from 20260928120000_chat_reads.sql were left on the REST surface.
--
-- `chat_reads_touch_sender()` is a trigger function. It had no business being
-- reachable at `/rest/v1/rpc/chat_reads_touch_sender` at all — calling a trigger
-- function directly raises rather than doing damage, so this is less a hole
-- closed than an endpoint that should never have existed. Revoked from everyone,
-- including `authenticated`: PostgreSQL checks EXECUTE when a trigger is
-- *created*, not when it fires. Verified in a rolled-back transaction before
-- applying — with EXECUTE revoked from public, anon and authenticated, inserting
-- a game message still advanced the sender's watermark.
--
-- `viewer_is_dm_thread_member(uuid)` kept the default PUBLIC execute, so `anon`
-- could call it. Harmless in itself — it answers "is auth.uid() in this thread",
-- which for anon is always false — but it is not part of the guest surface, and
-- the guest surface is meant to be exactly the `get_guest_*` functions.
-- `authenticated` must keep it: the `chat_reads: read your dm thread` policy
-- calls it, and a policy's function runs with the querying role's privileges.
-- Verified the policy still evaluates after the revoke.
--
-- Neither is called from the client — checked across src/, api/ and server/.

revoke all on function public.chat_reads_touch_sender() from public, anon, authenticated;

revoke all on function public.viewer_is_dm_thread_member(uuid) from public, anon;
grant execute on function public.viewer_is_dm_thread_member(uuid) to authenticated;
