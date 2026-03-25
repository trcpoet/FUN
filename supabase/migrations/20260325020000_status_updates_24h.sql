-- Migration: 24h status updates (map + feed + profile)
--
-- Creates:
-- - status_updates: one active status per user (upsert)
-- - RPCs: upsert_my_status, get_recent_statuses, get_latest_status
-- - Extends get_profiles_nearby to include active status text + expiry

create table if not exists public.status_updates (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint status_updates_body_len check (char_length(trim(body)) > 0 and char_length(body) <= 280)
);

create index if not exists status_updates_expires_idx
  on public.status_updates (expires_at desc);

alter table public.status_updates enable row level security;

drop policy if exists "status_updates_select_public" on public.status_updates;
create policy "status_updates_select_public"
  on public.status_updates
  for select
  using (expires_at > now());

drop policy if exists "status_updates_insert_owner" on public.status_updates;
create policy "status_updates_insert_owner"
  on public.status_updates
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "status_updates_update_owner" on public.status_updates;
create policy "status_updates_update_owner"
  on public.status_updates
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- RPC: Upsert my status (24h TTL)
drop function if exists public.upsert_my_status(text);
create or replace function public.upsert_my_status(
  p_body text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated';
  end if;
  if p_body is null or char_length(trim(p_body)) = 0 then
    raise exception 'Status cannot be empty';
  end if;
  if char_length(p_body) > 280 then
    raise exception 'Status too long';
  end if;

  insert into public.status_updates (user_id, body, created_at, expires_at)
  values (auth.uid(), trim(p_body), now(), now() + interval '24 hours')
  on conflict (user_id) do update set
    body = excluded.body,
    created_at = excluded.created_at,
    expires_at = excluded.expires_at;
end;
$$;

grant execute on function public.upsert_my_status(text) to authenticated;

-- RPC: Recent statuses (for feed)
drop function if exists public.get_recent_statuses(int);
create or replace function public.get_recent_statuses(
  p_limit int default 50
)
returns table (
  user_id uuid,
  body text,
  created_at timestamptz,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select s.user_id, s.body, s.created_at, s.expires_at
  from public.status_updates s
  where s.expires_at > now()
  order by s.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

grant execute on function public.get_recent_statuses(int) to authenticated;
grant execute on function public.get_recent_statuses(int) to anon;

-- RPC: Latest status for a specific athlete
drop function if exists public.get_latest_status(uuid);
create or replace function public.get_latest_status(
  p_user uuid
)
returns table (
  body text,
  created_at timestamptz,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select s.body, s.created_at, s.expires_at
  from public.status_updates s
  where s.user_id = p_user
    and s.expires_at > now()
  limit 1;
$$;

grant execute on function public.get_latest_status(uuid) to authenticated;
grant execute on function public.get_latest_status(uuid) to anon;

-- Extend get_profiles_nearby: include sportsmanship (from endorsements migration) + status overlay
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
  status_body text,
  status_expires_at timestamptz,
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
    st.body as status_body,
    st.expires_at as status_expires_at,
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
  left join lateral (
    select s.body, s.expires_at
    from public.status_updates s
    where s.user_id = p.id
      and s.expires_at > now()
    limit 1
  ) st on true
  where st_dwithin(
      st_setsrid(st_makePoint(pl.lng, pl.lat), 4326)::geography,
      st_setsrid(st_makePoint(lng, lat), 4326)::geography,
      radius_km * 1000.0
    )
  order by pl.updated_at desc
  limit limit_count;
$$;

notify pgrst, 'reload schema';

