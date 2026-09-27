-- Games become things you can talk about in public.
--
-- A game already has a conversation: `game_messages`, the private thread for the
-- people who are in it. That is the squad, and it should stay private — the
-- point of it is that you can say "running ten late" without an audience.
--
-- What is missing is the other conversation, the one that happens *before* you
-- join: "is this beginner friendly?", "is there parking?", "anyone bringing a
-- ball?". Notes already have exactly that shape (`map_note_comments`,
-- `map_note_likes`, `map_note_comment_likes`), and the feed already renders it.
-- This gives games the same three tables, the same policies and the same RPC
-- surface, so the feed card can be built from the parts that already exist
-- rather than from a second, differently-shaped system.
--
-- Two tables' worth of deliberate design:
--
--  * Everything delegates to the games read policy. `exists (select 1 from
--    public.games g where g.id = ...)` runs under the caller's own rights, so
--    whatever `games: readable by viewers it is meant for` decides about the
--    game decides about its comments too. A comment on an invite-only game is
--    invisible to someone who cannot see the game, without this migration
--    knowing anything about visibility.
--
--  * Comments are `to authenticated` for read, not `to public`. Guests browse
--    the map and see what is happening; they do not see who said what. The
--    `get_guest_game_comments` wrapper below gives them the text with no
--    `user_id`, which is the same bargain every other guest read makes.
--
-- Depends on: 20260922120000_game_read_visibility_and_invite_tokens (for the
-- games read policy these delegate to). Safe to apply before it — the delegation
-- is written against whatever policy is in place.

-- ---------------------------------------------------------------------------
-- 1) Tables
-- ---------------------------------------------------------------------------

create table if not exists public.game_comments (
  id         uuid primary key default gen_random_uuid(),
  game_id    uuid not null references public.games(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now()
);

create index if not exists game_comments_game_idx on public.game_comments (game_id, created_at);
create index if not exists game_comments_user_idx on public.game_comments (user_id);

create table if not exists public.game_comment_likes (
  comment_id uuid not null references public.game_comments(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index if not exists game_comment_likes_user_idx on public.game_comment_likes (user_id);

create table if not exists public.game_likes (
  game_id    uuid not null references public.games(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (game_id, user_id)
);

create index if not exists game_likes_user_idx on public.game_likes (user_id);

comment on table public.game_comments is
  'Public conversation on a game, for people deciding whether to join. Distinct from '
  'game_messages, which is the private thread for people who already have.';

-- ---------------------------------------------------------------------------
-- 2) RLS — every rule delegates to "can this viewer see the game?"
-- ---------------------------------------------------------------------------

alter table public.game_comments      enable row level security;
alter table public.game_comment_likes enable row level security;
alter table public.game_likes         enable row level security;

drop policy if exists "game_comments: read if can see game"      on public.game_comments;
drop policy if exists "game_comments: insert own if can see game" on public.game_comments;
drop policy if exists "game_comments: delete own"                 on public.game_comments;

create policy "game_comments: read if can see game"
  on public.game_comments as permissive for select to authenticated
  using (exists (select 1 from public.games g where g.id = game_comments.game_id));

create policy "game_comments: insert own if can see game"
  on public.game_comments as permissive for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.games g where g.id = game_comments.game_id)
  );

-- No update policy on purpose: an edited comment under a decision someone else
-- already made is worse than a deleted one. Delete and say it again.
create policy "game_comments: delete own"
  on public.game_comments as permissive for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "game_comment_likes: read"       on public.game_comment_likes;
drop policy if exists "game_comment_likes: insert own" on public.game_comment_likes;
drop policy if exists "game_comment_likes: delete own" on public.game_comment_likes;

create policy "game_comment_likes: read"
  on public.game_comment_likes as permissive for select to authenticated
  using (exists (select 1 from public.game_comments c where c.id = game_comment_likes.comment_id));

create policy "game_comment_likes: insert own"
  on public.game_comment_likes as permissive for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.game_comments c where c.id = game_comment_likes.comment_id)
  );

create policy "game_comment_likes: delete own"
  on public.game_comment_likes as permissive for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "game_likes: read"       on public.game_likes;
drop policy if exists "game_likes: insert own" on public.game_likes;
drop policy if exists "game_likes: delete own" on public.game_likes;

create policy "game_likes: read"
  on public.game_likes as permissive for select to authenticated
  using (exists (select 1 from public.games g where g.id = game_likes.game_id));

create policy "game_likes: insert own"
  on public.game_likes as permissive for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.games g where g.id = game_likes.game_id)
  );

create policy "game_likes: delete own"
  on public.game_likes as permissive for delete to authenticated
  using (user_id = (select auth.uid()));

-- Table privileges. `anon` gets nothing at all: a guest reads comments only
-- through the wrapper at the end of this file, which strips the author.
revoke all on public.game_comments      from public, anon;
revoke all on public.game_comment_likes from public, anon;
revoke all on public.game_likes         from public, anon;

grant select, insert, delete on public.game_comments      to authenticated;
grant select, insert, delete on public.game_comment_likes to authenticated;
grant select, insert, delete on public.game_likes         to authenticated;

grant all on public.game_comments      to service_role;
grant all on public.game_comment_likes to service_role;
grant all on public.game_likes         to service_role;

-- ---------------------------------------------------------------------------
-- 3) Reads
-- ---------------------------------------------------------------------------

-- SECURITY INVOKER: the policies above are the access rule, and this must not
-- be a way around them.
create or replace function public.get_game_comments_with_likes(p_game_id uuid)
returns table (
  id          uuid,
  created_at  timestamptz,
  game_id     uuid,
  user_id     uuid,
  body        text,
  like_count  int,
  liked_by_me boolean
)
language sql
stable
security invoker
set search_path to 'public'
as $function$
  select
    c.id,
    c.created_at,
    c.game_id,
    c.user_id,
    c.body,
    coalesce(l.cnt, 0) as like_count,
    exists (
      select 1 from public.game_comment_likes mine
       where mine.comment_id = c.id and mine.user_id = (select auth.uid())
    ) as liked_by_me
  from public.game_comments c
  left join (
    select comment_id, count(*)::int as cnt
      from public.game_comment_likes
     group by comment_id
  ) l on l.comment_id = c.id
  where c.game_id = p_game_id
  order by c.created_at asc;
$function$;

revoke execute on function public.get_game_comments_with_likes(uuid) from public, anon;
grant execute on function public.get_game_comments_with_likes(uuid) to authenticated, service_role;

-- What a game card needs in one round-trip, for a set of games.
create or replace function public.get_game_social_counts(p_game_ids uuid[])
returns table (
  game_id       uuid,
  comment_count int,
  like_count    int,
  liked_by_me   boolean
)
language sql
stable
security invoker
set search_path to 'public'
as $function$
  select
    g.id as game_id,
    coalesce(c.cnt, 0) as comment_count,
    coalesce(l.cnt, 0) as like_count,
    coalesce(l.mine, false) as liked_by_me
  from public.games g
  left join (
    select gc.game_id, count(*)::int as cnt
      from public.game_comments gc
     where gc.game_id = any(p_game_ids)
     group by gc.game_id
  ) c on c.game_id = g.id
  left join (
    select gl.game_id,
           count(*)::int as cnt,
           bool_or(gl.user_id = (select auth.uid())) as mine
      from public.game_likes gl
     where gl.game_id = any(p_game_ids)
     group by gl.game_id
  ) l on l.game_id = g.id
  where g.id = any(p_game_ids);
$function$;

revoke execute on function public.get_game_social_counts(uuid[]) from public, anon;
grant execute on function public.get_game_social_counts(uuid[]) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4) Writes
-- ---------------------------------------------------------------------------

create or replace function public.add_game_comment(p_game_id uuid, p_body text)
returns public.game_comments
language plpgsql
security invoker
set search_path to 'public'
as $function$
declare
  v_uid  uuid := (select auth.uid());
  v_row  public.game_comments;
  v_body text := trim(coalesce(p_body, ''));
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if v_body = '' then raise exception 'empty_body' using errcode = '22023'; end if;
  if length(v_body) > 2000 then v_body := left(v_body, 2000); end if;

  -- The insert policy decides whether this game is one the viewer may comment on.
  insert into public.game_comments (game_id, user_id, body)
  values (p_game_id, v_uid, v_body)
  returning * into v_row;

  return v_row;
end $function$;

revoke execute on function public.add_game_comment(uuid, text) from public, anon;
grant execute on function public.add_game_comment(uuid, text) to authenticated, service_role;

create or replace function public.delete_game_comment(p_comment_id uuid)
returns boolean
language plpgsql
security invoker
set search_path to 'public'
as $function$
declare
  v_n int;
begin
  if (select auth.uid()) is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  -- The delete policy already restricts this to your own comments; the filter is
  -- here so the boolean means "yours, and gone" rather than "nothing matched".
  delete from public.game_comments
   where id = p_comment_id and user_id = (select auth.uid());
  get diagnostics v_n = row_count;
  return v_n > 0;
end $function$;

revoke execute on function public.delete_game_comment(uuid) from public, anon;
grant execute on function public.delete_game_comment(uuid) to authenticated, service_role;

-- Both toggles return the state AFTER the toggle, so the caller can set its own
-- optimistic UI straight from the answer.
create or replace function public.toggle_game_comment_like(p_comment_id uuid)
returns boolean
language plpgsql
security invoker
set search_path to 'public'
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_n   int;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;

  delete from public.game_comment_likes
   where comment_id = p_comment_id and user_id = v_uid;
  get diagnostics v_n = row_count;
  if v_n > 0 then return false; end if;

  insert into public.game_comment_likes (comment_id, user_id)
  values (p_comment_id, v_uid)
  on conflict do nothing;
  return true;
end $function$;

revoke execute on function public.toggle_game_comment_like(uuid) from public, anon;
grant execute on function public.toggle_game_comment_like(uuid) to authenticated, service_role;

create or replace function public.toggle_game_like(p_game_id uuid)
returns boolean
language plpgsql
security invoker
set search_path to 'public'
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_n   int;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;

  delete from public.game_likes where game_id = p_game_id and user_id = v_uid;
  get diagnostics v_n = row_count;
  if v_n > 0 then return false; end if;

  insert into public.game_likes (game_id, user_id)
  values (p_game_id, v_uid)
  on conflict do nothing;
  return true;
end $function$;

revoke execute on function public.toggle_game_like(uuid) from public, anon;
grant execute on function public.toggle_game_like(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5) The guest read
-- ---------------------------------------------------------------------------
-- Same bargain as every other get_guest_*: what was said, never who said it, and
-- only for a game a guest may see at all. SECURITY DEFINER because a guest holds
-- no privilege on the tables — the filter below is what keeps that honest.

create or replace function public.get_guest_game_comments(p_game_id uuid)
returns table (
  id          uuid,
  created_at  timestamptz,
  game_id     uuid,
  user_id     uuid,
  body        text,
  like_count  int,
  liked_by_me boolean
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    c.id,
    c.created_at,
    c.game_id,
    null::uuid as user_id,
    c.body,
    coalesce(l.cnt, 0) as like_count,
    false as liked_by_me
  from public.game_comments c
  left join (
    select comment_id, count(*)::int as cnt
      from public.game_comment_likes
     group by comment_id
  ) l on l.comment_id = c.id
  -- A definer function sees every row, so the visibility rule has to be restated:
  -- guests get public games only, which is exactly what get_guest_games_nearby
  -- puts on their map.
  where c.game_id = p_game_id
    and exists (
      select 1 from public.games g
       where g.id = c.game_id
         and coalesce(g.visibility, 'public') = 'public'
         and g.status not in ('completed', 'cancelled')
    )
  order by c.created_at asc;
$function$;

revoke execute on function public.get_guest_game_comments(uuid) from public;
grant execute on function public.get_guest_game_comments(uuid) to anon, authenticated;

notify pgrst, 'reload schema';

-- Verification matrix (run each as anon, as a member who can see the game, and
-- as a member who cannot):
--   select * from public.get_game_comments_with_likes('<public game>');   -- member: rows; anon: 42501
--   select * from public.get_guest_game_comments('<public game>');        -- anon: rows, user_id null
--   select * from public.get_guest_game_comments('<invite-only game>');   -- anon: zero rows
--   select public.add_game_comment('<game you cannot see>', 'hi');        -- expect 42501 from the policy
--   select public.toggle_game_like('<public game>');                      -- true, then false
--   select * from public.get_game_social_counts(array['<g1>','<g2>']::uuid[]);
