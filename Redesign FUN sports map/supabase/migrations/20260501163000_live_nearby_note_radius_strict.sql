-- =======================================================================
-- Live feed radius tweak: notes at >= 25km should not appear in Live
-- (Feed-only unless user taps location and jumps to map focus).
--
-- After applying: NOTIFY pgrst, 'reload schema';
-- =======================================================================

set search_path = public;

-- Ensure dependency exists even if migrations were run out of order.
create table if not exists public.map_note_likes (
  note_id uuid not null references public.map_notes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (note_id, user_id)
);

create index if not exists map_note_likes_note_idx on public.map_note_likes (note_id);

alter table public.map_note_likes enable row level security;

drop policy if exists "map_note_likes: read" on public.map_note_likes;
create policy "map_note_likes: read"
  on public.map_note_likes for select
  using (
    exists (
      select 1 from public.map_notes n
      where n.id = note_id
    )
  );

drop policy if exists "map_note_likes: insert own" on public.map_note_likes;
create policy "map_note_likes: insert own"
  on public.map_note_likes for insert
  with check (auth.uid() is not null and user_id = auth.uid());

drop policy if exists "map_note_likes: delete own" on public.map_note_likes;
create policy "map_note_likes: delete own"
  on public.map_note_likes for delete
  using (auth.uid() is not null and user_id = auth.uid());

create or replace function public.get_live_nearby(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision default 25,
  p_limit int default 40
) returns table (
  kind text,
  id text,
  created_at timestamptz,
  lat double precision,
  lng double precision,
  title text,
  body text,
  sport text,
  visibility text,
  comment_count int,
  created_by uuid,
  like_count int
)
language sql
stable
as $$
  with cfg as (
    select
      coalesce(p_lat, 0.0) as qlat,
      coalesce(p_lng, 0.0) as qlng,
      greatest(0.5, least(100.0, coalesce(p_radius_km, 25.0))) as rkm,
      greatest(1, least(200, coalesce(p_limit, 40))) as lim
  ),
  note_likes as (
    select l.note_id, count(*)::int as cnt from public.map_note_likes l group by l.note_id
  ),
  note_comments as (
    select c.note_id, count(*)::int as cnt from public.map_note_comments c group by c.note_id
  ),
  notes as (
    select
      'note'::text as kind,
      n.id::text as id,
      n.created_at,
      n.lat,
      n.lng,
      null::text as title,
      n.body,
      null::text as sport,
      n.visibility,
      coalesce(nc.cnt, 0) as comment_count,
      n.created_by,
      coalesce(nl.cnt, 0) as like_count
    from public.map_notes n
    left join note_likes nl on nl.note_id = n.id
    left join note_comments nc on nc.note_id = n.id
    where public.haversine_km((select qlat from cfg), (select qlng from cfg), n.lat, n.lng) < (select rkm from cfg)
  ),
  games as (
    select
      'game'::text as kind,
      g.id::text as id,
      g.created_at,
      g.lat,
      g.lng,
      g.title as title,
      g.description as body,
      g.sport,
      g.visibility::text as visibility,
      0::int as comment_count,
      g.created_by,
      0::int as like_count
    from public.games g
    where public.is_game_visible_on_map(g.id)
      and public.haversine_km((select qlat from cfg), (select qlng from cfg), g.lat, g.lng) <= (select rkm from cfg)
  )
  select * from (
    select * from notes
    union all
    select * from games
  ) u
  order by u.created_at desc
  limit (select lim from cfg);
$$;

grant execute on function public.get_live_nearby(double precision,double precision,double precision,int) to authenticated, anon;

notify pgrst, 'reload schema';

