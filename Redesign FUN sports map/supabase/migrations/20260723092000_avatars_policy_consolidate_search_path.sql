-- Loop 3: Consolidate avatars storage policies + pin mutable search_path.

-- ---------------------------------------------------------------------------
-- 1) Drop duplicate / looser avatars_auth_* policies
-- ---------------------------------------------------------------------------
drop policy if exists "avatars_auth_insert" on storage.objects;
drop policy if exists "avatars_auth_update" on storage.objects;
drop policy if exists "avatars_auth_delete" on storage.objects;

-- ---------------------------------------------------------------------------
-- 2) Replace avatars_authenticated_* with initplan-safe + strict paths
--    Path shapes: <uid>/… | stories/<uid>/… | feed/(posts|reels)/<uid>/…
-- ---------------------------------------------------------------------------
drop policy if exists "avatars_authenticated_insert" on storage.objects;
drop policy if exists "avatars_authenticated_update" on storage.objects;
drop policy if exists "avatars_authenticated_delete" on storage.objects;
drop policy if exists "avatars_authenticated_select" on storage.objects;

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
        (storage.foldername(name))[1] = 'feed'
        and (storage.foldername(name))[2] = any (array['posts'::text, 'reels'::text])
        and (storage.foldername(name))[3] = (select auth.uid())::text
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 3) Pin search_path on is_squad / get_post_comments
-- ---------------------------------------------------------------------------
create or replace function public.is_squad(p_viewer uuid, p_owner uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select p_viewer is not null and exists (
    select 1 from public.user_follows uf
     where uf.status = 'accepted'
       and ((uf.follower_id = p_viewer and uf.followed_id = p_owner)
         or (uf.follower_id = p_owner  and uf.followed_id = p_viewer))
  );
$$;

create or replace function public.get_post_comments(p_post_id uuid)
returns table(id uuid, created_at timestamptz, post_id uuid, user_id uuid, body text)
language sql
stable
set search_path = public
as $$
  select c.id, c.created_at, c.post_id, c.user_id, c.body
    from public.feed_media_post_comments c
   where c.post_id = p_post_id
   order by c.created_at asc;
$$;

revoke execute on function public.get_post_comments(uuid) from public, anon;
grant execute on function public.get_post_comments(uuid) to authenticated;

-- is_squad is referenced from RLS on public feed reads — both API roles need EXECUTE
revoke execute on function public.is_squad(uuid, uuid) from public;
grant execute on function public.is_squad(uuid, uuid) to anon, authenticated;
