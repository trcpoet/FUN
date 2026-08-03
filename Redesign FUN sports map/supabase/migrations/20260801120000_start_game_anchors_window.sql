-- Starting a game must actually start it.
--
-- Bug: start_game() set status='live' and live_started_at, but left starts_at
-- and ends_at untouched. A host who created a game for 03:21 and pressed
-- "Start game" at 02:22 saw the map pin keep counting down ~1h to the original
-- start, because every client-side timer is derived from starts_at/ends_at.
--
-- Fix: pressing Start re-anchors the whole window to now — the game starts now
-- and runs for its configured duration from this moment.

create or replace function public.start_game(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_host uuid;
  v_status text;
begin
  select created_by, status into v_host, v_status
  from public.games
  where id = p_game_id;

  if v_host is null then
    raise exception 'Game not found';
  end if;
  if auth.uid() is null or auth.uid() <> v_host then
    raise exception 'Only the host can start the game';
  end if;
  if v_status in ('completed', 'cancelled') then
    raise exception 'Game already ended';
  end if;

  update public.games
    set status          = 'live',
        live_started_at = coalesce(live_started_at, now()),
        -- Never push a start time forward: a game already under way keeps its
        -- original start, an early start snaps back to now.
        starts_at       = least(coalesce(starts_at, now()), now()),
        ends_at         = now() + make_interval(mins => coalesce(duration_minutes, 90)),
        updated_at      = now()
  where id = p_game_id;
end;
$function$;

revoke execute on function public.start_game(uuid) from public, anon;
grant execute on function public.start_game(uuid) to authenticated;
