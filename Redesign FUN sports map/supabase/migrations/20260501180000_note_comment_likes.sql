-- =======================================================================
-- Per-comment likes for map note comments.
--
-- Adds:
--   * public.map_note_comment_likes table + RLS
--   * trg_notify_note_comment_liked trigger -> notification 'note_comment_liked'
--   * public.get_note_comments_with_likes RPC (single round-trip for
--     comments + per-comment like_count + liked_by_me)
--
-- After applying: NOTIFY pgrst, 'reload schema';
-- =======================================================================

set search_path = public;

-- -----------------------------------------------------------------------
-- 1) Table + RLS
-- -----------------------------------------------------------------------
create table if not exists public.map_note_comment_likes (
  comment_id uuid not null references public.map_note_comments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index if not exists map_note_comment_likes_comment_idx
  on public.map_note_comment_likes (comment_id);

alter table public.map_note_comment_likes enable row level security;

-- Read: anyone who can see the parent comment (i.e. the parent comment row
-- exists) can read its like rows. Comment visibility itself is enforced by
-- the comment table's own RLS, so just gating on existence is sufficient.
drop policy if exists "map_note_comment_likes: read" on public.map_note_comment_likes;
create policy "map_note_comment_likes: read"
  on public.map_note_comment_likes for select
  using (
    exists (
      select 1 from public.map_note_comments c
      where c.id = comment_id
    )
  );

drop policy if exists "map_note_comment_likes: insert own" on public.map_note_comment_likes;
create policy "map_note_comment_likes: insert own"
  on public.map_note_comment_likes for insert
  with check (auth.uid() is not null and user_id = auth.uid());

drop policy if exists "map_note_comment_likes: delete own" on public.map_note_comment_likes;
create policy "map_note_comment_likes: delete own"
  on public.map_note_comment_likes for delete
  using (auth.uid() is not null and user_id = auth.uid());

-- -----------------------------------------------------------------------
-- 2) Notification trigger: notify the comment author on like
-- -----------------------------------------------------------------------
create or replace function public.trg_notify_note_comment_liked()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid;
  v_note   uuid;
begin
  select c.user_id, c.note_id into v_author, v_note
    from public.map_note_comments c
   where c.id = NEW.comment_id;

  -- Skip self-likes and missing parent comments.
  if v_author is null or v_author = NEW.user_id then
    return NEW;
  end if;

  insert into public.notifications (user_id, type, payload)
  values (
    v_author,
    'note_comment_liked',
    jsonb_build_object(
      'note_id', v_note,
      'comment_id', NEW.comment_id,
      'actor_id', NEW.user_id
    )
  );

  return NEW;
end $$;

drop trigger if exists map_note_comment_likes_notify on public.map_note_comment_likes;
create trigger map_note_comment_likes_notify
  after insert on public.map_note_comment_likes
  for each row execute procedure public.trg_notify_note_comment_liked();

-- -----------------------------------------------------------------------
-- 3) RPC: comments + per-comment like_count + liked_by_me
-- -----------------------------------------------------------------------
create or replace function public.get_note_comments_with_likes(
  p_note_id uuid
) returns table (
  id uuid,
  created_at timestamptz,
  note_id uuid,
  user_id uuid,
  body text,
  like_count int,
  liked_by_me boolean
)
language sql
stable
as $$
  select
    c.id,
    c.created_at,
    c.note_id,
    c.user_id,
    c.body,
    coalesce(l.cnt, 0) as like_count,
    exists (
      select 1
        from public.map_note_comment_likes mine
       where mine.comment_id = c.id
         and mine.user_id = auth.uid()
    ) as liked_by_me
  from public.map_note_comments c
  left join (
    select comment_id, count(*)::int as cnt
      from public.map_note_comment_likes
     group by comment_id
  ) l on l.comment_id = c.id
  where c.note_id = p_note_id
  order by c.created_at asc;
$$;

grant execute on function public.get_note_comments_with_likes(uuid) to authenticated, anon;

notify pgrst, 'reload schema';
