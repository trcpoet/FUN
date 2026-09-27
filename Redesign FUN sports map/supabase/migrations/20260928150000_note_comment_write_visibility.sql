-- `add_note_comment` let anyone post into any note, including a private one.
--
-- The RLS policies on `map_note_comments` are correct, contrary to what the plan
-- for this work claimed. Both delegate to
-- `exists (select 1 from map_notes n where n.id = note_id)`, which reads like a
-- missing visibility check but is not: Postgres applies `map_notes`' own RLS to
-- that subquery, so an invisible note makes the EXISTS false. Verified against
-- production before writing this — a member who cannot see a private note reads
-- zero of its comments, and a direct INSERT is refused by the policy.
--
-- `add_note_comment` is SECURITY DEFINER, so it runs as the table owner and that
-- inheritance does not happen. It inserted with no check whatsoever. Verified:
-- user B, who can neither read A's private note nor insert into it directly,
-- could call this RPC and land a comment in A's private thread.
--
-- Not reachable at random, since note ids are v4 uuids, but it needs no more
-- than one leaked id and the fix is a single condition.

-- The visibility rule, callable from a definer context.
--
-- This duplicates the expression in the `map_notes: read visible` policy, which
-- is a real drift risk and a deliberate trade: the policy keeps its inlined form
-- because it runs per row on the map's bbox read, where a per-row function call
-- is the wrong shape. Equivalence was verified across all twelve
-- (public|friends|private) x (owner|follower|stranger|anon) cases, with zero
-- mismatches, before this was applied. Change one, change the other, and re-run
-- that matrix.
create or replace function public.map_note_visible_to(p_note_id uuid, p_viewer uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.map_notes n
    where n.id = p_note_id
      and (
        n.visibility = 'public'
        or (p_viewer is not null and n.created_by = p_viewer)
        or (n.visibility = 'friends' and p_viewer is not null and (
              exists (select 1 from public.user_follows f
                       where f.follower_id = p_viewer and f.followed_id = n.created_by)
           or exists (select 1 from public.user_follows f
                       where f.follower_id = n.created_by and f.followed_id = p_viewer)))
      )
  );
$$;

revoke all on function public.map_note_visible_to(uuid, uuid) from public, anon;
grant execute on function public.map_note_visible_to(uuid, uuid) to authenticated;

create or replace function public.add_note_comment(p_note_id uuid, p_body text)
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

  -- The check this function never had. One error for "no such note" and for
  -- "not yours to see", so the RPC cannot be used to probe which note ids exist.
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

  insert into public.map_note_comments (note_id, user_id, body)
  values (p_note_id, v_uid, v_body)
  returning * into v_row;

  return v_row;
end $function$;
