-- Lock down public.dm_threads — RLS was never enabled (Supabase advisor
-- rls_disabled_in_public, level ERROR), so every DM thread row was readable/writable
-- with the public anon key (it ships in the client bundle).
--
-- Safe to enable: all legitimate access goes through SECURITY DEFINER RPCs
-- (get_or_create_dm_thread = create, get_my_dm_inbox = read, can_dm = check), which
-- bypass RLS. The client never selects/inserts dm_threads directly — it only calls those
-- RPCs and reads dm_messages (already member-scoped). So RLS here does not break DM flows.
--
-- SELECT policy mirrors dm_messages (membership via dm_thread_members). No INSERT/UPDATE/
-- DELETE policy is added: thread creation is handled exclusively by the definer RPC, and
-- omitting write policies denies any direct client write (defense in depth).

alter table public.dm_threads enable row level security;

drop policy if exists "dm_threads_select_members" on public.dm_threads;
create policy "dm_threads_select_members"
  on public.dm_threads
  for select
  using (
    exists (
      select 1
      from public.dm_thread_members m
      where m.thread_id = dm_threads.id
        and m.user_id = auth.uid()
    )
  );

notify pgrst, 'reload schema';
