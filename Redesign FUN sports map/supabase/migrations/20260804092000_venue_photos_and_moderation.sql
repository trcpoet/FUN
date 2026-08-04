-- ===========================================================================
-- User-uploaded venue photos + lightweight moderation.
--
-- WHY
-- ---
-- Google Places only matches a venue when it is a named, photographed place.
-- A bare OSM pitch ("baseball pitch", no name tag) usually matches nothing, so
-- its gallery is empty no matter how good the enrichment pipeline gets. Member
-- uploads are the only source that can fill those in — and they are the only
-- photos we are actually allowed to store bytes for (Google Places terms
-- permit storing place IDs indefinitely, not photo content).
--
-- MODERATION
-- ----------
-- There is no admin UI in this product, so moderation has to be autonomous:
-- three distinct reporters auto-hide a photo. The composite primary key on
-- venue_photo_reports is what makes "distinct" true — one report per user per
-- photo, enforced by the database rather than by client good manners. The
-- uploader keeps seeing their own hidden photo (so the hide isn't a silent
-- black hole) while it disappears for everyone else.
--
-- STORAGE
-- -------
-- Bytes live in the existing `avatars` bucket under venues/<uid>/<slug>/...
-- 20260804093000 adds that path to the bucket's RLS allowlist. Only the
-- storage_path is persisted here; the public URL is derived client-side, the
-- same contract createFeedMediaPost already uses.
-- ===========================================================================

set search_path = public;

-- ---------------------------------------------------------------------------
-- 1) Tables
-- ---------------------------------------------------------------------------
create table if not exists public.venue_photos (
  id           uuid primary key default gen_random_uuid(),
  venue_id     text not null references public.osm_sports_venues(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique,
  caption      text,
  status       text not null default 'visible',
  report_count int  not null default 0,
  created_at   timestamptz not null default now(),
  constraint venue_photos_status_valid check (status in ('visible', 'hidden', 'removed')),
  constraint venue_photos_caption_len  check (caption is null or length(caption) <= 200)
);

-- Partial index: the gallery only ever reads visible rows.
create index if not exists venue_photos_venue_created_idx
  on public.venue_photos (venue_id, created_at desc)
  where status = 'visible';
create index if not exists venue_photos_user_id_idx
  on public.venue_photos (user_id);

create table if not exists public.venue_photo_reports (
  photo_id   uuid not null references public.venue_photos(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  reason     text not null default 'other',
  created_at timestamptz not null default now(),
  primary key (photo_id, user_id),
  constraint venue_photo_reports_reason_valid
    check (reason in ('not_this_place', 'offensive', 'spam', 'private', 'other'))
);

create index if not exists venue_photo_reports_user_id_idx
  on public.venue_photo_reports (user_id);

-- ---------------------------------------------------------------------------
-- 2) Auto-hide trigger. Fires once per (photo, reporter) thanks to the PK.
-- ---------------------------------------------------------------------------
create or replace function public.trg_venue_photo_report_applied()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.venue_photos
     set report_count = report_count + 1,
         status = case
                    when status = 'visible' and report_count + 1 >= 3 then 'hidden'
                    else status
                  end
   where id = NEW.photo_id;
  return NEW;
end $$;

revoke execute on function public.trg_venue_photo_report_applied() from public, anon, authenticated;

drop trigger if exists venue_photo_reports_apply on public.venue_photo_reports;
create trigger venue_photo_reports_apply
  after insert on public.venue_photo_reports
  for each row execute procedure public.trg_venue_photo_report_applied();

-- ---------------------------------------------------------------------------
-- 3) RLS
-- ---------------------------------------------------------------------------
alter table public.venue_photos        enable row level security;
alter table public.venue_photo_reports enable row level security;

drop policy if exists "venue_photos: read visible or own" on public.venue_photos;
drop policy if exists "venue_photos: insert own"          on public.venue_photos;
drop policy if exists "venue_photos: delete own"          on public.venue_photos;

-- Hidden/removed photos stay visible to their uploader only.
create policy "venue_photos: read visible or own"
  on public.venue_photos for select to authenticated, anon
  using (status = 'visible' or user_id = (select auth.uid()));

create policy "venue_photos: insert own"
  on public.venue_photos for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "venue_photos: delete own"
  on public.venue_photos for delete to authenticated
  using ((select auth.uid()) = user_id);

-- No UPDATE policy: status/report_count are moderation state and may only be
-- changed by the SECURITY DEFINER trigger, never by the row's owner.

drop policy if exists "venue_photo_reports: read own"   on public.venue_photo_reports;
drop policy if exists "venue_photo_reports: insert own" on public.venue_photo_reports;

create policy "venue_photo_reports: read own"
  on public.venue_photo_reports for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "venue_photo_reports: insert own"
  on public.venue_photo_reports for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 4) RPCs
-- ---------------------------------------------------------------------------
create or replace function public.get_venue_photos(
  p_venue_id text,
  p_limit    int default 30
) returns table (
  id           uuid,
  created_at   timestamptz,
  venue_id     text,
  user_id      uuid,
  storage_path text,
  caption      text,
  status       text
)
language sql
stable
as $$
  select p.id, p.created_at, p.venue_id, p.user_id, p.storage_path, p.caption, p.status
    from public.venue_photos p
   where p.venue_id = p_venue_id
     and (p.status = 'visible' or p.user_id = (select auth.uid()))
   order by p.created_at desc
   limit greatest(1, least(100, coalesce(p_limit, 30)));
$$;

-- Abuse caps live here, not in the client, because the client is the attacker.
create or replace function public.add_venue_photo(
  p_venue_id     text,
  p_storage_path text,
  p_caption      text default null,
  p_lat          double precision default null,
  p_lng          double precision default null,
  p_name         text default null,
  p_sport        text default null,
  p_leisure      text default null
) returns public.venue_photos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_row     public.venue_photos;
  v_path    text := trim(coalesce(p_storage_path, ''));
  v_caption text := trim(coalesce(p_caption, ''));
  v_here    int;
  v_today   int;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if v_path = '' then
    raise exception 'empty_path' using errcode = '22023';
  end if;
  -- The uid segment must be the caller's own: storage RLS enforces this too,
  -- but rejecting here keeps orphan rows from ever being created.
  if v_path !~ ('^venues/' || v_uid::text || '/') then
    raise exception 'invalid_path' using errcode = '42501';
  end if;
  if length(v_caption) > 200 then
    v_caption := left(v_caption, 200);
  end if;

  select count(*) into v_here
    from public.venue_photos
   where venue_id = p_venue_id and user_id = v_uid and status <> 'removed';
  if v_here >= 5 then
    raise exception 'photo_limit_venue' using errcode = '22023';
  end if;

  select count(*) into v_today
    from public.venue_photos
   where user_id = v_uid and created_at > now() - interval '1 day';
  if v_today >= 20 then
    raise exception 'photo_limit_daily' using errcode = '22023';
  end if;

  perform public.ensure_venue_row(p_venue_id, p_lat, p_lng, p_name, p_sport, p_leisure);

  insert into public.venue_photos (venue_id, user_id, storage_path, caption)
  values (p_venue_id, v_uid, v_path, nullif(v_caption, ''))
  returning * into v_row;

  return v_row;
end $$;

-- Returns the storage path so the caller can also drop the object itself.
create or replace function public.delete_venue_photo(p_photo_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_path text;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;

  delete from public.venue_photos
   where id = p_photo_id and user_id = v_uid
  returning storage_path into v_path;

  return v_path;  -- null when nothing matched
end $$;

create or replace function public.report_venue_photo(
  p_photo_id uuid,
  p_reason   text default 'other'
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_reason text := coalesce(nullif(trim(coalesce(p_reason, '')), ''), 'other');
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if v_reason not in ('not_this_place', 'offensive', 'spam', 'private', 'other') then
    v_reason := 'other';
  end if;

  -- Idempotent: re-reporting is a no-op, so the trigger cannot be farmed.
  insert into public.venue_photo_reports (photo_id, user_id, reason)
  values (p_photo_id, v_uid, v_reason)
  on conflict (photo_id, user_id) do nothing;
end $$;

-- ---------------------------------------------------------------------------
-- 5) Grants — required, see the note in 20260804091000.
-- ---------------------------------------------------------------------------
grant execute on function public.get_venue_photos(text, int) to authenticated, anon;

grant execute on function public.add_venue_photo(text, text, text, double precision, double precision, text, text, text) to authenticated;
grant execute on function public.delete_venue_photo(uuid)     to authenticated;
grant execute on function public.report_venue_photo(uuid, text) to authenticated;

notify pgrst, 'reload schema';
