-- =======================================================================
-- Live feed (25km games+notes), unified feed columns, statuses, likes,
-- status comments, notifications + writers
-- Idempotent where practical. After apply: NOTIFY pgrst, 'reload schema';
-- =======================================================================

set search_path = public;

-- -----------------------------------------------------------------------
-- 1) User statuses (history rows; global recent list for feed)
-- -----------------------------------------------------------------------
create table if not exists public.user_statuses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists user_statuses_created_at_idx
  on public.user_statuses (created_at desc);
create index if not exists user_statuses_user_idx
  on public.user_statuses (user_id, created_at desc);

alter table public.user_statuses enable row level security;

drop policy if exists "user_statuses: read non-expired" on public.user_statuses;
create policy "user_statuses: read non-expired"
  on public.user_statuses for select
  using (expires_at > now());

drop policy if exists "user_statuses: insert own" on public.user_statuses;
create policy "user_statuses: insert own"
  on public.user_statuses for insert
  with check (auth.uid() is not null and user_id = auth.uid());

drop policy if exists "user_statuses: delete own" on public.user_statuses;
create policy "user_statuses: delete own"
  on public.user_statuses for delete
  using (auth.uid() is not null and user_id = auth.uid());

create or replace function public.upsert_my_status(p_body text)
returns public.user_statuses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.user_statuses;
  v_body text := trim(coalesce(p_body, ''));
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if v_body = '' then
    raise exception 'empty_body' using errcode = '22023';
  end if;
  if length(v_body) > 2000 then
    v_body := left(v_body, 2000);
  end if;

  insert into public.user_statuses (user_id, body, expires_at)
  values (v_uid, v_body, now() + interval '48 hours')
  returning * into v_row;

  return v_row;
end $$;

create or replace function public.get_recent_statuses(p_limit int default 40)
returns table (
  id uuid,
  user_id uuid,
  body text,
  created_at timestamptz,
  expires_at timestamptz
)
language sql
stable
as $$
  select s.id, s.user_id, s.body, s.created_at, s.expires_at
    from public.user_statuses s
   where s.expires_at > now()
   order by s.created_at desc
   limit greatest(1, least(200, coalesce(p_limit, 40)));
$$;

create or replace function public.get_latest_status(p_user uuid)
returns table (
  body text,
  created_at timestamptz,
  expires_at timestamptz
)
language sql
stable
as $$
  select s.body, s.created_at, s.expires_at
    from public.user_statuses s
   where s.user_id = p_user
     and s.expires_at > now()
   order by s.created_at desc
   limit 1;
$$;

create or replace function public.delete_my_status(p_status_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  delete from public.user_statuses
   where id = p_status_id and user_id = v_uid;
end $$;

grant execute on function public.upsert_my_status(text) to authenticated;
grant execute on function public.get_recent_statuses(int) to authenticated, anon;
grant execute on function public.get_latest_status(uuid) to authenticated, anon;
grant execute on function public.delete_my_status(uuid) to authenticated;

-- -----------------------------------------------------------------------
-- 2) Likes + status comments
-- -----------------------------------------------------------------------
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

create table if not exists public.status_likes (
  status_id uuid not null references public.user_statuses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (status_id, user_id)
);

create index if not exists status_likes_status_idx on public.status_likes (status_id);

alter table public.status_likes enable row level security;

drop policy if exists "status_likes: read" on public.status_likes;
create policy "status_likes: read"
  on public.status_likes for select using (true);

drop policy if exists "status_likes: insert own" on public.status_likes;
create policy "status_likes: insert own"
  on public.status_likes for insert
  with check (auth.uid() is not null and user_id = auth.uid());

drop policy if exists "status_likes: delete own" on public.status_likes;
create policy "status_likes: delete own"
  on public.status_likes for delete
  using (auth.uid() is not null and user_id = auth.uid());

create table if not exists public.status_comments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  status_id uuid not null references public.user_statuses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null
);

create index if not exists status_comments_status_created_idx
  on public.status_comments (status_id, created_at asc);

alter table public.status_comments enable row level security;

drop policy if exists "status_comments: read" on public.status_comments;
create policy "status_comments: read"
  on public.status_comments for select using (true);

drop policy if exists "status_comments: insert own" on public.status_comments;
create policy "status_comments: insert own"
  on public.status_comments for insert
  with check (auth.uid() is not null and user_id = auth.uid());

drop policy if exists "status_comments: delete own" on public.status_comments;
create policy "status_comments: delete own"
  on public.status_comments for delete
  using (auth.uid() is not null and user_id = auth.uid());

create or replace function public.add_status_comment(
  p_status_id uuid,
  p_body text
) returns public.status_comments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.status_comments;
  v_body text := trim(coalesce(p_body, ''));
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if v_body = '' then
    raise exception 'empty_body' using errcode = '22023';
  end if;
  if length(v_body) > 2000 then
    v_body := left(v_body, 2000);
  end if;

  insert into public.status_comments (status_id, user_id, body)
  values (p_status_id, v_uid, v_body)
  returning * into v_row;

  return v_row;
end $$;

create or replace function public.get_status_comments(p_status_id uuid)
returns table (
  id uuid,
  created_at timestamptz,
  status_id uuid,
  user_id uuid,
  body text
)
language sql
stable
as $$
  select c.id, c.created_at, c.status_id, c.user_id, c.body
    from public.status_comments c
   where c.status_id = p_status_id
   order by c.created_at asc;
$$;

grant execute on function public.add_status_comment(uuid, text) to authenticated;
grant execute on function public.get_status_comments(uuid) to authenticated, anon;

-- -----------------------------------------------------------------------
-- 3) Notifications table + RLS
-- -----------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "notifications: read own" on public.notifications;
create policy "notifications: read own"
  on public.notifications for select
  using (auth.uid() is not null and user_id = auth.uid());

drop policy if exists "notifications: update own" on public.notifications;
create policy "notifications: update own"
  on public.notifications for update
  using (auth.uid() is not null and user_id = auth.uid());

-- Inserts performed by SECURITY DEFINER triggers bypass RLS on notifications.

-- -----------------------------------------------------------------------
-- 4) Notification helper (definer inserts for arbitrary user)
-- -----------------------------------------------------------------------
create or replace function public.enqueue_notification(
  p_user_id uuid,
  p_type text,
  p_payload jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null or p_type is null or length(trim(p_type)) = 0 then
    return;
  end if;
  insert into public.notifications (user_id, type, payload)
  values (p_user_id, p_type, coalesce(p_payload, '{}'::jsonb));
end $$;

-- -----------------------------------------------------------------------
-- 5) Triggers: follow, nearby game/note, invite, note thread
-- -----------------------------------------------------------------------
create or replace function public.trg_notify_on_follow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.enqueue_notification(
    NEW.followed_id,
    'new_follower',
    jsonb_build_object('follower_id', NEW.follower_id)
  );
  return NEW;
end $$;

drop trigger if exists user_follows_notify_followed on public.user_follows;
create trigger user_follows_notify_followed
  after insert on public.user_follows
  for each row execute procedure public.trg_notify_on_follow();

create or replace function public.trg_notify_nearby_on_game()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.lat is null or NEW.lng is null or NEW.created_by is null then
    return NEW;
  end if;
  -- Best-effort: only if profiles expose lat/lng (optional columns).
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'lat'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'lng'
  ) then
    insert into public.notifications (user_id, type, payload)
    select p.id,
           'game_nearby',
           jsonb_build_object(
             'game_id', NEW.id,
             'title', NEW.title,
             'sport', NEW.sport,
             'lat', NEW.lat,
             'lng', NEW.lng,
             'created_by', NEW.created_by
           )
      from public.profiles p
     where p.id is distinct from NEW.created_by
       and p.lat is not null
       and p.lng is not null
       and public.haversine_km(p.lat, p.lng, NEW.lat, NEW.lng) <= 25.0;
  end if;
  return NEW;
end $$;

drop trigger if exists games_notify_nearby_insert on public.games;
create trigger games_notify_nearby_insert
  after insert on public.games
  for each row execute procedure public.trg_notify_nearby_on_game();

create or replace function public.trg_notify_nearby_on_map_note()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.visibility <> 'public' then
    return NEW;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'lat'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'lng'
  ) then
    insert into public.notifications (user_id, type, payload)
    select p.id,
           'map_note_nearby',
           jsonb_build_object(
             'note_id', NEW.id,
             'lat', NEW.lat,
             'lng', NEW.lng,
             'created_by', NEW.created_by
           )
      from public.profiles p
     where p.id is distinct from NEW.created_by
       and p.lat is not null
       and p.lng is not null
       and public.haversine_km(p.lat, p.lng, NEW.lat, NEW.lng) <= 25.0;
  end if;
  return NEW;
end $$;

drop trigger if exists map_notes_notify_nearby_insert on public.map_notes;
create trigger map_notes_notify_nearby_insert
  after insert on public.map_notes
  for each row execute procedure public.trg_notify_nearby_on_map_note();

create or replace function public.trg_notify_game_invite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lat double precision;
  v_lng double precision;
  v_near boolean := true;
  v_has_geo boolean;
begin
  if NEW.status is distinct from 'pending' then
    return NEW;
  end if;
  select g.lat, g.lng into v_lat, v_lng
    from public.games g
   where g.id = NEW.game_id;
  select exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'profiles' and c.column_name = 'lat'
  ) and exists (
    select 1 from information_schema.columns c2
    where c2.table_schema = 'public' and c2.table_name = 'profiles' and c2.column_name = 'lng'
  ) into v_has_geo;

  if v_has_geo and v_lat is not null and v_lng is not null then
    select public.haversine_km(p.lat, p.lng, v_lat, v_lng) <= 50.0
      into v_near
      from public.profiles p
     where p.id = NEW.invitee_user_id;
    if not found then
      v_near := true;
    end if;
  end if;

  perform public.enqueue_notification(
    NEW.invitee_user_id,
    'game_invite',
    jsonb_build_object(
      'game_id', NEW.game_id,
      'invited_by', NEW.invited_by_user_id,
      'near_game', v_near
    )
  );
  return NEW;
end $$;

drop trigger if exists game_chat_invites_notify on public.game_chat_invites;
create trigger game_chat_invites_notify
  after insert on public.game_chat_invites
  for each row execute procedure public.trg_notify_game_invite();

create or replace function public.trg_notify_note_thread_participants()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, type, payload)
  select distinct x.uid,
         'note_new_activity',
         jsonb_build_object(
           'note_id', NEW.note_id,
           'comment_id', NEW.id,
           'actor_id', NEW.user_id
         )
    from (
      select n.created_by as uid
        from public.map_notes n
       where n.id = NEW.note_id
      union
      select c.user_id as uid
        from public.map_note_comments c
       where c.note_id = NEW.note_id
         and c.id is distinct from NEW.id
    ) x
   where x.uid is not null
     and x.uid is distinct from NEW.user_id;
  return NEW;
end $$;

drop trigger if exists map_note_comments_notify_thread on public.map_note_comments;
create trigger map_note_comments_notify_thread
  after insert on public.map_note_comments
  for each row execute procedure public.trg_notify_note_thread_participants();

-- -----------------------------------------------------------------------
-- 6) get_live_nearby + get_unified_feed (extended return + map radius)
-- -----------------------------------------------------------------------
drop function if exists public.get_unified_feed(double precision,double precision,double precision,int);

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

create or replace function public.get_unified_feed(
  p_lat double precision,
  p_lng double precision,
  p_map_radius_km double precision default 120,
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
      greatest(1.0, least(300.0, coalesce(p_map_radius_km, 120.0))) as rkm,
      greatest(1, least(200, coalesce(p_limit, 80))) as lim
  ),
  note_likes as (
    select l.note_id, count(*)::int as cnt from public.map_note_likes l group by l.note_id
  ),
  note_comments as (
    select c.note_id, count(*)::int as cnt from public.map_note_comments c group by c.note_id
  ),
  status_likes_c as (
    select l.status_id, count(*)::int as cnt from public.status_likes l group by l.status_id
  ),
  status_comments_c as (
    select c.status_id, count(*)::int as cnt from public.status_comments c group by c.status_id
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
      g.visibility::text as visibility,
      0::int as comment_count,
      g.created_by,
      0::int as like_count
    from public.games g
    where public.is_game_visible_on_map(g.id)
      and public.haversine_km((select qlat from cfg), (select qlng from cfg), g.lat, g.lng) <= (select rkm from cfg)
  ),
  statuses as (
    select
      'status'::text as kind,
      s.id::text as id,
      s.created_at,
      null::double precision as lat,
      null::double precision as lng,
      null::text as title,
      s.body,
      null::text as sport,
      'public'::text as visibility,
      coalesce(sc.cnt, 0) as comment_count,
      s.user_id as created_by,
      coalesce(slc.cnt, 0) as like_count
    from public.get_recent_statuses(80) s
    left join status_likes_c slc on slc.status_id = s.id
    left join status_comments_c sc on sc.status_id = s.id
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

grant execute on function public.get_live_nearby(double precision,double precision,double precision,int) to authenticated, anon;
grant execute on function public.get_unified_feed(double precision,double precision,double precision,int) to authenticated, anon;

-- -----------------------------------------------------------------------
-- 7) Feed media (storage paths; UI can follow in a later pass)
-- -----------------------------------------------------------------------
create table if not exists public.feed_media_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  body text,
  storage_path text not null,
  created_at timestamptz not null default now()
);

create index if not exists feed_media_posts_created_idx
  on public.feed_media_posts (created_at desc);

alter table public.feed_media_posts enable row level security;

drop policy if exists "feed_media_posts: read all" on public.feed_media_posts;
create policy "feed_media_posts: read all"
  on public.feed_media_posts for select using (true);

drop policy if exists "feed_media_posts: insert own" on public.feed_media_posts;
create policy "feed_media_posts: insert own"
  on public.feed_media_posts for insert
  with check (auth.uid() is not null and user_id = auth.uid());

drop policy if exists "feed_media_posts: delete own" on public.feed_media_posts;
create policy "feed_media_posts: delete own"
  on public.feed_media_posts for delete
  using (auth.uid() is not null and user_id = auth.uid());

notify pgrst, 'reload schema';
