-- =======================================================================
-- Archive a finished game's chat, per viewer
-- =======================================================================
-- `leave_game` rejects hosts outright ("Hosts cannot leave — delete the game
-- instead"), and that is the correct rule: a game without its host is not a
-- game. But it left hosts with no way at all to clear a finished game out of
-- their inbox except to delete the game, which removes the roster and every
-- message for everyone who played. People were being pushed into destroying
-- shared history to tidy up their own screen.
--
-- Archiving is the missing verb. It is per-participant, reversible, and touches
-- nothing but one timestamp on the caller's own `game_participants` row.
--
-- Three deliberate choices:
--
--  1. Ended games only. Hiding a chat you are still expected to turn up to is
--     how people miss games. Untimed pickup games count as ended once they pass
--     the same 3-day map TTL `get_games_nearby` uses (`20260808010000`), because
--     nothing about them ever sets `ends_at`.
--
--  2. Open to players, not just hosts. Once a game is over, "leave the game" and
--     "stop showing me this" are different wishes, and `leave_game` only serves
--     the first — it deletes the participant row, taking you off the roster of a
--     game you actually played.
--
--  3. A new message un-archives the thread. `get_my_game_inbox` compares
--     `chat_hidden_at` against the last message, so a squad picking the chat back
--     up brings it back for everyone who archived it. Without this, archiving
--     would silently make you unreachable in a conversation you are still part
--     of, and would need an "Archived" folder to escape.
--
-- RPCs rather than a PostgREST update because `game_participants` has no UPDATE
-- policy (`Authenticated users can join games` / `Participants are viewable by
-- everyone` / `Users can delete own participation` — insert, select, delete
-- only). A direct update would touch zero rows and report success.
--
-- Idempotent and safe to re-run.
-- After applying: NOTIFY pgrst, 'reload schema';
-- =======================================================================

alter table public.game_participants
  add column if not exists chat_hidden_at timestamptz;

comment on column public.game_participants.chat_hidden_at is
  'When this participant archived the game chat out of their own inbox. Null = visible. '
  'Cleared automatically by a newer message (see get_my_game_inbox).';

-- -----------------------------------------------------------------------
-- archive_game_chat / unarchive_game_chat
-- -----------------------------------------------------------------------

create or replace function public.archive_game_chat(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user  uuid;
  v_ended boolean;
  v_rows  int;
begin
  v_user := auth.uid();
  if v_user is null then
    return jsonb_build_object('success', false, 'error', 'Not authenticated');
  end if;

  -- Same definition of "over" the map uses: an explicit end state, a scheduled
  -- window that has closed, or an untimed game past the 3-day map TTL.
  select g.status in ('completed', 'cancelled')
         or (g.ends_at is not null and g.ends_at <= now())
         or (g.ends_at is null and g.starts_at is null and g.created_at <= now() - interval '3 days')
    into v_ended
    from public.games g
   where g.id = p_game_id;

  if v_ended is null then
    return jsonb_build_object('success', false, 'error', 'Game not found');
  end if;

  if not v_ended then
    return jsonb_build_object('success', false, 'error', 'You can archive this chat once the game has ended');
  end if;

  update public.game_participants
     set chat_hidden_at = now()
   where game_id = p_game_id
     and user_id = v_user;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return jsonb_build_object('success', false, 'error', 'Not in this game');
  end if;

  return jsonb_build_object('success', true, 'message', 'Chat archived');

exception when others then
  return jsonb_build_object('success', false, 'error', SQLERRM);
end;
$function$;

-- No ended-check on the way back: undoing a mistake must never be the harder
-- direction, and un-hiding a chat you are already a member of shows you nothing
-- you could not already read.
create or replace function public.unarchive_game_chat(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid;
  v_rows int;
begin
  v_user := auth.uid();
  if v_user is null then
    return jsonb_build_object('success', false, 'error', 'Not authenticated');
  end if;

  update public.game_participants
     set chat_hidden_at = null
   where game_id = p_game_id
     and user_id = v_user;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return jsonb_build_object('success', false, 'error', 'Not in this game');
  end if;

  return jsonb_build_object('success', true, 'message', 'Chat restored');

exception when others then
  return jsonb_build_object('success', false, 'error', SQLERRM);
end;
$function$;

revoke execute on function public.archive_game_chat(uuid) from public;
revoke execute on function public.unarchive_game_chat(uuid) from public;
grant  execute on function public.archive_game_chat(uuid) to authenticated;
grant  execute on function public.unarchive_game_chat(uuid) to authenticated;

-- -----------------------------------------------------------------------
-- get_my_game_inbox: hide archived threads until they speak again
-- -----------------------------------------------------------------------
-- Return type and ordering are unchanged, so this stays a plain CREATE OR
-- REPLACE (no DROP, existing ACLs survive). `my_games` now carries the caller's
-- own `chat_hidden_at`, and the final WHERE drops a game only while its last
-- message is older than the moment they archived it.

create or replace function public.get_my_game_inbox()
returns table(
  id uuid, title text, sport text, starts_at timestamp with time zone,
  ends_at timestamp with time zone, duration_minutes integer, visibility text,
  invite_token uuid, created_by uuid, status text, location_label text,
  lat double precision, lng double precision, participant_count integer,
  spots_remaining integer, last_message_body text,
  last_message_at timestamp with time zone
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with my_games as (
    select gp.game_id, gp.chat_hidden_at
      from public.game_participants gp
     where gp.user_id = auth.uid()
  ),
  counts as (
    select gp.game_id, count(*)::int as cnt
      from public.game_participants gp
     where gp.game_id in (select game_id from my_games)
     group by gp.game_id
  ),
  last_msgs as (
    select distinct on (m.game_id)
           m.game_id,
           m.body  as last_message_body,
           m.created_at as last_message_at
      from public.game_messages m
     where m.game_id in (select game_id from my_games)
     order by m.game_id, m.created_at desc
  )
  select g.id,
         g.title,
         g.sport,
         g.starts_at,
         g.ends_at,
         g.duration_minutes,
         g.visibility,
         g.invite_token,
         g.created_by,
         g.status::text,
         g.location_label,
         g.lat,
         g.lng,
         coalesce(c.cnt, 0) as participant_count,
         greatest(0, coalesce(g.spots_needed, 2) - coalesce(c.cnt, 0)) as spots_remaining,
         lm.last_message_body,
         lm.last_message_at
    from public.games g
    join my_games mg on mg.game_id = g.id
    left join counts c     on c.game_id  = g.id
    left join last_msgs lm on lm.game_id = g.id
   where mg.chat_hidden_at is null
      or coalesce(lm.last_message_at, '-infinity'::timestamptz) > mg.chat_hidden_at
   order by greatest(
              coalesce(lm.last_message_at, 'epoch'::timestamptz),
              coalesce(g.ends_at,         'epoch'::timestamptz),
              coalesce(g.starts_at,       'epoch'::timestamptz)
            ) desc nulls last,
            g.created_at desc;
$function$;

notify pgrst, 'reload schema';
