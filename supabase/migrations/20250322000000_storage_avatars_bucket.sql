-- Storage: public `avatars` bucket + RLS so authenticated users can upload profile media.
-- Fixes HTTP 400 on POST /storage/v1/object/avatars/... when the bucket or policies were never created.
-- Safe to re-run (idempotent policy names).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  52428800, -- 50 MB; adjust in Dashboard if needed
  null
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = coalesce(storage.buckets.file_size_limit, excluded.file_size_limit);

-- Read: anyone can fetch public URLs (bucket is public).
drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read"
on storage.objects for select
to public
using (bucket_id = 'avatars');

-- Helper paths used by the app:
--   {user_id}/{file}           — 2D profile photo (uploadAvatarImage)
--   stories/{user_id}/{file}   — story media
--   feed/posts/{user_id}/{file} | feed/reels/{user_id}/{file} — posts & reels

drop policy if exists "avatars_authenticated_insert" on storage.objects;
create policy "avatars_authenticated_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or (
      (storage.foldername(name))[1] = 'stories'
      and (storage.foldername(name))[2] = auth.uid()::text
    )
    or (
      (storage.foldername(name))[1] = 'feed'
      and (storage.foldername(name))[2] in ('posts', 'reels')
      and (storage.foldername(name))[3] = auth.uid()::text
    )
  )
);

drop policy if exists "avatars_authenticated_update" on storage.objects;
create policy "avatars_authenticated_update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'avatars'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or (
      (storage.foldername(name))[1] = 'stories'
      and (storage.foldername(name))[2] = auth.uid()::text
    )
    or (
      (storage.foldername(name))[1] = 'feed'
      and (storage.foldername(name))[2] in ('posts', 'reels')
      and (storage.foldername(name))[3] = auth.uid()::text
    )
  )
)
with check (
  bucket_id = 'avatars'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or (
      (storage.foldername(name))[1] = 'stories'
      and (storage.foldername(name))[2] = auth.uid()::text
    )
    or (
      (storage.foldername(name))[1] = 'feed'
      and (storage.foldername(name))[2] in ('posts', 'reels')
      and (storage.foldername(name))[3] = auth.uid()::text
    )
  )
);

drop policy if exists "avatars_authenticated_delete" on storage.objects;
create policy "avatars_authenticated_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or (
      (storage.foldername(name))[1] = 'stories'
      and (storage.foldername(name))[2] = auth.uid()::text
    )
    or (
      (storage.foldername(name))[1] = 'feed'
      and (storage.foldername(name))[2] in ('posts', 'reels')
      and (storage.foldername(name))[3] = auth.uid()::text
    )
  )
);
