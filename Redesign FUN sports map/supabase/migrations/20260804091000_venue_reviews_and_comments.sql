-- ===========================================================================
-- Venue reviews + venue comment thread.
--
-- WHY
-- ---
-- The venue Details modal had no first-party social layer at all. Two distinct
-- needs, deliberately kept as two tables:
--   * venue_reviews  — a rated verdict on the place. ONE per user per venue,
--                      editable, so the aggregate means something.
--   * venue_comments — an open thread ("anyone playing at 6?"). Many per user,
--                      likeable, disposable.
-- Collapsing them into one table would force either "rating optional" (which
-- poisons the average) or "one comment per user" (which kills the thread).
--
-- THE LAZY-VENUE PROBLEM (why ensure_venue_row exists)
-- ----------------------------------------------------
-- osm_sports_venues rows are inserted lazily: the client renders venues
-- straight from Overpass GeoJSON (src/app/lib/sportsVenues.ts) and the caching
-- import runs afterwards in the background. So a user can very reasonably be
-- looking at a venue that has no row yet. A plain foreign key would reject
-- their review with an opaque 23503. Every write RPC below therefore calls
-- ensure_venue_row() first, which inserts a minimal row from the geometry the
-- client is already displaying. That keeps the real FK (and its cascade)
-- instead of degrading to an unconstrained text column.
--
-- GOOGLE PLACES NOTE
-- ------------------
-- These are FIRST-PARTY reviews only. Google review text is never imported
-- here — Places terms forbid commingling it with other reviews. Google's
-- aggregate rating lives in osm_sports_venues.google_details and is rendered
-- as a separately-labelled chip.
-- ===========================================================================

set search_path = public;

-- ---------------------------------------------------------------------------
-- 1) Venue-row guarantee. INTERNAL ONLY — never granted to anon/authenticated.
--    Callable solely from the SECURITY DEFINER write RPCs below.
-- ---------------------------------------------------------------------------
create or replace function public.ensure_venue_row(
  p_venue_id text,
  p_lat      double precision default null,
  p_lng      double precision default null,
  p_name     text default null,
  p_sport    text default null,
  p_leisure  text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text;
  v_num  bigint;
begin
  -- Venue ids are always "<osm_type>/<osm_id>" (server/lib/osmVenueTags.ts).
  if p_venue_id is null or p_venue_id !~ '^(node|way|relation)/[0-9]+$' then
    raise exception 'invalid_venue_id' using errcode = '22023';
  end if;

  if exists (select 1 from public.osm_sports_venues where id = p_venue_id) then
    return;
  end if;

  -- No row yet, so we need usable geometry to create one. Refuse rather than
  -- invent a venue at (0,0).
  if p_lat is null or p_lng is null
     or p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then
    raise exception 'unknown_venue' using errcode = '23503';
  end if;

  v_type := split_part(p_venue_id, '/', 1);
  v_num  := split_part(p_venue_id, '/', 2)::bigint;

  insert into public.osm_sports_venues (id, lat, lng, name, sport, leisure, osm_type, osm_id)
  values (
    p_venue_id, p_lat, p_lng,
    nullif(trim(coalesce(p_name, '')), ''),
    nullif(trim(coalesce(p_sport, '')), ''),
    nullif(trim(coalesce(p_leisure, '')), ''),
    v_type, v_num
  )
  -- do nothing: a concurrent OSM import must always win over a client-seeded row.
  on conflict (id) do nothing;
end $$;

revoke execute on function public.ensure_venue_row(text, double precision, double precision, text, text, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) Tables
-- ---------------------------------------------------------------------------
create table if not exists public.venue_reviews (
  id         uuid primary key default gen_random_uuid(),
  venue_id   text not null references public.osm_sports_venues(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  rating     smallint not null,
  body       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint venue_reviews_rating_range check (rating between 1 and 5),
  constraint venue_reviews_body_len     check (body is null or length(body) <= 2000),
  constraint venue_reviews_one_per_user unique (venue_id, user_id)
);

create index if not exists venue_reviews_venue_created_idx
  on public.venue_reviews (venue_id, created_at desc);
create index if not exists venue_reviews_user_id_idx
  on public.venue_reviews (user_id);

create table if not exists public.venue_comments (
  id         uuid primary key default gen_random_uuid(),
  venue_id   text not null references public.osm_sports_venues(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now(),
  constraint venue_comments_body_len check (length(body) <= 2000)
);

create index if not exists venue_comments_venue_created_idx
  on public.venue_comments (venue_id, created_at desc);
create index if not exists venue_comments_user_id_idx
  on public.venue_comments (user_id);

-- Composite-PK junction, identical in shape to map_note_comment_likes.
create table if not exists public.venue_comment_likes (
  comment_id uuid not null references public.venue_comments(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index if not exists venue_comment_likes_user_id_idx
  on public.venue_comment_likes (user_id);

-- ---------------------------------------------------------------------------
-- 3) RLS — modern style: (select auth.uid()) for initplan hoisting, and an
--    explicit TO role on every write policy.
-- ---------------------------------------------------------------------------
alter table public.venue_reviews       enable row level security;
alter table public.venue_comments      enable row level security;
alter table public.venue_comment_likes enable row level security;

drop policy if exists "venue_reviews: read all"    on public.venue_reviews;
drop policy if exists "venue_reviews: insert own"  on public.venue_reviews;
drop policy if exists "venue_reviews: update own"  on public.venue_reviews;
drop policy if exists "venue_reviews: delete own"  on public.venue_reviews;

create policy "venue_reviews: read all"
  on public.venue_reviews for select to authenticated, anon
  using (true);

create policy "venue_reviews: insert own"
  on public.venue_reviews for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "venue_reviews: update own"
  on public.venue_reviews for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "venue_reviews: delete own"
  on public.venue_reviews for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "venue_comments: read all"   on public.venue_comments;
drop policy if exists "venue_comments: insert own" on public.venue_comments;
drop policy if exists "venue_comments: delete own" on public.venue_comments;

create policy "venue_comments: read all"
  on public.venue_comments for select to authenticated, anon
  using (true);

create policy "venue_comments: insert own"
  on public.venue_comments for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- No UPDATE policy: comments are immutable, matching map_note_comments.
create policy "venue_comments: delete own"
  on public.venue_comments for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "venue_comment_likes: read if comment exists" on public.venue_comment_likes;
drop policy if exists "venue_comment_likes: insert own"             on public.venue_comment_likes;
drop policy if exists "venue_comment_likes: delete own"             on public.venue_comment_likes;

create policy "venue_comment_likes: read if comment exists"
  on public.venue_comment_likes for select to authenticated, anon
  using (exists (select 1 from public.venue_comments c where c.id = comment_id));

create policy "venue_comment_likes: insert own"
  on public.venue_comment_likes for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.venue_comments c where c.id = comment_id)
  );

create policy "venue_comment_likes: delete own"
  on public.venue_comment_likes for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 4) Read RPCs — SECURITY INVOKER so RLS still applies. (These are also
--    untouched by the 20260723090000 prosecdef revoke loop.)
-- ---------------------------------------------------------------------------

-- Rows + the aggregate in one round-trip. total_count/avg_rating are computed
-- over the WHOLE venue, before limit/offset, so paging never skews the header.
-- NOTE: computed under RLS. Safe while the read policy is `using (true)`; if a
-- block-list policy is ever added, ratings would silently differ per viewer.
create or replace function public.get_venue_reviews(
  p_venue_id text,
  p_limit    int default 20,
  p_offset   int default 0
) returns table (
  id          uuid,
  created_at  timestamptz,
  updated_at  timestamptz,
  venue_id    text,
  user_id     uuid,
  rating      smallint,
  body        text,
  is_mine     boolean,
  total_count int,
  avg_rating  numeric
)
language sql
stable
as $$
  with stats as (
    select count(*)::int as total_count,
           round(avg(rating)::numeric, 2) as avg_rating
      from public.venue_reviews
     where venue_id = p_venue_id
  )
  select
    r.id, r.created_at, r.updated_at, r.venue_id, r.user_id, r.rating, r.body,
    (r.user_id = (select auth.uid())) as is_mine,
    s.total_count,
    s.avg_rating
  from public.venue_reviews r
  cross join stats s
  where r.venue_id = p_venue_id
  -- Your own review floats to the top so editing it is always one tap away.
  order by (r.user_id = (select auth.uid())) desc, r.created_at desc
  limit greatest(1, least(100, coalesce(p_limit, 20)))
  offset greatest(0, coalesce(p_offset, 0));
$$;

-- Direct analogue of get_note_comments_with_likes (20260501180000).
create or replace function public.get_venue_comments_with_likes(
  p_venue_id text,
  p_limit    int default 50,
  p_offset   int default 0
) returns table (
  id          uuid,
  created_at  timestamptz,
  venue_id    text,
  user_id     uuid,
  body        text,
  like_count  int,
  liked_by_me boolean
)
language sql
stable
as $$
  select
    c.id,
    c.created_at,
    c.venue_id,
    c.user_id,
    c.body,
    coalesce(l.cnt, 0) as like_count,
    exists (
      select 1
        from public.venue_comment_likes mine
       where mine.comment_id = c.id
         and mine.user_id = (select auth.uid())
    ) as liked_by_me
  from public.venue_comments c
  left join (
    select comment_id, count(*)::int as cnt
      from public.venue_comment_likes
     group by comment_id
  ) l on l.comment_id = c.id
  where c.venue_id = p_venue_id
  order by c.created_at desc
  limit greatest(1, least(200, coalesce(p_limit, 50)))
  offset greatest(0, coalesce(p_offset, 0));
$$;

-- ---------------------------------------------------------------------------
-- 5) Write RPCs — SECURITY DEFINER. Guard prologue matches add_note_comment.
--    The p_lat/p_lng/p_name/p_sport/p_leisure tail exists purely so
--    ensure_venue_row() can materialise a not-yet-cached venue.
-- ---------------------------------------------------------------------------
create or replace function public.upsert_venue_review(
  p_venue_id text,
  p_rating   int,
  p_body     text default null,
  p_lat      double precision default null,
  p_lng      double precision default null,
  p_name     text default null,
  p_sport    text default null,
  p_leisure  text default null
) returns public.venue_reviews
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_row  public.venue_reviews;
  v_body text := trim(coalesce(p_body, ''));
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'invalid_rating' using errcode = '22023';
  end if;
  if length(v_body) > 2000 then
    v_body := left(v_body, 2000);
  end if;

  perform public.ensure_venue_row(p_venue_id, p_lat, p_lng, p_name, p_sport, p_leisure);

  insert into public.venue_reviews (venue_id, user_id, rating, body)
  values (p_venue_id, v_uid, p_rating::smallint, nullif(v_body, ''))
  on conflict (venue_id, user_id) do update
    set rating     = excluded.rating,
        body       = excluded.body,
        updated_at = now()
  returning * into v_row;

  return v_row;
end $$;

create or replace function public.delete_venue_review(p_venue_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_n   int;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  delete from public.venue_reviews
   where venue_id = p_venue_id and user_id = v_uid;
  get diagnostics v_n = row_count;
  return v_n > 0;
end $$;

create or replace function public.add_venue_comment(
  p_venue_id text,
  p_body     text,
  p_lat      double precision default null,
  p_lng      double precision default null,
  p_name     text default null,
  p_sport    text default null,
  p_leisure  text default null
) returns public.venue_comments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_row  public.venue_comments;
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

  perform public.ensure_venue_row(p_venue_id, p_lat, p_lng, p_name, p_sport, p_leisure);

  insert into public.venue_comments (venue_id, user_id, body)
  values (p_venue_id, v_uid, v_body)
  returning * into v_row;

  return v_row;
end $$;

create or replace function public.delete_venue_comment(p_comment_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_n   int;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  delete from public.venue_comments
   where id = p_comment_id and user_id = v_uid;
  get diagnostics v_n = row_count;
  return v_n > 0;
end $$;

-- Atomic toggle: avoids the delete-then-insert race the client-side pattern has.
create or replace function public.toggle_venue_comment_like(p_comment_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_n   int;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;

  delete from public.venue_comment_likes
   where comment_id = p_comment_id and user_id = v_uid;
  get diagnostics v_n = row_count;
  if v_n > 0 then
    return false;  -- was liked, now unliked
  end if;

  insert into public.venue_comment_likes (comment_id, user_id)
  values (p_comment_id, v_uid)
  on conflict do nothing;
  return true;
end $$;

-- ---------------------------------------------------------------------------
-- 6) Grants.
--    MANDATORY: 20260723090000_harden_rpc_grants_and_duplicate_policies.sql
--    blanket-revokes EXECUTE on every prosecdef function in `public` and
--    re-grants only from a static allowlist that cannot know about these.
--    Without these explicit grants a rebuilt database returns 42501 to every
--    signed-in user (see 20260723100000_regrant_client_rpc_execute.sql, which
--    exists solely because seven RPCs were missed the first time).
-- ---------------------------------------------------------------------------
grant execute on function public.get_venue_reviews(text, int, int)             to authenticated, anon;
grant execute on function public.get_venue_comments_with_likes(text, int, int) to authenticated, anon;

grant execute on function public.upsert_venue_review(text, int, text, double precision, double precision, text, text, text) to authenticated;
grant execute on function public.delete_venue_review(text)                                                                 to authenticated;
grant execute on function public.add_venue_comment(text, text, double precision, double precision, text, text, text)       to authenticated;
grant execute on function public.delete_venue_comment(uuid)                                                                to authenticated;
grant execute on function public.toggle_venue_comment_like(uuid)                                                           to authenticated;

notify pgrst, 'reload schema';
