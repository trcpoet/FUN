-- Restore upload RLS for the public `avatars` bucket.
--
-- The original bucket + upload-policy migration (20250322000000_storage_avatars_bucket.sql)
-- is not part of this repo's curated migration baseline, and the project is missing the
-- INSERT/UPDATE policies — so authenticated uploads fail with
-- "new row violates row-level security policy" (avatar change, story + feed media).
--
-- The `avatars` bucket stores several path shapes, all containing the owner's uid:
--   • avatar : <uid>/<file>
--   • stories: stories/<uid>/<file>
--   • feed   : feed/(posts|reels)/<uid>/<file>
-- so we require the caller's uid to be one of the object's folder segments.
-- (Avatar upload uses upsert:true → INSERT + UPDATE both required.)
--
-- Public reads stay via getPublicUrl() (CDN, RLS-exempt); no SELECT policy is
-- re-added on purpose — see 20260618083000_avatars_drop_listing.sql.

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "avatars_auth_insert" on storage.objects;
create policy "avatars_auth_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and auth.uid()::text = any (storage.foldername(name))
  );

drop policy if exists "avatars_auth_update" on storage.objects;
create policy "avatars_auth_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = any (storage.foldername(name))
  )
  with check (
    bucket_id = 'avatars'
    and auth.uid()::text = any (storage.foldername(name))
  );

drop policy if exists "avatars_auth_delete" on storage.objects;
create policy "avatars_auth_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = any (storage.foldername(name))
  );
