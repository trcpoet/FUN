-- =======================================================================
-- Backfill: profile JSON media posts -> feed_media_posts (Phase 1 / chunk 1)
-- =======================================================================
-- Profile posts were historically stored only in athlete_profile.posts JSON and
-- never reached the feed table. Lift media posts (those with a mediaUrl in the
-- avatars bucket) into feed_media_posts as 'public'. Idempotent: re-running skips
-- rows already present (matched by user_id + storage_path). On a fresh DB with no
-- JSON data this is a no-op.
-- =======================================================================

set search_path = public;

insert into public.feed_media_posts (user_id, storage_path, body, visibility, created_at)
select
  p.id,
  split_part(post->>'mediaUrl', '/avatars/', 2) as storage_path,
  nullif(btrim(coalesce(post->>'caption', '')), '') as body,
  'public',
  now()
from public.profiles p
cross join lateral jsonb_array_elements(coalesce(p.athlete_profile->'posts', '[]'::jsonb)) as post
where coalesce(post->>'mediaUrl', '') like '%/avatars/%'
  and not exists (
    select 1 from public.feed_media_posts f
    where f.user_id = p.id
      and f.storage_path = split_part(post->>'mediaUrl', '/avatars/', 2)
  );

notify pgrst, 'reload schema';
