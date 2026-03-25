-- Migration: athlete endorsements (games-only reputation)
-- Adds:
-- - athlete_endorsements table
-- - RPCs: get_shared_completed_games, endorse_athlete, get_athlete_reputation
-- - Extends get_profiles_nearby to include sportsmanship (avg stars)

create table if not exists public.athlete_endorsements (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  endorser_id uuid not null references public.profiles(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  tags text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (game_id, athlete_id, endorser_id),
  constraint athlete_endorsements_not_self check (athlete_id <> endorser_id)
);

create index if not exists athlete_endorsements_athlete_idx
  on public.athlete_endorsements (athlete_id, created_at desc);
create index if not exists athlete_endorsements_endorser_idx
  on public.athlete_endorsements (endorser_id, created_at desc);
create index if not exists athlete_endorsements_game_idx
  on public.athlete_endorsements (game_id);

alter table public.athlete_endorsements enable row level security;

drop policy if exists "athlete_endorsements_insert_games_only" on public.athlete_endorsements;
create policy "athlete_endorsements_insert_games_only"
  on public.athlete_endorsements
  for insert
  with check (
    auth.uid() = endorser_id
    and exists (
      select 1
      from public.games g
      join public.game_participants me on me.game_id = g.id and me.user_id = auth.uid()
      join public.game_participants them on them.game_id = g.id and them.user_id = athlete_endorsements.athlete_id
      where g.id = athlete_endorsements.game_id
        and g.status = 'completed'
    )
  );

drop policy if exists "athlete_endorsements_update_owner" on public.athlete_endorsements;
create policy "athlete_endorsements_update_owner"
  on public.athlete_endorsements
  for update
  using (auth.uid() = endorser_id)
  with check (
    auth.uid() = endorser_id
    and exists (
      select 1
      from public.games g
      join public.game_participants me on me.game_id = g.id and me.user_id = auth.uid()
      join public.game_participants them on them.game_id = g.id and them.user_id = athlete_endorsements.athlete_id
      where g.id = athlete_endorsements.game_id
        and g.status = 'completed'
    )
  );

-- Keep endorsements private; expose aggregates via RPC.
drop policy if exists "athlete_endorsements_select_none" on public.athlete_endorsements;

-- ---------- RPC: shared completed games ----------
drop function if exists public.get_shared_completed_games(uuid);
create or replace function public.get_shared_completed_games(
  p_other uuid
)
returns table (
  game_id uuid,
  title text,
  sport text,
  starts_at timestamptz,
  completed_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    g.id as game_id,
    g.title,
    g.sport,
    g.starts_at,
    g.updated_at as completed_at
  from public.games g
  join public.game_participants me
    on me.game_id = g.id
   and me.user_id = auth.uid()
  join public.game_participants them
    on them.game_id = g.id
   and them.user_id = p_other
  where auth.uid() is not null
    and p_other is not null
    and g.status = 'completed'
  order by coalesce(g.starts_at, g.updated_at, g.created_at) desc nulls last
  limit 25;
$$;

grant execute on function public.get_shared_completed_games(uuid) to authenticated;

-- ---------- RPC: endorse athlete (upsert) ----------
drop function if exists public.endorse_athlete(uuid, uuid, int, text[]);
create or replace function public.endorse_athlete(
  p_athlete uuid,
  p_game uuid,
  p_rating int,
  p_tags text[] default '{}'::text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated to endorse';
  end if;
  if p_athlete is null or p_game is null then
    raise exception 'Missing athlete or game';
  end if;
  if p_athlete = auth.uid() then
    raise exception 'Cannot endorse yourself';
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Rating must be between 1 and 5';
  end if;

  if not exists (
    select 1
    from public.games g
    join public.game_participants me on me.game_id = g.id and me.user_id = auth.uid()
    join public.game_participants them on them.game_id = g.id and them.user_id = p_athlete
    where g.id = p_game and g.status = 'completed'
  ) then
    raise exception 'You can only endorse after playing a completed game together';
  end if;

  insert into public.athlete_endorsements (game_id, athlete_id, endorser_id, rating, tags, updated_at)
  values (p_game, p_athlete, auth.uid(), p_rating, coalesce(p_tags, '{}'::text[]), now())
  on conflict (game_id, athlete_id, endorser_id) do update set
    rating = excluded.rating,
    tags = excluded.tags,
    updated_at = now();
end;
$$;

grant execute on function public.endorse_athlete(uuid, uuid, int, text[]) to authenticated;

-- ---------- RPC: public aggregate reputation ----------
drop function if exists public.get_athlete_reputation(uuid);
create or replace function public.get_athlete_reputation(
  p_athlete uuid
)
returns table (
  sportsmanship_avg double precision,
  sportsmanship_count int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(avg(e.rating)::double precision, 0) as sportsmanship_avg,
    coalesce(count(*)::int, 0) as sportsmanship_count
  from public.athlete_endorsements e
  where e.athlete_id = p_athlete;
$$;

grant execute on function public.get_athlete_reputation(uuid) to authenticated;
grant execute on function public.get_athlete_reputation(uuid) to anon;

-- ---------- Extend get_profiles_nearby (map needs rating) ----------
-- Return row shape changes vs older DBs — must DROP first (CREATE OR REPLACE is not enough).
do $$
declare
  fn regprocedure;
begin
  for fn in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'get_profiles_nearby'
  loop
    execute 'drop function if exists ' || fn::text || ' cascade';
  end loop;
end $$;

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
  sportsmanship double precision,
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
    rep.sportsmanship_avg as sportsmanship,
    pl.lat,
    pl.lng,
    (st_distance(st_setsrid(st_makePoint(pl.lng, pl.lat), 4326)::geography, st_setsrid(st_makePoint(lng, lat), 4326)::geography) / 1000.0) as distance_km
  from public.profile_locations pl
  join public.profiles p on p.id = pl.profile_id
  left join lateral (
    select coalesce(avg(e.rating)::double precision, null) as sportsmanship_avg
    from public.athlete_endorsements e
    where e.athlete_id = p.id
  ) rep on true
  where st_dwithin(
      st_setsrid(st_makePoint(pl.lng, pl.lat), 4326)::geography,
      st_setsrid(st_makePoint(lng, lat), 4326)::geography,
      radius_km * 1000.0
    )
  order by pl.updated_at desc
  limit limit_count;
$$;

notify pgrst, 'reload schema';

