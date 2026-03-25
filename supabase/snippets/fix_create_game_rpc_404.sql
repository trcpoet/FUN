-- One-shot fix when POST /rest/v1/rpc/create_game returns 404:
-- - Old create_game overload (e.g. from schema.sql with fewer args) does not match the app.
-- - Or GRANT EXECUTE was missing for anon/authenticated.
--
-- Run in Supabase → SQL Editor (paste all). Requires public.games and related tables to exist.
-- Prefer running migrations in order from ../MIGRATION_ORDER.md when bootstrapping a new project.

-- 1) Remove every overload of create_game so we can install the one the app expects.
do $$
declare
  r record;
begin
  for r in
    select format(
      '%I.%I(%s)',
      n.nspname,
      p.proname,
      pg_get_function_identity_arguments(p.oid)
    ) as fq
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_game'
  loop
    execute 'drop function if exists ' || r.fq || ' cascade';
  end loop;
end;
$$;

-- 2) Ensure games columns expected by create_game (safe if already present)
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'games' and column_name = 'status'
  ) then
    alter table public.games add column status text not null default 'open';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'games' and column_name = 'location_label'
  ) then
    alter table public.games add column location_label text;
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'games' and column_name = 'description'
  ) then
    alter table public.games add column description text;
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'games' and column_name = 'requirements'
  ) then
    alter table public.games add column requirements jsonb not null default '{}'::jsonb;
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
  p_description text default null,
  p_requirements jsonb default null
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
  insert into public.games (
    title, sport, spots_needed, location, created_by, status, starts_at, location_label, description, requirements
  )
  values (
    p_title,
    p_sport,
    coalesce(p_spots_needed, 2),
    st_setSRID(st_makePoint(p_lng, p_lat), 4326)::geography,
    auth.uid(),
    'open',
    p_starts_at,
    p_location_label,
    nullif(trim(coalesce(p_description, '')), ''),
    case
      when p_requirements is null then '{}'::jsonb
      when jsonb_typeof(p_requirements) = 'object' then p_requirements
      else '{}'::jsonb
    end
  )
  returning id into new_id;
  insert into public.game_participants (game_id, user_id, role)
  values (new_id, auth.uid(), 'host');
  return new_id;
end;
$$;

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
  spots_remaining int,
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
    coalesce(g.requirements, '{}'::jsonb) as requirements,
    coalesce(part.cnt, 0)::int as participant_count,
    greatest(g.spots_needed - coalesce(part.cnt, 0), 0)::int as spots_remaining,
    (st_distance(g.location, st_point(lng, lat)::geography) / 1000.0) as distance_km,
    st_y(g.location::geometry) as lat,
    st_x(g.location::geometry) as lng
  from public.games g
  left join lateral (
    select count(*)::int as cnt
    from public.game_participants gp
    where gp.game_id = g.id
  ) part on true
  where st_dwithin(g.location, st_point(lng, lat)::geography, radius_km * 1000.0)
  order by g.location <-> st_point(lng, lat)::geography
  limit 50;
$$;

grant execute on function public.get_games_nearby(double precision, double precision, double precision)
  to authenticated;
grant execute on function public.get_games_nearby(double precision, double precision, double precision)
  to anon;

-- 3) Same as migrations/20260322000000_create_game_grants.sql
grant execute on function public.create_game(
  text,
  text,
  double precision,
  double precision,
  int,
  timestamptz,
  text,
  text,
  jsonb
) to authenticated;

grant execute on function public.create_game(
  text,
  text,
  double precision,
  double precision,
  int,
  timestamptz,
  text,
  text,
  jsonb
) to anon;

notify pgrst, 'reload schema';
