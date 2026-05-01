-- =======================================================================
-- Map Notes + Unified Feed
-- =======================================================================
-- Adds:
--   * map_notes (location-anchored posts: public/friends/private)
--   * map_note_comments (comment threads)
--   * RPCs: create_map_note, get_notes_nearby, get_note_comments, add_note_comment,
--           get_unified_feed (games + notes + statuses)
--
-- Idempotent and safe to re-run.
-- After applying: NOTIFY pgrst, 'reload schema';
-- =======================================================================

set search_path = public;

-- -----------------------------------------------------------------------
-- 0) Social graph dependency (friends-only visibility)
-- -----------------------------------------------------------------------
-- Notes visibility uses the same "either-direction follow" rule as games.
-- Some deployments may not have run the game visibility migration yet, so
-- we create the dependency table here (idempotent).
create table if not exists public.user_follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  followed_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followed_id),
  check (follower_id <> followed_id)
);

create index if not exists user_follows_followed_idx on public.user_follows (followed_id);

alter table public.user_follows enable row level security;

drop policy if exists "user_follows: read public" on public.user_follows;
create policy "user_follows: read public"
  on public.user_follows for select
  using (true);

drop policy if exists "user_follows: insert own" on public.user_follows;
create policy "user_follows: insert own"
  on public.user_follows for insert
  with check (auth.uid() = follower_id);

drop policy if exists "user_follows: delete own" on public.user_follows;
create policy "user_follows: delete own"
  on public.user_follows for delete
  using (auth.uid() = follower_id);

-- -----------------------------------------------------------------------
-- 1) Core tables
-- -----------------------------------------------------------------------
create table if not exists public.map_notes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  body text not null,
  visibility text not null default 'public',
  place_name text
);

do $$
begin
  if not exists (
    select 1 from information_schema.check_constraints
    where constraint_schema = 'public'
      and constraint_name = 'map_notes_visibility_valid'
  ) then
    alter table public.map_notes
      add constraint map_notes_visibility_valid
      check (visibility in ('public','friends','private'));
  end if;
end $$;

create index if not exists map_notes_created_at_idx on public.map_notes (created_at desc);
create index if not exists map_notes_created_by_idx on public.map_notes (created_by);
create index if not exists map_notes_lat_lng_idx on public.map_notes (lat, lng);
create index if not exists map_notes_visibility_idx on public.map_notes (visibility);

create table if not exists public.map_note_comments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  note_id uuid not null references public.map_notes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null
);

create index if not exists map_note_comments_note_created_idx on public.map_note_comments (note_id, created_at asc);
create index if not exists map_note_comments_user_idx on public.map_note_comments (user_id, created_at desc);

-- -----------------------------------------------------------------------
-- 2) RLS policies
-- -----------------------------------------------------------------------
alter table public.map_notes enable row level security;
alter table public.map_note_comments enable row level security;

-- Map notes are visible if:
-- - public
-- - private: owner only
-- - friends: either-direction follow (same rule used for game visibility)
drop policy if exists "map_notes: read visible" on public.map_notes;
create policy "map_notes: read visible"
  on public.map_notes for select
  using (
    visibility = 'public'
    or (auth.uid() is not null and created_by = auth.uid())
    or (
      visibility = 'friends'
      and auth.uid() is not null
      and (
        exists (
          select 1 from public.user_follows
          where follower_id = auth.uid() and followed_id = created_by
        )
        or exists (
          select 1 from public.user_follows
          where follower_id = created_by and followed_id = auth.uid()
        )
      )
    )
  );

drop policy if exists "map_notes: insert own" on public.map_notes;
create policy "map_notes: insert own"
  on public.map_notes for insert
  with check (auth.uid() is not null and created_by = auth.uid());

drop policy if exists "map_notes: update own" on public.map_notes;
create policy "map_notes: update own"
  on public.map_notes for update
  using (auth.uid() is not null and created_by = auth.uid())
  with check (auth.uid() is not null and created_by = auth.uid());

drop policy if exists "map_notes: delete own" on public.map_notes;
create policy "map_notes: delete own"
  on public.map_notes for delete
  using (auth.uid() is not null and created_by = auth.uid());

-- Comments inherit visibility from the parent note.
drop policy if exists "map_note_comments: read if can see note" on public.map_note_comments;
create policy "map_note_comments: read if can see note"
  on public.map_note_comments for select
  using (
    exists (
      select 1 from public.map_notes n
      where n.id = note_id
    )
  );

drop policy if exists "map_note_comments: insert own if can see note" on public.map_note_comments;
create policy "map_note_comments: insert own if can see note"
  on public.map_note_comments for insert
  with check (
    auth.uid() is not null
    and user_id = auth.uid()
    and exists (
      select 1 from public.map_notes n
      where n.id = note_id
    )
  );

drop policy if exists "map_note_comments: delete own" on public.map_note_comments;
create policy "map_note_comments: delete own"
  on public.map_note_comments for delete
  using (auth.uid() is not null and user_id = auth.uid());

-- -----------------------------------------------------------------------
-- 3) Helpers: distance + bounds
-- -----------------------------------------------------------------------
create or replace function public.haversine_km(
  p_lat1 double precision,
  p_lng1 double precision,
  p_lat2 double precision,
  p_lng2 double precision
) returns double precision
language sql
immutable
as $$
  select 2 * 6371 * asin(
    sqrt(
      power(sin(radians((p_lat2 - p_lat1) / 2)), 2)
      + cos(radians(p_lat1)) * cos(radians(p_lat2))
      * power(sin(radians((p_lng2 - p_lng1) / 2)), 2)
    )
  );
$$;

-- -----------------------------------------------------------------------
-- 4) RPCs: notes + comments
-- -----------------------------------------------------------------------
create or replace function public.create_map_note(
  p_lat double precision,
  p_lng double precision,
  p_body text,
  p_visibility text,
  p_place_name text default null
) returns public.map_notes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_note public.map_notes;
  v_vis text := coalesce(nullif(trim(p_visibility), ''), 'public');
  v_body text := coalesce(p_body, '');
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  v_body := trim(v_body);
  if v_body = '' then
    raise exception 'empty_body' using errcode = '22023';
  end if;
  if length(v_body) > 2000 then
    v_body := left(v_body, 2000);
  end if;
  if v_vis not in ('public','friends','private') then
    raise exception 'invalid_visibility' using errcode = '22023';
  end if;

  insert into public.map_notes (created_by, lat, lng, body, visibility, place_name)
  values (v_uid, p_lat, p_lng, v_body, v_vis, nullif(trim(p_place_name), ''))
  returning * into v_note;

  return v_note;
end $$;

create or replace function public.get_notes_nearby(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision default 10,
  p_limit int default 50
) returns table (
  id uuid,
  created_at timestamptz,
  created_by uuid,
  lat double precision,
  lng double precision,
  body text,
  visibility text,
  place_name text,
  distance_km double precision,
  comment_count int
)
language sql
stable
as $$
  with bounds as (
    select
      greatest(0.5, least(100.0, coalesce(p_radius_km, 10.0))) as rkm,
      coalesce(p_lat, 0.0) as qlat,
      coalesce(p_lng, 0.0) as qlng
  ),
  box as (
    select
      rkm,
      qlat,
      qlng,
      (rkm / 111.0) as dlat,
      (rkm / (111.0 * greatest(0.2, cos(radians(qlat))))) as dlng
    from bounds
  ),
  comments as (
    select note_id, count(*)::int as cnt
      from public.map_note_comments
     group by note_id
  )
  select
    n.id,
    n.created_at,
    n.created_by,
    n.lat,
    n.lng,
    n.body,
    n.visibility,
    n.place_name,
    public.haversine_km((select qlat from box), (select qlng from box), n.lat, n.lng) as distance_km,
    coalesce(c.cnt, 0) as comment_count
  from public.map_notes n
  left join comments c on c.note_id = n.id
  where
    n.lat between (select qlat - dlat from box) and (select qlat + dlat from box)
    and n.lng between (select qlng - dlng from box) and (select qlng + dlng from box)
    and public.haversine_km((select qlat from box), (select qlng from box), n.lat, n.lng) <= (select rkm from box)
  order by n.created_at desc
  limit greatest(1, least(200, coalesce(p_limit, 50)));
$$;

create or replace function public.get_note_comments(p_note_id uuid)
returns table (
  id uuid,
  created_at timestamptz,
  note_id uuid,
  user_id uuid,
  body text
)
language sql
stable
as $$
  select c.id, c.created_at, c.note_id, c.user_id, c.body
    from public.map_note_comments c
   where c.note_id = p_note_id
   order by c.created_at asc;
$$;

create or replace function public.add_note_comment(
  p_note_id uuid,
  p_body text
) returns public.map_note_comments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.map_note_comments;
  v_body text := coalesce(p_body, '');
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  v_body := trim(v_body);
  if v_body = '' then
    raise exception 'empty_body' using errcode = '22023';
  end if;
  if length(v_body) > 2000 then
    v_body := left(v_body, 2000);
  end if;

  insert into public.map_note_comments (note_id, user_id, body)
  values (p_note_id, v_uid, v_body)
  returning * into v_row;

  return v_row;
end $$;

-- -----------------------------------------------------------------------
-- 5) Unified feed RPC
-- -----------------------------------------------------------------------
-- Shape is a single list with a discriminated union by `kind`.
create or replace function public.get_unified_feed(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision default 25,
  p_limit int default 80
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
  comment_count int
)
language sql
stable
as $$
  with cfg as (
    select
      coalesce(p_lat, 0.0) as qlat,
      coalesce(p_lng, 0.0) as qlng,
      greatest(0.5, least(100.0, coalesce(p_radius_km, 25.0))) as rkm,
      greatest(1, least(200, coalesce(p_limit, 80))) as lim
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
      (select count(*)::int from public.map_note_comments c where c.note_id = n.id) as comment_count
    from public.map_notes n
    where public.haversine_km((select qlat from cfg), (select qlng from cfg), n.lat, n.lng) <= (select rkm from cfg)
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
      g.visibility as visibility,
      null::int as comment_count
    from public.games g
    where public.is_game_visible_on_map(g.id)
      and public.haversine_km((select qlat from cfg), (select qlng from cfg), g.lat, g.lng) <= (select rkm from cfg)
  ),
  statuses as (
    select
      'status'::text as kind,
      (s.user_id::text || ':' || extract(epoch from s.created_at)::bigint::text) as id,
      s.created_at,
      null::double precision as lat,
      null::double precision as lng,
      null::text as title,
      s.body,
      null::text as sport,
      'public'::text as visibility,
      null::int as comment_count
    from public.get_recent_statuses(24) s
  )
  select *
    from (
      select * from notes
      union all
      select * from games
      union all
      select * from statuses
    ) u
   order by u.created_at desc
   limit (select lim from cfg);
$$;

grant execute on function public.haversine_km(double precision,double precision,double precision,double precision) to authenticated, anon;
grant execute on function public.get_notes_nearby(double precision,double precision,double precision,int) to authenticated, anon;
grant execute on function public.get_note_comments(uuid) to authenticated, anon;
grant execute on function public.get_unified_feed(double precision,double precision,double precision,int) to authenticated, anon;
grant execute on function public.create_map_note(double precision,double precision,text,text,text) to authenticated;
grant execute on function public.add_note_comment(uuid,text) to authenticated;

