-- Add optional starts_at to create_game so the app can set play time when creating a game.

create or replace function public.create_game(
  p_title text,
  p_sport text,
  p_lat double precision,
  p_lng double precision,
  p_spots_needed int default 2,
  p_starts_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated to create a game';
  end if;
  insert into public.games (title, sport, spots_needed, location, created_by, status, starts_at)
  values (
    p_title,
    p_sport,
    coalesce(p_spots_needed, 2),
    st_setSRID(st_makePoint(p_lng, p_lat), 4326)::geography,
    auth.uid(),
    'open',
    p_starts_at
  )
  returning id into new_id;
  insert into public.game_participants (game_id, user_id, role)
  values (new_id, auth.uid(), 'host');
  return new_id;
end;
$$;
