-- =======================================================================
-- get_my_note_inbox: perpetual inbox of map notes I authored or commented on
-- =======================================================================
-- Powers the new "Notes" tab in the messenger sheet. Returns rich rows with
-- comment counts and the latest comment so the inbox can render a chat-style
-- preview ("Last reply · X ago"). Sort key = max(last_comment_at, created_at)
-- so notes with recent activity float to the top.
--
-- Idempotent. After applying:  NOTIFY pgrst, 'reload schema';
-- =======================================================================

set search_path = public;

create or replace function public.get_my_note_inbox()
returns table (
  id uuid,
  body text,
  visibility text,
  created_at timestamptz,
  created_by uuid,
  lat double precision,
  lng double precision,
  place_name text,
  comment_count int,
  last_comment_body text,
  last_comment_at timestamptz,
  is_author boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    -- Notes I authored.
    select n.id from public.map_notes n where n.created_by = auth.uid()
    union
    -- Notes I commented on.
    select c.note_id from public.map_note_comments c where c.user_id = auth.uid()
  ),
  counts as (
    select c.note_id, count(*)::int as cnt
      from public.map_note_comments c
     where c.note_id in (select id from mine)
     group by c.note_id
  ),
  last_c as (
    select distinct on (c.note_id)
           c.note_id, c.body, c.created_at
      from public.map_note_comments c
     where c.note_id in (select id from mine)
     order by c.note_id, c.created_at desc
  )
  select n.id,
         n.body,
         n.visibility,
         n.created_at,
         n.created_by,
         n.lat,
         n.lng,
         n.place_name,
         coalesce(c.cnt, 0) as comment_count,
         lc.body  as last_comment_body,
         lc.created_at as last_comment_at,
         (n.created_by = auth.uid()) as is_author
    from public.map_notes n
    join mine on mine.id = n.id
    left join counts c on c.note_id = n.id
    left join last_c lc on lc.note_id = n.id
   order by greatest(
              coalesce(lc.created_at, 'epoch'::timestamptz),
              coalesce(n.created_at,  'epoch'::timestamptz)
            ) desc nulls last;
$$;

grant execute on function public.get_my_note_inbox() to authenticated, anon;

notify pgrst, 'reload schema';
