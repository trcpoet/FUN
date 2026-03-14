-- FUN sports map – beginner-friendly Supabase schema
--
-- In Supabase: SQL Editor → New query → paste this entire file → click RUN.
-- Do NOT click "Explain" — that only works on a single statement and will error.
-- Policies use "drop if exists" so you can re-run this script without duplicate errors.

-- 1) Enable PostGIS for geo queries
create extension if not exists postgis;

-- 2) Profiles (one per user; link to Supabase Auth later)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  updated_at timestamptz default now()
);

-- 3) Games (each row = one game with a location)
create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  sport text not null,
  spots_needed int not null default 2,
  starts_at timestamptz,
  location geography(point, 4326) not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

-- 3b) Profile locations (for showing "nearby players" on the map; update from app when user moves)
create table if not exists public.profile_locations (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  updated_at timestamptz not null default now()
);

-- 4) Who joined which game (for "join" and later chat)
create table if not exists public.game_participants (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz default now(),
  unique(game_id, user_id)
);

-- 5) Index for fast geo search
create index if not exists games_location_idx on public.games using gist(location);

-- 5b) Get profiles near a point (for map "nearby players")
create or replace function public.get_profiles_nearby(
  lat double precision,
  lng double precision,
  radius_km double precision default 5,
  limit_count int default 50
)
returns table (
  profile_id uuid,
  display_name text,
  avatar_url text,
  lat double precision,
  lng double precision,
  distance_km double precision
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id as profile_id,
    p.display_name,
    p.avatar_url,
    pl.lat,
    pl.lng,
    (st_distance(st_setsrid(st_makePoint(pl.lng, pl.lat), 4326)::geography, st_setsrid(st_makePoint(lng, lat), 4326)::geography) / 1000.0) as distance_km
  from public.profile_locations pl
  join public.profiles p on p.id = pl.profile_id
  where st_dwithin(st_setsrid(st_makePoint(pl.lng, pl.lat), 4326)::geography, st_setsrid(st_makePoint(lng, lat), 4326)::geography, radius_km * 1000.0)
  order by pl.updated_at desc
  limit limit_count;
$$;

-- 5c) Update current user's location (call from app when location changes)
create or replace function public.update_my_location(p_lat double precision, p_lng double precision)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Ensure profile exists (e.g. for anonymous users)
  insert into public.profiles (id, display_name)
  values (auth.uid(), 'Player')
  on conflict (id) do nothing;
  insert into public.profile_locations (profile_id, lat, lng, updated_at)
  values (auth.uid(), p_lat, p_lng, now())
  on conflict (profile_id) do update set lat = p_lat, lng = p_lng, updated_at = now();
end;
$$;

-- 6) RLS (Row Level Security)
alter table public.profiles enable row level security;
alter table public.games enable row level security;
alter table public.game_participants enable row level security;
alter table public.profile_locations enable row level security;

-- Drop existing policies so this script can be re-run safely
drop policy if exists "Profile locations viewable by everyone" on public.profile_locations;
drop policy if exists "Users can insert own profile location" on public.profile_locations;
drop policy if exists "Users can update own profile location" on public.profile_locations;
drop policy if exists "Profiles are viewable by everyone" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Games are viewable by everyone" on public.games;
drop policy if exists "Authenticated users can create games" on public.games;
drop policy if exists "Participants are viewable by everyone" on public.game_participants;
drop policy if exists "Authenticated users can join games" on public.game_participants;

-- Create policies
create policy "Profile locations viewable by everyone" on public.profile_locations for select using (true);
create policy "Users can insert own profile location" on public.profile_locations for insert with check (auth.uid() = profile_id);
create policy "Users can update own profile location" on public.profile_locations for update using (auth.uid() = profile_id);

create policy "Profiles are viewable by everyone" on public.profiles for select using (true);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);

create policy "Games are viewable by everyone" on public.games for select using (true);
create policy "Authenticated users can create games" on public.games for insert with check (auth.role() = 'authenticated');

create policy "Participants are viewable by everyone" on public.game_participants for select using (true);
create policy "Authenticated users can join games" on public.game_participants for insert with check (auth.role() = 'authenticated');

-- 7) Get games within X km of a point (returns lat/lng for map markers)
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
    (st_distance(g.location, st_point(lng, lat)::geography) / 1000.0) as distance_km,
    st_y(g.location::geometry) as lat,
    st_x(g.location::geometry) as lng
  from public.games g
  where st_dwithin(g.location, st_point(lng, lat)::geography, radius_km * 1000.0)
  order by g.location <-> st_point(lng, lat)::geography
  limit 50;
$$;

-- 8) Create a game from the client (accepts lat/lng, builds geography)
-- Required params first; only the last param has a default (PostgreSQL rule).
create or replace function public.create_game(
  p_title text,
  p_sport text,
  p_lat double precision,
  p_lng double precision,
  p_spots_needed int default 2
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
  insert into public.games (title, sport, spots_needed, location, created_by)
  values (
    p_title,
    p_sport,
    coalesce(p_spots_needed, 2),
    st_setSRID(st_makePoint(p_lng, p_lat), 4326)::geography,
    auth.uid()
  )
  returning id into new_id;
  return new_id;
end;
$$;
