-- If game chat tables exist but PostgREST returns 404 / "schema cache" for get_my_game_inbox,
-- run this in Supabase SQL Editor, then: NOTIFY pgrst, 'reload schema';
-- (Full setup: use migrations/20250321000000_game_chat_roster.sql instead.)

create or replace function public.get_my_game_inbox()
returns table (
  id uuid,
  title text,
  sport text,
  starts_at timestamptz,
  location_label text,
  last_message_body text,
  last_message_at timestamptz,
  participant_count int,
  spots_remaining int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    g.id,
    g.title,
    g.sport,
    g.starts_at,
    g.location_label,
    lm.body as last_message_body,
    lm.created_at as last_message_at,
    coalesce(pc.cnt, 0)::int as participant_count,
    greatest(g.spots_needed - coalesce(pc.cnt, 0), 0)::int as spots_remaining
  from public.game_participants me
  join public.games g on g.id = me.game_id
  left join lateral (
    select count(*)::int as cnt
    from public.game_participants gp
    where gp.game_id = g.id
  ) pc on true
  left join lateral (
    select m.body, m.created_at
    from public.game_messages m
    where m.game_id = g.id
    order by m.created_at desc
    limit 1
  ) lm on true
  where me.user_id = auth.uid()
  order by coalesce(lm.created_at, g.starts_at, g.created_at) desc nulls last;
$$;

grant execute on function public.get_my_game_inbox() to authenticated;
grant execute on function public.get_my_game_inbox() to anon;

NOTIFY pgrst, 'reload schema';
