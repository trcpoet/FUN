-- An ended game ends. Everywhere, at once.
--
-- "Ending a game still has them on Live" was not one bug. Four separate
-- mechanisms let `status`, `ends_at` and `ended_at` disagree, and every consumer
-- that keys off only one of them was wrong for some window. This migration
-- closes the three that live in the database.
--
--  1. `start_game` sets `ends_at = now() + duration`, and then its own
--     BEFORE UPDATE OF starts_at trigger immediately overwrites that with
--     `starts_at + duration`. Because `start_game` keeps an earlier
--     `starts_at` ("never push a start time forward"), a 7 pm game the host
--     actually starts at 8:30 is born already over: ends_at = 20:30 for a
--     window that began at 20:30. The trigger now respects an `ends_at` the
--     statement set on purpose, and leaves finished games alone.
--
--  2. `end_game` sets `status` and `ended_at` but never `ends_at`, so a game
--     ended 20 minutes into a 90-minute window keeps an `ends_at` an hour in
--     the future. Any predicate written against `ends_at` alone — including
--     `mark_ended_games_completed`'s own WHERE clause — still calls it live.
--
--  3. `get_my_game_inbox` returns `ends_at` but not `ended_at`, and the
--     messenger has nothing else to reason with: it is the one surface that
--     lists every game you are in regardless of date, so it cannot fall back to
--     "not returned means over". A game ended early therefore read
--     "Live · 70:00 left" in its own chat header. Both timestamps now come
--     back, which is what `getGameEndsAtMs` on the client already prefers.
--
-- The fourth is client-side (an open game card held a snapshot of the row it was
-- opened with) and ships in the same change.
--
-- Deploy order: safe in either direction. The two function bodies are strictly
-- more correct against the current client, and the inbox only gains columns.
-- `get_unified_feed`'s missing untimed-TTL predicate is deliberately NOT here —
-- `unified_feed_games_v2` replaces that whole function for feed game cards and
-- fixes it there, rather than restating 100 lines twice.

-- ---------------------------------------------------------------------------
-- 1) The trigger stops clobbering a deliberate ends_at
-- ---------------------------------------------------------------------------
create or replace function public.games_set_ends_at()
returns trigger
language plpgsql
set search_path to 'public', 'extensions'
as $function$
begin
  -- A finished game's window is history. Rescheduling or re-timing one must not
  -- move its end back into the future and put it on the map again.
  if NEW.status in ('completed', 'cancelled') then
    return NEW;
  end if;

  -- Did this statement set `ends_at` itself? On UPDATE that is a value different
  -- from the one on disk; on INSERT it is any value at all. `start_game` is the
  -- caller that needs this: it moves `starts_at` and `ends_at` together, and the
  -- whole point of its `ends_at` is that it is *not* `starts_at + duration`.
  if TG_OP = 'UPDATE' and NEW.ends_at is distinct from OLD.ends_at then
    return NEW;
  end if;
  if TG_OP = 'INSERT' and NEW.ends_at is not null then
    return NEW;
  end if;

  if NEW.starts_at is null then
    NEW.ends_at := null;
  else
    NEW.ends_at := NEW.starts_at + make_interval(mins => coalesce(NEW.duration_minutes, 90));
  end if;
  return NEW;
end $function$;

comment on function public.games_set_ends_at() is
  'Keeps games.ends_at = starts_at + duration_minutes, except when the statement '
  'set ends_at deliberately (start_game) or the game is already completed/cancelled. '
  'Fires BEFORE INSERT OR UPDATE OF starts_at, duration_minutes.';

-- ---------------------------------------------------------------------------
-- 2) end_game closes the window as well as the status
-- ---------------------------------------------------------------------------
create or replace function public.end_game(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_host uuid;
  v_status text;
  v_starts_at timestamptz;
begin
  select created_by, status, starts_at into v_host, v_status, v_starts_at
  from public.games
  where id = p_game_id;

  if v_host is null then
    raise exception 'Game not found';
  end if;
  if auth.uid() is null or auth.uid() <> v_host then
    raise exception 'Only the host can end the game';
  end if;
  if v_status in ('completed', 'cancelled') then
    return;
  end if;

  -- End Game before it begins => treat as delete game.
  if v_status <> 'live' and (v_starts_at is null or v_starts_at > now()) then
    delete from public.games where id = p_game_id and created_by = auth.uid();
    return;
  end if;

  update public.games
    set status = 'completed',
        ended_at = now(),
        -- The window closes with the game. Without this, `ends_at` stays in the
        -- future and every predicate written against it alone — the map read,
        -- the feed, the sweep — still counts this game as running.
        ends_at = now(),
        updated_at = now()
  where id = p_game_id;
end;
$function$;

comment on function public.end_game(uuid) is
  'Host ends their own game: status=completed, ended_at=now(), ends_at=now(). '
  'Ending a game that has not started yet deletes it instead. '
  'The three timestamps are set together on purpose — a consumer that reads only '
  'one of them must still be right.';

-- ---------------------------------------------------------------------------
-- 3) The chat inbox carries the whole lifecycle
-- ---------------------------------------------------------------------------
-- Return type changes, so drop + create; the ACLs are re-granted below. The body
-- is byte-for-byte the one from 20260811000000_game_chat_archive except for the
-- two added columns.
drop function if exists public.get_my_game_inbox();

create function public.get_my_game_inbox()
returns table (
  id                uuid,
  title             text,
  sport             text,
  starts_at         timestamptz,
  ends_at           timestamptz,
  ended_at          timestamptz,
  live_started_at   timestamptz,
  duration_minutes  integer,
  visibility        text,
  invite_token      uuid,
  created_by        uuid,
  status            text,
  location_label    text,
  lat               double precision,
  lng               double precision,
  participant_count integer,
  spots_remaining   integer,
  last_message_body text,
  last_message_at   timestamptz
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
         -- The moment a host pressed End. Beats every scheduled window, and is
         -- the only way this surface can tell a game that finished early from
         -- one still running.
         g.ended_at,
         -- Anchors the countdown for an untimed pickup game the host started:
         -- it has no starts_at to add a duration to.
         g.live_started_at,
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

comment on function public.get_my_game_inbox() is
  'Every game you hold a participant row for, newest activity first, regardless of '
  'date — the one surface that does not filter by time, so it returns the full '
  'lifecycle (status, ends_at, ended_at, live_started_at) and lets the client decide '
  'what is over. Rows you archived come back only when a newer message arrives.';

revoke execute on function public.get_my_game_inbox() from public, anon;
grant execute on function public.get_my_game_inbox() to authenticated;
grant execute on function public.get_my_game_inbox() to service_role;

-- ---------------------------------------------------------------------------
-- 4) Make the sweep actually run
-- ---------------------------------------------------------------------------
-- `mark_ended_games_completed` is granted to service_role and revoked from
-- authenticated on purpose (20260723090000): it writes to other people's games,
-- so it is not a client call. It was also called by nothing, which left `status`
-- saying 'live' indefinitely for games whose window merely ran out.
--
-- Every read path already excludes those games by time, so the sweep is not
-- load-bearing for correctness — it is what keeps the stored status honest for
-- the surfaces that show it verbatim. Schedule it where pg_cron exists, and say
-- so plainly where it does not.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- cron.schedule is upsert-by-name, so re-applying this migration is a no-op.
    perform cron.schedule(
      'fun-mark-ended-games-completed',
      '*/5 * * * *',
      $cron$select public.mark_ended_games_completed();$cron$
    );
    raise notice 'scheduled fun-mark-ended-games-completed every 5 minutes';
  else
    raise notice
      'pg_cron not installed: public.mark_ended_games_completed() is unscheduled. '
      'Enable pg_cron (Supabase: Database -> Extensions) and re-run this migration, '
      'or call it from a cron-triggered serverless route with the service role key.';
  end if;
end $$;

notify pgrst, 'reload schema';

-- Verification (run as the host, then as another member):
--   -- 3a. the inbox gained the two columns and still returns your games
--   select id, status, starts_at, ends_at, ended_at, live_started_at
--     from public.get_my_game_inbox() limit 5;
--
--   -- 3b. a game started late is not born ended
--   update public.games set starts_at = now() - interval '90 minutes',
--          status = 'open', ended_at = null, live_started_at = null
--    where id = '<your game>';
--   select public.start_game('<your game>');
--   select starts_at, ends_at, ends_at > now() as still_running
--     from public.games where id = '<your game>';   -- still_running must be true
--
--   -- 3c. ending it closes all three
--   select public.end_game('<your game>');
--   select status, ended_at, ends_at from public.games where id = '<your game>';
--
--   -- 3d. and rescheduling a finished game does not revive it
--   update public.games set starts_at = now() + interval '1 day' where id = '<your game>';
--   select status, ends_at from public.games where id = '<your game>';  -- ends_at unchanged
--
--   -- 4. as anon and as authenticated: still refused
--   select public.mark_ended_games_completed();  -- expect 42501
