-- =======================================================================
-- Likes + comments on feed media posts (Phase D) — mirrors status_likes/comments
-- =======================================================================
-- read = true (post rows themselves are already audience-gated by the
-- feed_media_posts master-gate policy); insert/delete = own. After apply:
-- NOTIFY pgrst, 'reload schema';
-- =======================================================================

set search_path = public;

-- ---- Likes -------------------------------------------------------------
create table if not exists public.feed_media_post_likes (
  post_id uuid not null references public.feed_media_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index if not exists feed_media_post_likes_post_idx
  on public.feed_media_post_likes (post_id);

alter table public.feed_media_post_likes enable row level security;

drop policy if exists "post_likes: read" on public.feed_media_post_likes;
create policy "post_likes: read" on public.feed_media_post_likes for select using (true);

drop policy if exists "post_likes: insert own" on public.feed_media_post_likes;
create policy "post_likes: insert own" on public.feed_media_post_likes for insert
  with check (auth.uid() is not null and user_id = auth.uid());

drop policy if exists "post_likes: delete own" on public.feed_media_post_likes;
create policy "post_likes: delete own" on public.feed_media_post_likes for delete
  using (auth.uid() is not null and user_id = auth.uid());

-- ---- Comments ----------------------------------------------------------
create table if not exists public.feed_media_post_comments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  post_id uuid not null references public.feed_media_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null
);
create index if not exists feed_media_post_comments_post_created_idx
  on public.feed_media_post_comments (post_id, created_at asc);

alter table public.feed_media_post_comments enable row level security;

drop policy if exists "post_comments: read" on public.feed_media_post_comments;
create policy "post_comments: read" on public.feed_media_post_comments for select using (true);

drop policy if exists "post_comments: insert own" on public.feed_media_post_comments;
create policy "post_comments: insert own" on public.feed_media_post_comments for insert
  with check (auth.uid() is not null and user_id = auth.uid());

drop policy if exists "post_comments: delete own" on public.feed_media_post_comments;
create policy "post_comments: delete own" on public.feed_media_post_comments for delete
  using (auth.uid() is not null and user_id = auth.uid());

create or replace function public.add_post_comment(p_post_id uuid, p_body text)
returns public.feed_media_post_comments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.feed_media_post_comments;
  v_body text := trim(coalesce(p_body, ''));
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if v_body = '' then raise exception 'empty_body' using errcode = '22023'; end if;
  if length(v_body) > 2000 then v_body := left(v_body, 2000); end if;
  insert into public.feed_media_post_comments (post_id, user_id, body)
  values (p_post_id, v_uid, v_body)
  returning * into v_row;
  return v_row;
end $$;

create or replace function public.get_post_comments(p_post_id uuid)
returns table (id uuid, created_at timestamptz, post_id uuid, user_id uuid, body text)
language sql
stable
as $$
  select c.id, c.created_at, c.post_id, c.user_id, c.body
    from public.feed_media_post_comments c
   where c.post_id = p_post_id
   order by c.created_at asc;
$$;

grant execute on function public.add_post_comment(uuid, text) to authenticated;
grant execute on function public.get_post_comments(uuid) to authenticated, anon;

notify pgrst, 'reload schema';
