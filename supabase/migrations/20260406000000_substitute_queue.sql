-- Migration: substitute queue
--
-- What this does:
--   1. Expands the role check constraint to allow 'substitute'
--   2. Rewrites join_game: full game → adds you as substitute instead of rejecting
--   3. Creates leave_game RPC: when a player leaves, first substitute auto-promotes
--   4. Fixes get_games_nearby so substitutes don't eat into participant_count / spots_remaining
--
-- Run in Supabase SQL Editor AFTER 20260404000000_atomic_join_game.sql

-- ─── 1) Expand role constraint ──────────────────────────────────────────────

alter table public.game_participants
  drop constraint if exists game_participants_role_check;

alter table public.game_participants
  add constraint game_participants_role_check
  check (role in ('host', 'player', 'substitute'));

-- ─── 2) Rewrite join_game ───────────────────────────────────────────────────
--
-- Key change: count only non-substitute participants for capacity.
-- If the game is full → insert as 'substitute' (success, role: 'substitute').
-- If the game has room → insert as 'player' and update status to 'full' if
-- this was the last open spot.

create or replace function public.join_game(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_user_id uuid;
  v_spots_needed     int;
  v_player_count     int;  -- counts only host + player rows (not substitutes)
  v_is_full          bool;
  v_role             text;
begin
  v_current_user_id := auth.uid();
  if v_current_user_id is null then
    return jsonb_build_object('success', false, 'error', 'Not authenticated');
  end if;

  -- Lock the game row so two concurrent joins can't both see "1 spot left"
  select g.spots_needed
  into   v_spots_needed
  from   public.games g
  where  g.id = p_game_id
  for update;

  if v_spots_needed is null then
    return jsonb_build_object('success', false, 'error', 'Game not found');
  end if;

  -- Only count real participants (host + player), not people on the waitlist
  select count(*)
  into   v_player_count
  from   public.game_participants gp
  where  gp.game_id = p_game_id
    and  gp.role    != 'substitute';

  v_is_full := v_player_count >= v_spots_needed;

  -- Already in the game (any role)?
  if exists (
    select 1
    from   public.game_participants gp
    where  gp.game_id = p_game_id
      and  gp.user_id = v_current_user_id
  ) then
    return jsonb_build_object('success', false, 'error', 'Already joined this game');
  end if;

  -- Full → join as substitute (waitlist)
  if v_is_full then
    v_role := 'substitute';
  else
    v_role := 'player';
  end if;

  insert into public.game_participants (game_id, user_id, role, joined_at)
  values (p_game_id, v_current_user_id, v_role, now());

  -- If this player just filled the last real spot, mark the game 'full'
  if v_role = 'player' and (v_player_count + 1) >= v_spots_needed then
    update public.games
    set    status     = 'full',
           updated_at = now()
    where  id         = p_game_id
      and  status     = 'open';
  end if;

  return jsonb_build_object(
    'success',              true,
    'role',                 v_role,
    'message',              case when v_role = 'substitute'
                              then 'Added to waitlist'
                              else 'Joined game successfully'
                            end,
    'spots_needed',         v_spots_needed,
    'current_participants', v_player_count + case when v_role = 'player' then 1 else 0 end
  );

exception when unique_violation then
  return jsonb_build_object('success', false, 'error', 'Already joined this game');
when others then
  return jsonb_build_object('success', false, 'error', SQLERRM);
end;
$$;

-- ─── 3) Create leave_game RPC ────────────────────────────────────────────────
--
-- When a player (not a host) leaves:
--   a) Delete their row.
--   b) If they were a real player (not a substitute), promote the first
--      waitlisted substitute (earliest joined_at) to 'player'.
--   c) If no substitute to promote and the game was 'full', set it back to
--      'open' so new players can join.
--
-- Hosts cannot leave via this RPC — they delete the game instead.

create or replace function public.leave_game(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_user_id uuid;
  v_their_role      text;
  v_next_sub_id     uuid;
  v_game_status     text;
begin
  v_current_user_id := auth.uid();
  if v_current_user_id is null then
    return jsonb_build_object('success', false, 'error', 'Not authenticated');
  end if;

  -- What role does the caller have?
  select role
  into   v_their_role
  from   public.game_participants
  where  game_id = p_game_id
    and  user_id = v_current_user_id;

  if v_their_role is null then
    return jsonb_build_object('success', false, 'error', 'Not in this game');
  end if;

  if v_their_role = 'host' then
    return jsonb_build_object('success', false, 'error', 'Hosts cannot leave — delete the game instead');
  end if;

  -- Grab current game status before we delete anything
  select status into v_game_status
  from   public.games
  where  id = p_game_id
  for update;

  -- Remove the caller
  delete from public.game_participants
  where  game_id = p_game_id
    and  user_id = v_current_user_id;

  -- Only bother promoting / updating status if they were a real player
  if v_their_role = 'player' then
    -- Is there a substitute waiting?
    select user_id
    into   v_next_sub_id
    from   public.game_participants
    where  game_id = p_game_id
      and  role    = 'substitute'
    order  by joined_at asc
    limit  1;

    if v_next_sub_id is not null then
      -- Promote them — game spot count stays the same, status stays 'full'
      update public.game_participants
      set    role = 'player'
      where  game_id = p_game_id
        and  user_id = v_next_sub_id;
    else
      -- No substitute: a spot opened up
      if v_game_status = 'full' then
        update public.games
        set    status     = 'open',
               updated_at = now()
        where  id = p_game_id;
      end if;
    end if;
  end if;

  return jsonb_build_object('success', true, 'message', 'Left game');

exception when others then
  return jsonb_build_object('success', false, 'error', SQLERRM);
end;
$$;

grant execute on function public.leave_game(uuid) to authenticated, anon;

-- ─── 4) Fix get_games_nearby: exclude substitutes from counts ─────────────

drop function if exists public.get_games_nearby(double precision, double precision, double precision);

create or replace function public.get_games_nearby(
  lat double precision,
  lng double precision,
  radius_km double precision default 10
)
returns table (
  id uuid,
  title text,
  sport text,
  spots_needed int,
  starts_at timestamptz,
  created_by uuid,
  created_at timestamptz,
  status text,
  location_label text,
  description text,
  requirements jsonb,
  participant_count int,
  substitute_count int,
  spots_remaining int,
  distance_km double precision,
  lat double precision,
  lng double precision,
  live_started_at timestamptz,
  ended_at timestamptz
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
    g.spots_needed,
    g.starts_at,
    g.created_by,
    g.created_at,
    g.status,
    g.location_label,
    g.description,
    coalesce(g.requirements, '{}'::jsonb)                         as requirements,
    -- real players only (host + player)
    coalesce(part.player_cnt, 0)::int                             as participant_count,
    -- people on the waitlist
    coalesce(part.sub_cnt, 0)::int                                as substitute_count,
    greatest(g.spots_needed - coalesce(part.player_cnt, 0), 0)::int as spots_remaining,
    (st_distance(g.location, st_point(lng, lat)::geography) / 1000.0) as distance_km,
    st_y(g.location::geometry)                                   as lat,
    st_x(g.location::geometry)                                   as lng,
    g.live_started_at,
    g.ended_at
  from public.games g
  left join lateral (
    select
      count(*) filter (where gp.role != 'substitute')::int as player_cnt,
      count(*) filter (where gp.role  = 'substitute')::int as sub_cnt
    from public.game_participants gp
    where gp.game_id = g.id
  ) part on true
  where st_dwithin(g.location, st_point(lng, lat)::geography, radius_km * 1000.0)
    and g.status in ('open', 'full', 'live')
    and (
      g.status <> 'live'
      or (coalesce(g.live_started_at, g.updated_at, g.created_at) > now() - interval '24 hours')
    )
  order by distance_km asc;
$$;

grant execute on function public.get_games_nearby(double precision, double precision, double precision) to authenticated;
grant execute on function public.get_games_nearby(double precision, double precision, double precision) to anon;
