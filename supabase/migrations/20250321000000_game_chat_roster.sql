-- Per-game chat + roster counts on nearby games.

-- 1) Messages (participants only via RLS)
create table if not exists public.game_messages (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint game_messages_body_len check (
    char_length(trim(body)) > 0
    and char_length(body) <= 2000
  )
);

create index if not exists game_messages_game_created_idx
  on public.game_messages (game_id, created_at desc);

alter table public.game_messages enable row level security;

drop policy if exists "game_messages_select_participants" on public.game_messages;
create policy "game_messages_select_participants"
  on public.game_messages for select
  using (
    exists (
      select 1 from public.game_participants gp
      where gp.game_id = game_messages.game_id
        and gp.user_id = auth.uid()
    )
  );

drop policy if exists "game_messages_insert_participants" on public.game_messages;
create policy "game_messages_insert_participants"
  on public.game_messages for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.game_participants gp
      where gp.game_id = game_messages.game_id
        and gp.user_id = auth.uid()
    )
  );

-- Realtime (idempotent)
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'game_messages'
  ) then
    alter publication supabase_realtime add table public.game_messages;
  end if;
end;
$$;

-- 2) Nearby games include headcount + spots left (capacity includes host)
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

-- 3) Inbox: games I joined, with last message preview
create or replace function public.get_my_game_inbox()
returns table (
  id uuid,
  title text,
  sport text,
  starts_at timestamptz,
  location_label text,
  last_message_body text,
  last_message_at timestamptz,
  participant_count int,
  spots_remaining int
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
    g.starts_at,
    g.location_label,
    lm.body as last_message_body,
    lm.created_at as last_message_at,
    coalesce(pc.cnt, 0)::int as participant_count,
    greatest(g.spots_needed - coalesce(pc.cnt, 0), 0)::int as spots_remaining
  from public.game_participants me
  join public.games g on g.id = me.game_id
  left join lateral (
    select count(*)::int as cnt
    from public.game_participants gp
    where gp.game_id = g.id
  ) pc on true
  left join lateral (
    select m.body, m.created_at
    from public.game_messages m
    where m.game_id = g.id
    order by m.created_at desc
    limit 1
  ) lm on true
  where me.user_id = auth.uid()
  order by coalesce(lm.created_at, g.starts_at, g.created_at) desc nulls last;
$$;

grant execute on function public.get_my_game_inbox() to authenticated;
grant execute on function public.get_my_game_inbox() to anon;

notify pgrst, 'reload schema';
