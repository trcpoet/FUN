-- Migration: gamification, 3D avatars, notifications
-- Run AFTER the base schema.sql. Adds: avatar_id on profiles, game status/roles,
-- user_stats, badges, user_badges, notifications, game_results. Safe to run once.
-- (Uses DO blocks so ADD COLUMN is idempotent.)

-- ----- 1) Extend existing tables -----

do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'avatar_id'
  ) then
    alter table public.profiles add column avatar_id text;
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'games' and column_name = 'status'
  ) then
    alter table public.games add column status text not null default 'open'
      check (status in ('open', 'full', 'completed', 'cancelled'));
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'game_participants' and column_name = 'role'
  ) then
    alter table public.game_participants add column role text not null default 'player'
      check (role in ('host', 'player'));
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'game_participants' and column_name = 'confirmed_result'
  ) then
    alter table public.game_participants add column confirmed_result boolean not null default false;
  end if;
end $$;

-- ----- 2) Gamification: user stats (streaks, XP, level) -----

create table if not exists public.user_stats (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  games_played_total int not null default 0,
  games_played_by_sport jsonb not null default '{}',
  current_streak_days int not null default 0,
  longest_streak_days int not null default 0,
  xp int not null default 0,
  level int not null default 1,
  last_game_date date,
  updated_at timestamptz not null default now()
);

-- ----- 3) Badges (definition table + user awards) -----

create table if not exists public.badges (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  criteria jsonb,
  created_at timestamptz default now()
);

create table if not exists public.user_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  badge_id uuid not null references public.badges(id) on delete cascade,
  awarded_at timestamptz not null default now(),
  unique(user_id, badge_id)
);

create index if not exists user_badges_user_id_idx on public.user_badges(user_id);

-- ----- 4) In-app notifications (toasts, "just joined", streaks) -----

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  payload jsonb default '{}',
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_id_idx on public.notifications(user_id);
create index if not exists notifications_user_id_unread_idx on public.notifications(user_id) where not is_read;

-- ----- 5) Game results (one row per completed game) -----

create table if not exists public.game_results (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade unique,
  winner_team_or_user text,
  score jsonb,
  confirmed_by_host boolean not null default false,
  created_at timestamptz not null default now()
);

-- ----- 6) RLS for new tables -----

alter table public.user_stats enable row level security;
alter table public.badges enable row level security;
alter table public.user_badges enable row level security;
alter table public.notifications enable row level security;
alter table public.game_results enable row level security;

drop policy if exists "User stats readable by owner" on public.user_stats;
drop policy if exists "Badges readable by everyone" on public.badges;
drop policy if exists "User badges readable by everyone" on public.user_badges;
drop policy if exists "Notifications readable by owner" on public.notifications;
drop policy if exists "Notifications updatable by owner" on public.notifications;
drop policy if exists "Game results readable by everyone" on public.game_results;

create policy "User stats readable by owner" on public.user_stats for select using (auth.uid() = user_id);
create policy "Badges readable by everyone" on public.badges for select using (true);
create policy "User badges readable by everyone" on public.user_badges for select using (true);
create policy "Notifications readable by owner" on public.notifications for select using (auth.uid() = user_id);
create policy "Notifications updatable by owner" on public.notifications for update using (auth.uid() = user_id);
create policy "Game results readable by everyone" on public.game_results for select using (true);

-- ----- 7) Update get_profiles_nearby to return avatar_id (for 3D map) -----

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
  avatar_id text,
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
    p.avatar_id,
    pl.lat,
    pl.lng,
    (st_distance(st_setsrid(st_makePoint(pl.lng, pl.lat), 4326)::geography, st_setsrid(st_makePoint(lng, lat), 4326)::geography) / 1000.0) as distance_km
  from public.profile_locations pl
  join public.profiles p on p.id = pl.profile_id
  where st_dwithin(st_setsrid(st_makePoint(pl.lng, pl.lat), 4326)::geography, st_setsrid(st_makePoint(lng, lat), 4326)::geography, radius_km * 1000.0)
  order by pl.updated_at desc
  limit limit_count;
$$;

-- ----- 8) create_game: add host as participant with role 'host' -----

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
  insert into public.games (title, sport, spots_needed, location, created_by, status)
  values (
    p_title,
    p_sport,
    coalesce(p_spots_needed, 2),
    st_setSRID(st_makePoint(p_lng, p_lat), 4326)::geography,
    auth.uid(),
    'open'
  )
  returning id into new_id;
  insert into public.game_participants (game_id, user_id, role)
  values (new_id, auth.uid(), 'host');
  return new_id;
end;
$$;

-- ----- 9) get_games_nearby: return status (filter open/full in app or add param later) -----

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
    (st_distance(g.location, st_point(lng, lat)::geography) / 1000.0) as distance_km,
    st_y(g.location::geometry) as lat,
    st_x(g.location::geometry) as lng
  from public.games g
  where st_dwithin(g.location, st_point(lng, lat)::geography, radius_km * 1000.0)
  order by g.location <-> st_point(lng, lat)::geography
  limit 50;
$$;

-- ----- 10) Seed a few badges (optional; run once) -----

insert into public.badges (slug, name, description, criteria)
values
  ('first_game', 'First Game', 'Played your first game.', '{"games_played_total": 1}'),
  ('ten_games', 'Regular', 'Played 10 games.', '{"games_played_total": 10}'),
  ('streak_7', 'On Fire', '7-day streak.', '{"current_streak_days": 7}'),
  ('early_bird', 'Early Bird', 'Joined a game before 9am.', null),
  ('rain_or_shine', 'Rain or Shine', 'Played in the rain.', null)
on conflict (slug) do nothing;
