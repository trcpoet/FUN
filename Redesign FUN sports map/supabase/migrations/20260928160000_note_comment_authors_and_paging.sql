-- Note replies never said who wrote them.
--
-- `get_note_comments_with_likes` returned a bare `user_id` and nothing else, so
-- the map-note thread was the one surface where "you cannot tell who wrote what"
-- was still true after the chat rebuild. This is the last piece of that.
--
-- Both functions are DROP + CREATE because the signature changes, and **dropping
-- a function drops its grants**. The re-grants below are load-bearing: miss one
-- and note threads 403 for everybody.
--
-- Safe to widen with names: this function is granted to `authenticated` only, so
-- no identity reaches a guest. `profiles` SELECT is `to authenticated using
-- (true)` and this function is SECURITY INVOKER, so the join resolves for a
-- signed-in caller and could not resolve for anyone else.

drop function if exists public.get_note_comments_with_likes(uuid);

create function public.get_note_comments_with_likes(
  p_note_id uuid,
  p_limit   int default 50,
  p_before  timestamptz default null
)
returns table (
  id                uuid,
  created_at        timestamptz,
  note_id           uuid,
  user_id           uuid,
  body              text,
  like_count        int,
  liked_by_me       boolean,
  author_name       text,
  author_avatar_url text
)
language sql
stable
set search_path to 'public', 'extensions'
as $$
  -- Newest page first, then flipped back into reading order. The read was
  -- previously unbounded; a thread is now capped and pageable like the other two.
  --
  -- The cursor is inclusive (`<=`), matching the message fetchers: two rows can
  -- share a created_at to the microsecond and an exclusive cursor would skip one
  -- of them forever. The caller drops the repeated boundary row by id.
  with page as (
    select c.*
      from public.map_note_comments c
     where c.note_id = p_note_id
       and (p_before is null or c.created_at <= p_before)
     order by c.created_at desc, c.id desc
     limit greatest(1, least(coalesce(p_limit, 50), 200))
  )
  select p.id, p.created_at, p.note_id, p.user_id, p.body,
         coalesce(l.cnt, 0) as like_count,
         exists (
           select 1 from public.map_note_comment_likes mine
            where mine.comment_id = p.id and mine.user_id = auth.uid()
         ) as liked_by_me,
         pr.display_name, pr.avatar_url
    from page p
    left join (
      select comment_id, count(*)::int as cnt
        from public.map_note_comment_likes
       group by comment_id
    ) l on l.comment_id = p.id
    left join public.profiles pr on pr.id = p.user_id
   order by p.created_at asc, p.id asc;
$$;

revoke all on function public.get_note_comments_with_likes(uuid, int, timestamptz) from public, anon;
grant execute on function public.get_note_comments_with_likes(uuid, int, timestamptz) to authenticated;

-- And let a note reply carry a client id, so it gets the same optimistic send
-- and safe retry as a game message or a DM. The visibility check added in
-- 20260928150000 is preserved exactly.
drop function if exists public.add_note_comment(uuid, text);

create function public.add_note_comment(
  p_note_id   uuid,
  p_body      text,
  p_client_id text default null
)
returns public.map_note_comments
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_uid uuid := auth.uid();
  v_row public.map_note_comments;
  v_body text := coalesce(p_body, '');
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;

  if not public.map_note_visible_to(p_note_id, v_uid) then
    raise exception 'note_not_found' using errcode = '42501';
  end if;

  v_body := trim(v_body);
  if v_body = '' then
    raise exception 'empty_body' using errcode = '22023';
  end if;
  if length(v_body) > 2000 then
    v_body := left(v_body, 2000);
  end if;

  insert into public.map_note_comments (note_id, user_id, body, client_id)
  values (p_note_id, v_uid, v_body, nullif(trim(coalesce(p_client_id, '')), ''))
  returning * into v_row;

  return v_row;
end $function$;

revoke all on function public.add_note_comment(uuid, text, text) from public, anon;
grant execute on function public.add_note_comment(uuid, text, text) to authenticated;
