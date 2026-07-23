-- Loop 2: RLS auth.uid() initplan optimization + missing FK indexes.
-- Also close residual start_game anon EXECUTE missed in Loop 1.

-- ---------------------------------------------------------------------------
-- 0) start_game grant hardening (residual from Loop 1)
-- ---------------------------------------------------------------------------
revoke execute on function public.start_game(uuid) from public, anon;
grant execute on function public.start_game(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 1) Missing FK covering indexes
-- ---------------------------------------------------------------------------
create index if not exists dm_messages_user_id_idx on public.dm_messages (user_id);
create index if not exists feed_media_post_comments_user_id_idx on public.feed_media_post_comments (user_id);
create index if not exists feed_media_post_likes_user_id_idx on public.feed_media_post_likes (user_id);
create index if not exists feed_media_posts_user_id_idx on public.feed_media_posts (user_id);
create index if not exists game_chat_invites_invited_by_user_id_idx on public.game_chat_invites (invited_by_user_id);
create index if not exists game_messages_user_id_idx on public.game_messages (user_id);
create index if not exists games_created_by_idx on public.games (created_by);
create index if not exists map_note_comment_likes_user_id_idx on public.map_note_comment_likes (user_id);
create index if not exists map_note_likes_user_id_idx on public.map_note_likes (user_id);
create index if not exists status_comments_user_id_idx on public.status_comments (user_id);
create index if not exists status_likes_user_id_idx on public.status_likes (user_id);
create index if not exists user_badges_badge_id_idx on public.user_badges (badge_id);

-- ---------------------------------------------------------------------------
-- 2) Rewrite policies: (select auth.uid()) + TO authenticated for writes
-- ---------------------------------------------------------------------------

-- athlete_endorsements
drop policy if exists "athlete_endorsements_insert_games_only" on public.athlete_endorsements;
drop policy if exists "athlete_endorsements_update_owner" on public.athlete_endorsements;

create policy "athlete_endorsements_insert_games_only"
  on public.athlete_endorsements for insert to authenticated
  with check (
    ((select auth.uid()) = endorser_id)
    and (exists (
      select 1
      from games g
      join game_participants me on me.game_id = g.id and me.user_id = (select auth.uid())
      join game_participants them on them.game_id = g.id and them.user_id = athlete_endorsements.athlete_id
      where g.id = athlete_endorsements.game_id and g.status = 'completed'
    ))
  );

create policy "athlete_endorsements_update_owner"
  on public.athlete_endorsements for update to authenticated
  using ((select auth.uid()) = endorser_id)
  with check (
    ((select auth.uid()) = endorser_id)
    and (exists (
      select 1
      from games g
      join game_participants me on me.game_id = g.id and me.user_id = (select auth.uid())
      join game_participants them on them.game_id = g.id and them.user_id = athlete_endorsements.athlete_id
      where g.id = athlete_endorsements.game_id and g.status = 'completed'
    ))
  );

-- dm_messages
drop policy if exists "dm_messages_insert_members" on public.dm_messages;
drop policy if exists "dm_messages_select_members" on public.dm_messages;

create policy "dm_messages_select_members"
  on public.dm_messages for select to authenticated
  using (exists (
    select 1 from dm_thread_members m
    where m.thread_id = dm_messages.thread_id and m.user_id = (select auth.uid())
  ));

create policy "dm_messages_insert_members"
  on public.dm_messages for insert to authenticated
  with check (
    ((select auth.uid()) = user_id)
    and (exists (
      select 1 from dm_thread_members m
      where m.thread_id = dm_messages.thread_id and m.user_id = (select auth.uid())
    ))
  );

-- dm_thread_members
drop policy if exists "dm_thread_members_insert_self" on public.dm_thread_members;
drop policy if exists "dm_thread_members_select_self" on public.dm_thread_members;

create policy "dm_thread_members_select_self"
  on public.dm_thread_members for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "dm_thread_members_insert_self"
  on public.dm_thread_members for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- dm_threads
drop policy if exists "dm_threads_select_members" on public.dm_threads;

create policy "dm_threads_select_members"
  on public.dm_threads for select to authenticated
  using (exists (
    select 1 from dm_thread_members m
    where m.thread_id = dm_threads.id and m.user_id = (select auth.uid())
  ));

-- feed_media_post_comments
drop policy if exists "post_comments: delete own" on public.feed_media_post_comments;
drop policy if exists "post_comments: insert own" on public.feed_media_post_comments;
drop policy if exists "post_comments: read" on public.feed_media_post_comments;

create policy "post_comments: read"
  on public.feed_media_post_comments for select to anon, authenticated
  using (true);

create policy "post_comments: insert own"
  on public.feed_media_post_comments for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "post_comments: delete own"
  on public.feed_media_post_comments for delete to authenticated
  using ((select auth.uid()) = user_id);

-- feed_media_post_likes
drop policy if exists "post_likes: delete own" on public.feed_media_post_likes;
drop policy if exists "post_likes: insert own" on public.feed_media_post_likes;
drop policy if exists "post_likes: read" on public.feed_media_post_likes;

create policy "post_likes: read"
  on public.feed_media_post_likes for select to anon, authenticated
  using (true);

create policy "post_likes: insert own"
  on public.feed_media_post_likes for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "post_likes: delete own"
  on public.feed_media_post_likes for delete to authenticated
  using ((select auth.uid()) = user_id);

-- feed_media_posts
drop policy if exists "feed_media_posts: delete own" on public.feed_media_posts;
drop policy if exists "feed_media_posts: insert own" on public.feed_media_posts;
drop policy if exists "feed_media_posts: visible" on public.feed_media_posts;

create policy "feed_media_posts: visible"
  on public.feed_media_posts for select to anon, authenticated
  using (
    (user_id = (select auth.uid()))
    or (
      (visibility = 'public')
      and (not coalesce((
        select ((p.athlete_profile ->> 'is_private')::boolean)
        from profiles p where p.id = feed_media_posts.user_id
      ), false))
    )
    or (
      (visibility = any (array['public'::text, 'squad'::text]))
      and is_squad((select auth.uid()), user_id)
    )
  );

create policy "feed_media_posts: insert own"
  on public.feed_media_posts for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "feed_media_posts: delete own"
  on public.feed_media_posts for delete to authenticated
  using ((select auth.uid()) = user_id);

-- game_chat_invites
drop policy if exists "game_chat_invites: insert via rpc only" on public.game_chat_invites;
drop policy if exists "game_chat_invites: read participants" on public.game_chat_invites;

create policy "game_chat_invites: read participants"
  on public.game_chat_invites for select to authenticated
  using (
    ((select auth.uid()) = invitee_user_id)
    or ((select auth.uid()) = invited_by_user_id)
    or (exists (
      select 1 from games g
      where g.id = game_chat_invites.game_id and g.created_by = (select auth.uid())
    ))
  );

create policy "game_chat_invites: insert via rpc only"
  on public.game_chat_invites for insert to authenticated
  with check (false);

-- game_messages
drop policy if exists "game_messages_insert_participants" on public.game_messages;
drop policy if exists "game_messages_select_participants" on public.game_messages;

create policy "game_messages_select_participants"
  on public.game_messages for select to authenticated
  using (exists (
    select 1 from game_participants gp
    where gp.game_id = game_messages.game_id and gp.user_id = (select auth.uid())
  ));

create policy "game_messages_insert_participants"
  on public.game_messages for insert to authenticated
  with check (
    ((select auth.uid()) = user_id)
    and (exists (
      select 1 from game_participants gp
      where gp.game_id = game_messages.game_id and gp.user_id = (select auth.uid())
    ))
  );

-- game_participants
drop policy if exists "Authenticated users can join games" on public.game_participants;
drop policy if exists "Users can delete own participation" on public.game_participants;
-- keep public SELECT (everyone can view)

create policy "Authenticated users can join games"
  on public.game_participants for insert to authenticated
  with check (true);

create policy "Users can delete own participation"
  on public.game_participants for delete to authenticated
  using ((select auth.uid()) = user_id);

-- games
drop policy if exists "Authenticated users can create games" on public.games;
drop policy if exists "Hosts can delete own games" on public.games;

create policy "Authenticated users can create games"
  on public.games for insert to authenticated
  with check (true);

create policy "Hosts can delete own games"
  on public.games for delete to authenticated
  using ((select auth.uid()) = created_by);

-- map_note_comment_likes
drop policy if exists "map_note_comment_likes: delete own" on public.map_note_comment_likes;
drop policy if exists "map_note_comment_likes: insert own" on public.map_note_comment_likes;

create policy "map_note_comment_likes: insert own"
  on public.map_note_comment_likes for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "map_note_comment_likes: delete own"
  on public.map_note_comment_likes for delete to authenticated
  using ((select auth.uid()) = user_id);

-- map_note_comments
drop policy if exists "map_note_comments: delete own" on public.map_note_comments;
drop policy if exists "map_note_comments: insert own if can see note" on public.map_note_comments;

create policy "map_note_comments: insert own if can see note"
  on public.map_note_comments for insert to authenticated
  with check (
    ((select auth.uid()) = user_id)
    and (exists (select 1 from map_notes n where n.id = map_note_comments.note_id))
  );

create policy "map_note_comments: delete own"
  on public.map_note_comments for delete to authenticated
  using ((select auth.uid()) = user_id);

-- map_note_likes
drop policy if exists "map_note_likes: delete own" on public.map_note_likes;
drop policy if exists "map_note_likes: insert own" on public.map_note_likes;

create policy "map_note_likes: insert own"
  on public.map_note_likes for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "map_note_likes: delete own"
  on public.map_note_likes for delete to authenticated
  using ((select auth.uid()) = user_id);

-- map_notes
drop policy if exists "map_notes: delete own" on public.map_notes;
drop policy if exists "map_notes: insert own" on public.map_notes;
drop policy if exists "map_notes: read visible" on public.map_notes;
drop policy if exists "map_notes: update own" on public.map_notes;

create policy "map_notes: read visible"
  on public.map_notes for select to anon, authenticated
  using (
    (visibility = 'public')
    or ((select auth.uid()) is not null and created_by = (select auth.uid()))
    or (
      visibility = 'friends'
      and (select auth.uid()) is not null
      and (
        exists (
          select 1 from user_follows
          where follower_id = (select auth.uid()) and followed_id = map_notes.created_by
        )
        or exists (
          select 1 from user_follows
          where follower_id = map_notes.created_by and followed_id = (select auth.uid())
        )
      )
    )
  );

create policy "map_notes: insert own"
  on public.map_notes for insert to authenticated
  with check ((select auth.uid()) = created_by);

create policy "map_notes: update own"
  on public.map_notes for update to authenticated
  using ((select auth.uid()) = created_by)
  with check ((select auth.uid()) = created_by);

create policy "map_notes: delete own"
  on public.map_notes for delete to authenticated
  using ((select auth.uid()) = created_by);

-- profile_locations (writes)
drop policy if exists "Users can insert own profile location" on public.profile_locations;
drop policy if exists "Users can update own profile location" on public.profile_locations;

create policy "Users can insert own profile location"
  on public.profile_locations for insert to authenticated
  with check ((select auth.uid()) = profile_id);

create policy "Users can update own profile location"
  on public.profile_locations for update to authenticated
  using ((select auth.uid()) = profile_id)
  with check ((select auth.uid()) = profile_id);

-- profiles
drop policy if exists "Users can insert own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;

create policy "Users can insert own profile"
  on public.profiles for insert to authenticated
  with check ((select auth.uid()) = id);

create policy "Users can update own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- status_comments
drop policy if exists "status_comments: delete own" on public.status_comments;
drop policy if exists "status_comments: insert own" on public.status_comments;

create policy "status_comments: insert own"
  on public.status_comments for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "status_comments: delete own"
  on public.status_comments for delete to authenticated
  using ((select auth.uid()) = user_id);

-- status_likes
drop policy if exists "status_likes: delete own" on public.status_likes;
drop policy if exists "status_likes: insert own" on public.status_likes;

create policy "status_likes: insert own"
  on public.status_likes for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "status_likes: delete own"
  on public.status_likes for delete to authenticated
  using ((select auth.uid()) = user_id);

-- status_updates
drop policy if exists "status_updates_insert_owner" on public.status_updates;
drop policy if exists "status_updates_update_owner" on public.status_updates;

create policy "status_updates_insert_owner"
  on public.status_updates for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "status_updates_update_owner"
  on public.status_updates for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- user_follows
drop policy if exists "user_follows: delete own" on public.user_follows;
drop policy if exists "user_follows: insert own" on public.user_follows;

create policy "user_follows: insert own"
  on public.user_follows for insert to authenticated
  with check ((select auth.uid()) = follower_id);

create policy "user_follows: delete own"
  on public.user_follows for delete to authenticated
  using ((select auth.uid()) = follower_id);

-- user_stats
drop policy if exists "User stats readable by owner" on public.user_stats;

create policy "User stats readable by owner"
  on public.user_stats for select to authenticated
  using ((select auth.uid()) = user_id);

-- user_statuses
drop policy if exists "user_statuses: delete own" on public.user_statuses;
drop policy if exists "user_statuses: insert own" on public.user_statuses;

create policy "user_statuses: insert own"
  on public.user_statuses for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "user_statuses: delete own"
  on public.user_statuses for delete to authenticated
  using ((select auth.uid()) = user_id);
