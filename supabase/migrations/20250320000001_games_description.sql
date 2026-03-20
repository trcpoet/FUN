-- Optional short description on games (create modal / social context).

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'games'
      and column_name = 'description'
  ) then
    alter table public.games
      add column description text;
  end if;
end;
$$;

create or replace function public.create_game(
  p_title text,
  p_sport text,
  p_lat double precision,
  p_lng double precision,
  p_spots_needed int default 2,
  p_starts_at timestamptz default null,
  p_location_label text default null,
  p_description text default null
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
  insert into public.games (title, sport, spots_needed, location, created_by, status, starts_at, location_label, description)
  values (
    p_title,
    p_sport,
    coalesce(p_spots_needed, 2),
    st_setSRID(st_makePoint(p_lng, p_lat), 4326)::geography,
    auth.uid(),
    'open',
    p_starts_at,
    p_location_label,
    nullif(trim(coalesce(p_description, '')), '')
  )
  returning id into new_id;
  insert into public.game_participants (game_id, user_id, role)
  values (new_id, auth.uid(), 'host');
  return new_id;
end;
$$;

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
  distance_km double precision,
  lat double precision,
  lng double precision
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
    (st_distance(g.location, st_point(lng, lat)::geography) / 1000.0) as distance_km,
    st_y(g.location::geometry) as lat,
    st_x(g.location::geometry) as lng
  from public.games g
  where st_dwithin(g.location, st_point(lng, lat)::geography, radius_km * 1000.0)
  order by g.location <-> st_point(lng, lat)::geography
  limit 50;
$$;
