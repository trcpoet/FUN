-- =======================================================================
-- Follow approval (visibility chunk 2)
-- =======================================================================
-- Adds pending/accepted state so a private account's "squad" can't be joined
-- by a stranger just following them. Public accounts stay instant-accept.
-- Existing rows default to 'accepted' (no behavior change for current follows).
-- After apply: NOTIFY pgrst, 'reload schema';
-- =======================================================================

set search_path = public;

alter table public.user_follows
  add column if not exists status text not null default 'accepted'
  check (status in ('pending', 'accepted'));

create index if not exists user_follows_followed_status_idx
  on public.user_follows (followed_id, status);

-- Squad = an ACCEPTED either-direction follow.
create or replace function public.is_squad(p_viewer uuid, p_owner uuid)
returns boolean
language sql
stable
as $$
  select p_viewer is not null and exists (
    select 1 from public.user_follows uf
     where uf.status = 'accepted'
       and ((uf.follower_id = p_viewer and uf.followed_id = p_owner)
         or (uf.follower_id = p_owner  and uf.followed_id = p_viewer))
  );
$$;

-- Follow request: instant-accept for public targets, pending for private ones.
create or replace function public.request_follow(p_target uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_private boolean;
  v_status text;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if v_uid = p_target then raise exception 'cannot_follow_self' using errcode = '22023'; end if;
  select coalesce((athlete_profile->>'is_private')::boolean, false) into v_private
    from public.profiles where id = p_target;
  v_status := case when coalesce(v_private, false) then 'pending' else 'accepted' end;
  insert into public.user_follows (follower_id, followed_id, status)
  values (v_uid, p_target, v_status)
  on conflict (follower_id, followed_id)
    do update set status = excluded.status
    where public.user_follows.status = 'pending';
  return v_status;
end $$;

-- Owner accepts (status -> accepted) or rejects (delete) a pending request.
create or replace function public.respond_follow_request(p_follower uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if p_accept then
    update public.user_follows set status = 'accepted'
     where follower_id = p_follower and followed_id = v_uid and status = 'pending';
  else
    delete from public.user_follows
     where follower_id = p_follower and followed_id = v_uid and status = 'pending';
  end if;
end $$;

-- Incoming pending requests for the current user (with requester identity).
create or replace function public.get_follow_requests()
returns table (follower_id uuid, display_name text, avatar_url text, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select uf.follower_id, p.display_name, p.avatar_url, uf.created_at
    from public.user_follows uf
    join public.profiles p on p.id = uf.follower_id
   where uf.followed_id = auth.uid() and uf.status = 'pending'
   order by uf.created_at desc;
$$;

grant execute on function public.request_follow(uuid) to authenticated;
grant execute on function public.respond_follow_request(uuid, boolean) to authenticated;
grant execute on function public.get_follow_requests() to authenticated;

notify pgrst, 'reload schema';
