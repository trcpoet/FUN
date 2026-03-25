-- Direct messages (1:1) + inbox RPCs.
-- Keeps game chat (group) separate from private conversations in the client UI.

-- 1) Threads (one per pair of users)
create table if not exists public.dm_threads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table if not exists public.dm_thread_members (
  thread_id uuid not null references public.dm_threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);

create index if not exists dm_thread_members_user_idx
  on public.dm_thread_members (user_id, thread_id);

-- 2) Messages
create table if not exists public.dm_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.dm_threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint dm_messages_body_len check (
    char_length(trim(body)) > 0
    and char_length(body) <= 2000
  )
);

create index if not exists dm_messages_thread_created_idx
  on public.dm_messages (thread_id, created_at desc);

-- 3) RLS
alter table public.dm_thread_members enable row level security;
alter table public.dm_messages enable row level security;

drop policy if exists "dm_thread_members_select_self" on public.dm_thread_members;
create policy "dm_thread_members_select_self"
  on public.dm_thread_members for select
  using (auth.uid() = user_id);

drop policy if exists "dm_thread_members_insert_self" on public.dm_thread_members;
create policy "dm_thread_members_insert_self"
  on public.dm_thread_members for insert
  with check (auth.uid() = user_id);

drop policy if exists "dm_messages_select_members" on public.dm_messages;
create policy "dm_messages_select_members"
  on public.dm_messages for select
  using (
    exists (
      select 1 from public.dm_thread_members m
      where m.thread_id = dm_messages.thread_id
        and m.user_id = auth.uid()
    )
  );

drop policy if exists "dm_messages_insert_members" on public.dm_messages;
create policy "dm_messages_insert_members"
  on public.dm_messages for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.dm_thread_members m
      where m.thread_id = dm_messages.thread_id
        and m.user_id = auth.uid()
    )
  );

-- 4) Realtime publication (idempotent)
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'dm_messages'
  ) then
    alter publication supabase_realtime add table public.dm_messages;
  end if;
end;
$$;

-- 5) RPC: get or create a 1:1 thread with another user.
drop function if exists public.get_or_create_dm_thread(uuid);
create or replace function public.get_or_create_dm_thread(p_other uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  tid uuid;
begin
  if me is null then
    raise exception 'Not signed in';
  end if;
  if p_other is null or p_other = me then
    raise exception 'Invalid user';
  end if;

  select t.id into tid
  from public.dm_threads t
  join public.dm_thread_members a on a.thread_id = t.id and a.user_id = me
  join public.dm_thread_members b on b.thread_id = t.id and b.user_id = p_other
  limit 1;

  if tid is not null then
    return tid;
  end if;

  insert into public.dm_threads default values returning id into tid;
  insert into public.dm_thread_members (thread_id, user_id) values (tid, me);
  insert into public.dm_thread_members (thread_id, user_id) values (tid, p_other);
  return tid;
end;
$$;

grant execute on function public.get_or_create_dm_thread(uuid) to authenticated;
grant execute on function public.get_or_create_dm_thread(uuid) to anon;

-- 6) RPC: inbox rows for my DM threads (other user's public profile + last message)
drop function if exists public.get_my_dm_inbox();
create or replace function public.get_my_dm_inbox()
returns table (
  thread_id uuid,
  other_user_id uuid,
  display_name text,
  avatar_url text,
  last_message_body text,
  last_message_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with my_threads as (
    select m.thread_id
    from public.dm_thread_members m
    where m.user_id = auth.uid()
  ),
  others as (
    select
      mt.thread_id,
      om.user_id as other_user_id
    from my_threads mt
    join public.dm_thread_members om
      on om.thread_id = mt.thread_id
     and om.user_id <> auth.uid()
  )
  select
    o.thread_id,
    o.other_user_id,
    p.display_name,
    p.avatar_url,
    lm.body as last_message_body,
    lm.created_at as last_message_at
  from others o
  left join public.profiles p on p.id = o.other_user_id
  left join lateral (
    select m.body, m.created_at
    from public.dm_messages m
    where m.thread_id = o.thread_id
    order by m.created_at desc
    limit 1
  ) lm on true
  order by coalesce(lm.created_at, (select t.created_at from public.dm_threads t where t.id = o.thread_id)) desc nulls last;
$$;

grant execute on function public.get_my_dm_inbox() to authenticated;
grant execute on function public.get_my_dm_inbox() to anon;

notify pgrst, 'reload schema';

