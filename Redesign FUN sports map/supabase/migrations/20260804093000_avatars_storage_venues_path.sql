-- ===========================================================================
-- Allow venue photo uploads into the `avatars` bucket.
--
-- WHY
-- ---
-- 20260723092000 deliberately replaced the loose avatars policies with a
-- STRICT path allowlist — exactly three shapes are permitted:
--     <uid>/...
--     stories/<uid>/...
--     feed/(posts|reels)/<uid>/...
-- Venue photo uploads (20260804092000) write to venues/<uid>/<slug>/..., which
-- matches none of those branches and would be rejected by RLS with a bare
-- "new row violates row-level security policy". This adds the fourth branch,
-- mirroring the `stories/` shape exactly.
--
-- The uid must stay at segment 2, which is why the client slugifies the venue
-- id ("way/12345" -> "way_12345") before building the path — a raw slash would
-- shift every later segment and silently break the check.
--
-- All four policies must be replaced together: leaving SELECT out would let a
-- user upload a photo they cannot then read back.
-- ===========================================================================

drop policy if exists "avatars_authenticated_select" on storage.objects;
drop policy if exists "avatars_authenticated_insert" on storage.objects;
drop policy if exists "avatars_authenticated_update" on storage.objects;
drop policy if exists "avatars_authenticated_delete" on storage.objects;

create policy "avatars_authenticated_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'avatars'
    and (
      ((storage.foldername(name))[1] = (select auth.uid())::text)
      or (
        (storage.foldername(name))[1] = 'stories'
        and (storage.foldername(name))[2] = (select auth.uid())::text
      )
      or (
        (storage.foldername(name))[1] = 'venues'
        and (storage.foldername(name))[2] = (select auth.uid())::text
      )
      or (
        (storage.foldername(name))[1] = 'feed'
        and (storage.foldername(name))[2] = any (array['posts'::text, 'reels'::text])
        and (storage.foldername(name))[3] = (select auth.uid())::text
      )
    )
  );

create policy "avatars_authenticated_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (
      ((storage.foldername(name))[1] = (select auth.uid())::text)
      or (
        (storage.foldername(name))[1] = 'stories'
        and (storage.foldername(name))[2] = (select auth.uid())::text
      )
      or (
        (storage.foldername(name))[1] = 'venues'
        and (storage.foldername(name))[2] = (select auth.uid())::text
      )
      or (
        (storage.foldername(name))[1] = 'feed'
        and (storage.foldername(name))[2] = any (array['posts'::text, 'reels'::text])
        and (storage.foldername(name))[3] = (select auth.uid())::text
      )
    )
  );

create policy "avatars_authenticated_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (
      ((storage.foldername(name))[1] = (select auth.uid())::text)
      or (
        (storage.foldername(name))[1] = 'stories'
        and (storage.foldername(name))[2] = (select auth.uid())::text
      )
      or (
        (storage.foldername(name))[1] = 'venues'
        and (storage.foldername(name))[2] = (select auth.uid())::text
      )
      or (
        (storage.foldername(name))[1] = 'feed'
        and (storage.foldername(name))[2] = any (array['posts'::text, 'reels'::text])
        and (storage.foldername(name))[3] = (select auth.uid())::text
      )
    )
  )
  with check (
    bucket_id = 'avatars'
    and (
      ((storage.foldername(name))[1] = (select auth.uid())::text)
      or (
        (storage.foldername(name))[1] = 'stories'
        and (storage.foldername(name))[2] = (select auth.uid())::text
      )
      or (
        (storage.foldername(name))[1] = 'venues'
        and (storage.foldername(name))[2] = (select auth.uid())::text
      )
      or (
        (storage.foldername(name))[1] = 'feed'
        and (storage.foldername(name))[2] = any (array['posts'::text, 'reels'::text])
        and (storage.foldername(name))[3] = (select auth.uid())::text
      )
    )
  );

create policy "avatars_authenticated_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (
      ((storage.foldername(name))[1] = (select auth.uid())::text)
      or (
        (storage.foldername(name))[1] = 'stories'
        and (storage.foldername(name))[2] = (select auth.uid())::text
      )
      or (
        (storage.foldername(name))[1] = 'venues'
        and (storage.foldername(name))[2] = (select auth.uid())::text
      )
      or (
        (storage.foldername(name))[1] = 'feed'
        and (storage.foldername(name))[2] = any (array['posts'::text, 'reels'::text])
        and (storage.foldername(name))[3] = (select auth.uid())::text
      )
    )
  );

notify pgrst, 'reload schema';
