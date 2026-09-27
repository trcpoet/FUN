-- Read state for every chat thread: one table, three kinds.
--
-- Why not a column on the membership tables, which is the obvious design:
--
--   * `game_participants` SELECT is `to public using (true)`. A `last_read_at`
--     there would publish "when was this person last on their phone" to anon.
--   * `dm_thread_members` SELECT is self-only. A definer RPC could read a peer's
--     watermark, but Realtime cannot — it evaluates RLS with the subscriber's own
--     JWT and cannot route through a definer function, so "Seen" could never
--     update live.
--
-- Hence its own table, with its own policies, in the realtime publication.
--
-- Additive: nothing here removes access, and a deployed client that knows
-- nothing about it is unaffected.

create table if not exists public.chat_reads (
  thread_kind  text not null check (thread_kind in ('game','dm','note')),
  -- Deliberately its own uuid column rather than a composite text key, so
  -- Realtime's single-column `filter: thread_id=eq.…` works. No FK: it points at
  -- three different tables, and integrity lives in the write RPC below, exactly
  -- as it already does for `viewer_is_game_participant`.
  thread_id    uuid not null,
  user_id      uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (thread_kind, thread_id, user_id)
);

-- Realtime needs the old row to compute a diff on UPDATE.
alter table public.chat_reads replica identity full;

create index if not exists chat_reads_thread_idx
  on public.chat_reads (thread_kind, thread_id);

alter table public.chat_reads enable row level security;

-- Am I in this DM thread? `dm_thread_members` SELECT is self-only, which is
-- enough to answer for myself, but a definer function keeps the answer stable if
-- that policy ever tightens further.
create or replace function public.viewer_is_dm_thread_member(p_thread_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.dm_thread_members m
    where m.thread_id = p_thread_id and m.user_id = auth.uid()
  );
$$;

drop policy if exists "chat_reads: read own" on public.chat_reads;
create policy "chat_reads: read own"
  on public.chat_reads for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "chat_reads: read your game thread" on public.chat_reads;
create policy "chat_reads: read your game thread"
  on public.chat_reads for select to authenticated
  using (thread_kind = 'game' and public.viewer_is_game_participant(thread_id));

drop policy if exists "chat_reads: read your dm thread" on public.chat_reads;
create policy "chat_reads: read your dm thread"
  on public.chat_reads for select to authenticated
  using (thread_kind = 'dm' and public.viewer_is_dm_thread_member(thread_id));

-- No peer-read policy for 'note' on purpose. A map note is a public thread with
-- an undefined audience; there is nobody whose "Seen" would mean anything, so
-- note rows are readable only by the person they belong to.

drop policy if exists "chat_reads: write own" on public.chat_reads;
create policy "chat_reads: write own"
  on public.chat_reads for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "chat_reads: update own" on public.chat_reads;
create policy "chat_reads: update own"
  on public.chat_reads for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.chat_reads from anon;
grant select, insert, update on public.chat_reads to authenticated;

-- ---------------------------------------------------------------------------
-- Marking read
-- ---------------------------------------------------------------------------

-- Move my watermark forward in one thread.
--
-- The `where ... < excluded` on the upsert is load-bearing, not an optimisation:
-- a backward or equal mark writes zero rows, which writes zero WAL, which means
-- zero realtime fan-out. Without it, anyone idling in a thread would broadcast
-- to every other member forever.
--
-- Returns the resulting watermark, so a caller can see that a no-op was a no-op.
create or replace function public.mark_thread_read(
  p_kind      text,
  p_thread_id uuid,
  p_at        timestamptz default now()
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_at  timestamptz;
  v_out timestamptz;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if p_kind not in ('game','dm','note') then
    raise exception 'Unknown thread kind: %', p_kind using errcode = '22023';
  end if;

  -- A clock-skewed client must not be able to mark itself read into next week.
  v_at := least(coalesce(p_at, now()), now());

  if p_kind = 'game' and not public.viewer_is_game_participant(p_thread_id) then
    raise exception 'Not a participant in this game' using errcode = '42501';
  elsif p_kind = 'dm' and not public.viewer_is_dm_thread_member(p_thread_id) then
    raise exception 'Not a member of this thread' using errcode = '42501';
  elsif p_kind = 'note'
        and not exists (select 1 from public.map_notes n where n.id = p_thread_id) then
    raise exception 'No such note' using errcode = '42501';
  end if;

  insert into public.chat_reads (thread_kind, thread_id, user_id, last_read_at)
  values (p_kind, p_thread_id, v_uid, v_at)
  on conflict (thread_kind, thread_id, user_id) do update
    set last_read_at = excluded.last_read_at
    where chat_reads.last_read_at < excluded.last_read_at;

  select last_read_at into v_out
    from public.chat_reads
   where thread_kind = p_kind and thread_id = p_thread_id and user_id = v_uid;
  return v_out;
end;
$$;

revoke all on function public.mark_thread_read(text, uuid, timestamptz) from public, anon;
grant execute on function public.mark_thread_read(text, uuid, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Who has read
-- ---------------------------------------------------------------------------

-- Everyone else's watermark in one thread, with a face to put on it.
--
-- Note threads return nothing, by the same reasoning as the missing RLS policy
-- above: there is no audience to have been seen by.
create or replace function public.get_thread_read_receipts(
  p_kind      text,
  p_thread_id uuid
)
returns table (
  user_id      uuid,
  display_name text,
  avatar_url   text,
  last_read_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select r.user_id, p.display_name, p.avatar_url, r.last_read_at
  from public.chat_reads r
  left join public.profiles p on p.id = r.user_id
  where r.thread_kind = p_kind
    and r.thread_id = p_thread_id
    and r.user_id is distinct from auth.uid()
    and (
      (p_kind = 'game' and public.viewer_is_game_participant(p_thread_id))
      or (p_kind = 'dm' and public.viewer_is_dm_thread_member(p_thread_id))
    )
  order by r.last_read_at desc
  limit 50;
$$;

revoke all on function public.get_thread_read_receipts(text, uuid) from public, anon;
grant execute on function public.get_thread_read_receipts(text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Unread counts
-- ---------------------------------------------------------------------------

-- How many messages I have not read, per thread.
--
-- Each count is a bounded backwards scan capped at 100 rows on the index the
-- thread already has, so a thread with ten thousand messages costs the same as
-- one with a hundred. `unread_capped` says the number hit the ceiling, so the
-- badge can render "99+" honestly rather than inventing a total.
--
-- Only threads with something unread come back; the client already treats a
-- missing row as zero.
create or replace function public.get_my_unread_counts()
returns table (
  thread_kind   text,
  thread_id     uuid,
  unread_count  int,
  unread_capped boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (select auth.uid() as uid),
  watermark as (
    select r.thread_kind, r.thread_id, r.last_read_at
    from public.chat_reads r, me
    where r.user_id = me.uid
  ),
  games as (
    select gp.game_id as tid
    from public.game_participants gp, me
    where gp.user_id = me.uid
  ),
  dms as (
    select tm.thread_id as tid
    from public.dm_thread_members tm, me
    where tm.user_id = me.uid
  ),
  notes as (
    select n.id as tid from public.map_notes n, me where n.created_by = me.uid
    union
    select c.note_id from public.map_note_comments c, me where c.user_id = me.uid
  )
  select 'game'::text, g.tid, x.n::int, x.n >= 100
  from games g, me
  cross join lateral (
    select count(*) as n from (
      select 1 from public.game_messages m
      where m.game_id = g.tid
        and m.user_id is distinct from me.uid
        and m.created_at > coalesce(
          (select w.last_read_at from watermark w
            where w.thread_kind = 'game' and w.thread_id = g.tid),
          '-infinity'::timestamptz)
      order by m.created_at desc
      limit 100
    ) s
  ) x
  where x.n > 0

  union all
  select 'dm'::text, d.tid, x.n::int, x.n >= 100
  from dms d, me
  cross join lateral (
    select count(*) as n from (
      select 1 from public.dm_messages m
      where m.thread_id = d.tid
        and m.user_id is distinct from me.uid
        and m.created_at > coalesce(
          (select w.last_read_at from watermark w
            where w.thread_kind = 'dm' and w.thread_id = d.tid),
          '-infinity'::timestamptz)
      order by m.created_at desc
      limit 100
    ) s
  ) x
  where x.n > 0

  union all
  select 'note'::text, nt.tid, x.n::int, x.n >= 100
  from notes nt, me
  cross join lateral (
    select count(*) as n from (
      select 1 from public.map_note_comments c
      where c.note_id = nt.tid
        and c.user_id is distinct from me.uid
        and c.created_at > coalesce(
          (select w.last_read_at from watermark w
            where w.thread_kind = 'note' and w.thread_id = nt.tid),
          '-infinity'::timestamptz)
      order by c.created_at desc
      limit 100
    ) s
  ) x
  where x.n > 0;
$$;

revoke all on function public.get_my_unread_counts() from public, anon;
grant execute on function public.get_my_unread_counts() to authenticated;

-- ---------------------------------------------------------------------------
-- Sending is reading
-- ---------------------------------------------------------------------------

-- A message you sent is a message you have read. Without this, sending from your
-- phone leaves your laptop's badge sitting at 1 for something you wrote.
create or replace function public.chat_reads_touch_sender()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind   text;
  v_thread uuid;
begin
  if tg_table_name = 'game_messages' then
    v_kind := 'game'; v_thread := new.game_id;
  elsif tg_table_name = 'dm_messages' then
    v_kind := 'dm'; v_thread := new.thread_id;
  elsif tg_table_name = 'map_note_comments' then
    v_kind := 'note'; v_thread := new.note_id;
  else
    return new;
  end if;

  if new.user_id is null then return new; end if;

  insert into public.chat_reads (thread_kind, thread_id, user_id, last_read_at)
  values (v_kind, v_thread, new.user_id, new.created_at)
  on conflict (thread_kind, thread_id, user_id) do update
    set last_read_at = excluded.last_read_at
    where chat_reads.last_read_at < excluded.last_read_at;

  return new;
end;
$$;

drop trigger if exists game_messages_touch_read on public.game_messages;
create trigger game_messages_touch_read
  after insert on public.game_messages
  for each row execute function public.chat_reads_touch_sender();

drop trigger if exists dm_messages_touch_read on public.dm_messages;
create trigger dm_messages_touch_read
  after insert on public.dm_messages
  for each row execute function public.chat_reads_touch_sender();

drop trigger if exists map_note_comments_touch_read on public.map_note_comments;
create trigger map_note_comments_touch_read
  after insert on public.map_note_comments
  for each row execute function public.chat_reads_touch_sender();

-- ---------------------------------------------------------------------------
-- Backfill — not optional
-- ---------------------------------------------------------------------------
-- Without it, every existing user opens the app to a badge of several hundred
-- for conversations they read months ago. Seeding at now() declares history read,
-- which is both kinder and true: they have already seen it.

insert into public.chat_reads (thread_kind, thread_id, user_id, last_read_at)
select 'game', gp.game_id, gp.user_id, now()
from public.game_participants gp
on conflict do nothing;

insert into public.chat_reads (thread_kind, thread_id, user_id, last_read_at)
select 'dm', tm.thread_id, tm.user_id, now()
from public.dm_thread_members tm
on conflict do nothing;

insert into public.chat_reads (thread_kind, thread_id, user_id, last_read_at)
select distinct 'note', n.id, n.created_by, now()
from public.map_notes n
where n.created_by is not null
on conflict do nothing;

insert into public.chat_reads (thread_kind, thread_id, user_id, last_read_at)
select distinct 'note', c.note_id, c.user_id, now()
from public.map_note_comments c
where c.user_id is not null
on conflict do nothing;

-- Live "Seen".
alter publication supabase_realtime add table public.chat_reads;

-- The schema-wide Supabase default hands `authenticated` DELETE, TRUNCATE,
-- REFERENCES and TRIGGER on every public table. Nothing deletes a read
-- watermark — it only ever moves forward — so take the ones this table has no
-- use for. RLS already denies DELETE (no policy grants it); this makes the
-- intent explicit rather than relying on the absence of a policy.
revoke delete, truncate, references, trigger on public.chat_reads from authenticated;
