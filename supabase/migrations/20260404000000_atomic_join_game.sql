-- Migration: atomic join_game RPC
-- Prevents race conditions when multiple users try to book the same spot simultaneously.
-- Uses row locking and atomic transaction to ensure only the correct number of participants join.
-- Run in Supabase SQL Editor AFTER all previous migrations.

create or replace function public.join_game(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_user_id uuid;
  v_spots_needed int;
  v_participant_count int;
  v_result jsonb;
begin
  -- Get current user
  v_current_user_id := auth.uid();
  if v_current_user_id is null then
    return jsonb_build_object(
      'success', false,
      'error', 'Not authenticated'
    );
  end if;

  -- Lock the game row and fetch spots_needed
  select g.spots_needed
  into v_spots_needed
  from public.games g
  where g.id = p_game_id
  for update;

  if v_spots_needed is null then
    return jsonb_build_object(
      'success', false,
      'error', 'Game not found'
    );
  end if;

  -- Count current participants
  select count(*)
  into v_participant_count
  from public.game_participants gp
  where gp.game_id = p_game_id;

  -- Check if game is full
  if v_participant_count >= v_spots_needed then
    return jsonb_build_object(
      'success', false,
      'error', 'Game is full',
      'spots_needed', v_spots_needed,
      'current_participants', v_participant_count
    );
  end if;

  -- Check if user already joined
  if exists (
    select 1 from public.game_participants gp
    where gp.game_id = p_game_id and gp.user_id = v_current_user_id
  ) then
    return jsonb_build_object(
      'success', false,
      'error', 'Already joined this game'
    );
  end if;

  -- Insert the participant (will fail if another transaction already filled the last spot,
  -- but row lock prevents this)
  insert into public.game_participants (game_id, user_id, joined_at)
  values (p_game_id, v_current_user_id, now());

  return jsonb_build_object(
    'success', true,
    'message', 'Joined game successfully',
    'spots_needed', v_spots_needed,
    'current_participants', v_participant_count + 1
  );

exception when unique_violation then
  -- User tried to join twice (shouldn't happen with RLS, but just in case)
  return jsonb_build_object(
    'success', false,
    'error', 'Already joined this game'
  );
when others then
  -- Generic error (e.g. game was deleted)
  return jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
end;
$$;

-- Grant execute permission to authenticated and anonymous users
grant execute on function public.join_game(uuid) to authenticated, anon;

-- Log the schema reload
-- Run this if PostgREST doesn't pick up the new function
-- NOTIFY pgrst, 'reload schema';
