-- =======================================================================
-- Content visibility for feed_media_posts (Phase 1 / chunk 1)
-- =======================================================================
-- Adds a per-post audience and replaces the "read all" SELECT policy with a
-- master-gate (Instagram-style): the Public Profile toggle gates strangers.
--
--   own                          -> always visible
--   public  + public account     -> everyone (incl. logged-out)
--   public  + private account    -> squad only
--   squad                        -> squad only
--   private                      -> owner only
--
-- "Squad" = either-direction follow (matches presence/get_profiles_nearby).
-- INSERT/DELETE "own" policies already exist and are unchanged.
-- After apply: NOTIFY pgrst, 'reload schema';
-- =======================================================================

set search_path = public;

-- 1) Per-post audience.
alter table public.feed_media_posts
  add column if not exists visibility text not null default 'public';

alter table public.feed_media_posts
  drop constraint if exists feed_media_posts_visibility_check;
alter table public.feed_media_posts
  add constraint feed_media_posts_visibility_check
  check (visibility in ('public', 'squad', 'private'));

-- 2) Squad membership = either-direction follow. Follow approval (chunk 2) will
--    restrict user_follows to accepted rows; this function picks that up for free.
create or replace function public.is_squad(p_viewer uuid, p_owner uuid)
returns boolean
language sql
stable
as $$
  select p_viewer is not null and exists (
    select 1 from public.user_follows uf
     where (uf.follower_id = p_viewer and uf.followed_id = p_owner)
        or (uf.follower_id = p_owner  and uf.followed_id = p_viewer)
  );
$$;

grant execute on function public.is_squad(uuid, uuid) to anon, authenticated;

-- 3) Master-gate read policy (replaces "read all").
drop policy if exists "feed_media_posts: read all" on public.feed_media_posts;
drop policy if exists "feed_media_posts: visible" on public.feed_media_posts;
create policy "feed_media_posts: visible"
  on public.feed_media_posts for select
  using (
    user_id = auth.uid()
    or (
      visibility = 'public'
      and not coalesce(
        (select (p.athlete_profile->>'is_private')::boolean
           from public.profiles p where p.id = user_id),
        false)
    )
    or (visibility in ('public', 'squad') and public.is_squad(auth.uid(), user_id))
  );

notify pgrst, 'reload schema';
