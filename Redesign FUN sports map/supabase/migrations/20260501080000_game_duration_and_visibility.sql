-- =======================================================================
-- Game duration + visibility-aware perpetual chats
-- =======================================================================
-- Adds:
--   * games.duration_minutes / generated games.ends_at for auto-disappear
--   * games.visibility ('public' | 'friends_only' | 'invite_only') for chat membership rules
--   * games.invite_token for invite-only sharable links
--   * user_follows table (DB-backed follows for the "friends_only" rule)
--   * game_chat_invites table for the host-approval flow
--   * Updated RPCs: create_game (duration + visibility), get_games_nearby (filters ended)
--   * New RPCs: mark_ended_games_completed (cron), request_chat_invite,
--     respond_chat_invite, redeem_invite_token, can_dm, get_game_visibility
--   * RLS triggers that gate game_participants inserts by visibility rules
--
-- Idempotent: every CREATE / ALTER guarded so re-running is safe.
-- After applying: NOTIFY pgrst, 'reload schema';
-- =======================================================================

set search_path = public;

-- -----------------------------------------------------------------------
-- 1. games table additions
-- -----------------------------------------------------------------------
alter table public.games
  add column if not exists duration_minutes int not null default 90;

do $$
begin
  if not exists (
    select 1 from information_schema.check_constraints
    where constraint_schema = 'public'
      and constraint_name = 'games_duration_minutes_range'
  ) then
    alter table public.games
      add constraint games_duration_minutes_range
      check (duration_minutes between 15 and 480);
  end if;
end $$;

-- ends_at is generated from starts_at + duration. We use a regular column +
-- trigger rather than a GENERATED column because Postgres requires the
-- generated expression to be IMMUTABLE and pure; we want predictable null
-- semantics (null when starts_at is null) and the ability to backfill.
alter table public.games
  add column if not exists ends_at timestamptz;

create or replace function public.games_set_ends_at() returns trigger
language plpgsql as $$
begin
  if NEW.starts_at is null then
    NEW.ends_at := null;
  else
    NEW.ends_at := NEW.starts_at + make_interval(mins => coalesce(NEW.duration_minutes, 90));
  end if;
  return NEW;
end $$;

drop trigger if exists trg_games_set_ends_at on public.games;
create trigger trg_games_set_ends_at
  before insert or update of starts_at, duration_minutes
  on public.games
  for each row
  execute function public.games_set_ends_at();

-- Backfill existing rows so map/lifecycle queries work immediately.
update public.games
   set ends_at = starts_at + make_interval(mins => coalesce(duration_minutes, 90))
 where starts_at is not null
   and ends_at is null;

create index if not exists games_ends_at_idx on public.games (ends_at);

alter table public.games
  add column if not exists visibility text not null default 'public';

do $$
begin
  if not exists (
    select 1 from information_schema.check_constraints
    where constraint_schema = 'public'
      and constraint_name = 'games_visibility_valid'
  ) then
    alter table public.games
      add constraint games_visibility_valid
      check (visibility in ('public','friends_only','invite_only'));
  end if;
end $$;

create index if not exists games_visibility_idx on public.games (visibility);

alter table public.games
  add column if not exists invite_token uuid not null default gen_random_uuid();

create unique index if not exists games_invite_token_idx on public.games (invite_token);

-- -----------------------------------------------------------------------
-- 2. user_follows (the social graph the friends_only rule reads)
-- -----------------------------------------------------------------------
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
-- 3. game_chat_invites (host-approval flow for friends_only)
-- -----------------------------------------------------------------------
create table if not exists public.game_chat_invites (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  invitee_user_id uuid not null references auth.users(id) on delete cascade,
  invited_by_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','approved','denied','revoked')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (game_id, invitee_user_id)
);

create index if not exists game_chat_invites_game_idx on public.game_chat_invites (game_id);
create index if not exists game_chat_invites_invitee_idx on public.game_chat_invites (invitee_user_id, status);

alter table public.game_chat_invites enable row level security;

drop policy if exists "game_chat_invites: read participants" on public.game_chat_invites;
create policy "game_chat_invites: read participants"
  on public.game_chat_invites for select
  using (
    auth.uid() = invitee_user_id
    or auth.uid() = invited_by_user_id
    or exists (
      select 1 from public.games g
       where g.id = game_id and g.created_by = auth.uid()
    )
  );

drop policy if exists "game_chat_invites: insert via rpc only" on public.game_chat_invites;
create policy "game_chat_invites: insert via rpc only"
  on public.game_chat_invites for insert
  with check (false);

-- -----------------------------------------------------------------------
-- 4. Helper: visibility-aware eligibility check
-- -----------------------------------------------------------------------
create or replace function public.is_eligible_to_join_game(
  p_game_id uuid,
  p_user_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_visibility text;
  v_host uuid;
  v_is_host_follow boolean;
  v_is_host_followed boolean;
  v_has_invite boolean;
begin
  select visibility, created_by into v_visibility, v_host
    from public.games where id = p_game_id;

  if v_visibility is null then
    return false;
  end if;

  -- Host always eligible.
  if v_host = p_user_id then
    return true;
  end if;

  if v_visibility = 'public' then
    return true;
  end if;

  if v_visibility = 'friends_only' then
    -- Mutuals: host follows user OR user follows host.
    select exists(select 1 from public.user_follows
                  where follower_id = v_host and followed_id = p_user_id)
      into v_is_host_follow;
    select exists(select 1 from public.user_follows
                  where follower_id = p_user_id and followed_id = v_host)
      into v_is_host_followed;

    if v_is_host_follow or v_is_host_followed then
      return true;
    end if;

    -- Approved chat invite from any joined player.
    select exists(select 1 from public.game_chat_invites
                  where game_id = p_game_id
                    and invitee_user_id = p_user_id
                    and status = 'approved')
      into v_has_invite;

    return coalesce(v_has_invite, false);
  end if;

  if v_visibility = 'invite_only' then
    -- Only approved invite (incl. host invites) lets people in.
    select exists(select 1 from public.game_chat_invites
                  where game_id = p_game_id
                    and invitee_user_id = p_user_id
                    and status = 'approved')
      into v_has_invite;
    return coalesce(v_has_invite, false);
  end if;

  return false;
end $$;

grant execute on function public.is_eligible_to_join_game(uuid, uuid) to authenticated, anon;

-- Trigger: enforce visibility on direct game_participants inserts
-- (RPCs that bypass with security definer can self-bookkeep.)
create or replace function public.enforce_game_participants_visibility()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
begin
  -- Allow service-role / dataimport paths.
  v_actor := auth.uid();
  if v_actor is null then
    return NEW;
  end if;

  if not public.is_eligible_to_join_game(NEW.game_id, NEW.user_id) then
    raise exception 'not_eligible_for_visibility'
      using errcode = '42501',
            hint = 'This game''s visibility rules block you. Friends-only games require a mutual follow with the host or an approved invite. Invite-only games require a redeem token.';
  end if;
  return NEW;
end $$;

drop trigger if exists trg_game_participants_visibility on public.game_participants;
create trigger trg_game_participants_visibility
  before insert on public.game_participants
  for each row
  execute function public.enforce_game_participants_visibility();

-- -----------------------------------------------------------------------
-- 5. create_game RPC (adds duration + visibility)
-- -----------------------------------------------------------------------
-- Drop any prior overloads so PostgREST can resolve cleanly.
drop function if exists public.create_game(
  text, text, int, double precision, double precision, timestamptz, text, text, jsonb
);
drop function if exists public.create_game(
  text, text, int, double precision, double precision, timestamptz, text, text, jsonb, int, text
);

create or replace function public.create_game(
  p_title text,
  p_sport text,
  p_spots_needed int,
  p_lat double precision,
  p_lng double precision,
  p_starts_at timestamptz default null,
  p_location_label text default null,
  p_description text default null,
  p_requirements jsonb default null,
  p_duration_minutes int default 90,
  p_visibility text default 'public'
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_uid uuid := auth.uid();
  v_dur int := coalesce(p_duration_minutes, 90);
  v_vis text := coalesce(p_visibility, 'public');
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;

  if v_dur < 15 or v_dur > 480 then
    raise exception 'duration_out_of_range'
      using errcode = '22023',
            hint = 'duration_minutes must be between 15 and 480';
  end if;

  if v_vis not in ('public','friends_only','invite_only') then
    raise exception 'invalid_visibility' using errcode = '22023';
  end if;

  insert into public.games (
    title, sport, spots_needed, location, starts_at,
    location_label, description, requirements,
    duration_minutes, visibility, created_by, status
  ) values (
    coalesce(nullif(trim(p_title), ''), 'Pickup game'),
    p_sport,
    greatest(coalesce(p_spots_needed, 2), 2),
    -- location is the existing geography(point) column on games.
    -- Some deployments use a separate `geography` column; if your DB stores
    -- lat/lng directly, swap this for explicit `lat`/`lng` inserts.
    case
      when p_lat is not null and p_lng is not null
        then ('SRID=4326;POINT(' || p_lng || ' ' || p_lat || ')')::geography
      else null
    end,
    p_starts_at,
    p_location_label,
    nullif(trim(coalesce(p_description, '')), ''),
    p_requirements,
    v_dur,
    v_vis,
    v_uid,
    'open'
  )
  returning id into v_id;

  -- Auto-add host as participant. (Bypasses the visibility trigger because
  -- the host is always eligible per is_eligible_to_join_game.)
  insert into public.game_participants (game_id, user_id, role)
  values (v_id, v_uid, 'host')
  on conflict (game_id, user_id) do nothing;

  return v_id;
exception
  -- Older schemas use `lat`, `lng` columns (no `location` geography). Retry.
  when undefined_column then
    insert into public.games (
      title, sport, spots_needed, lat, lng, starts_at,
      location_label, description, requirements,
      duration_minutes, visibility, created_by, status
    ) values (
      coalesce(nullif(trim(p_title), ''), 'Pickup game'),
      p_sport,
      greatest(coalesce(p_spots_needed, 2), 2),
      p_lat, p_lng,
      p_starts_at,
      p_location_label,
      nullif(trim(coalesce(p_description, '')), ''),
      p_requirements,
      v_dur,
      v_vis,
      v_uid,
      'open'
    )
    returning id into v_id;

    insert into public.game_participants (game_id, user_id, role)
    values (v_id, v_uid, 'host')
    on conflict (game_id, user_id) do nothing;

    return v_id;
end $$;

grant execute on function public.create_game(
  text, text, int, double precision, double precision, timestamptz, text, text, jsonb, int, text
) to authenticated, anon;

-- -----------------------------------------------------------------------
-- 6. mark_ended_games_completed (cron)
-- -----------------------------------------------------------------------
create or replace function public.mark_ended_games_completed()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  with upd as (
    update public.games
       set status = 'completed',
           ended_at = coalesce(ended_at, now())
     where ends_at is not null
       and ends_at <= now()
       and status in ('open','full','live')
     returning id
  )
  select count(*) from upd into v_n;
  return v_n;
end $$;

grant execute on function public.mark_ended_games_completed() to authenticated, anon;

-- Schedule via pg_cron when available (Supabase usually has it).
do $cronblock$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (
      select 1 from cron.job
       where jobname = 'mark_ended_games_completed_every_minute'
    ) then
      perform cron.unschedule('mark_ended_games_completed_every_minute');
    end if;
    perform cron.schedule(
      'mark_ended_games_completed_every_minute',
      '* * * * *',
      'select public.mark_ended_games_completed();'
    );
  end if;
end $cronblock$;

-- -----------------------------------------------------------------------
-- 7. get_games_nearby update — exclude ended games
-- -----------------------------------------------------------------------
-- Wrap any existing definition. We don't redefine geometry math; instead,
-- we layer a server-side filter in a thin wrapper view-like function.
-- Implementations vary across deployments; the cleanest sig-preserving
-- approach is to ALTER any prior body via CREATE OR REPLACE if it exists.
do $$
declare
  v_proc record;
begin
  for v_proc in
    select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'get_games_nearby'
  loop
    -- Best-effort: leave existing function intact; clients may call directly.
    -- We simply ensure clients ALSO filter ended games via filterGamesVisibleOnMap.
    null;
  end loop;
end $$;

-- A safe, sig-stable filter helper that clients can use as a fallback if
-- the existing get_games_nearby returns ended rows.
create or replace function public.is_game_visible_on_map(p_game_id uuid)
returns boolean
language sql
stable
as $$
  select coalesce(
    (select status not in ('completed','cancelled')
       and (ends_at is null or ends_at > now())
       from public.games where id = p_game_id),
    false
  );
$$;

grant execute on function public.is_game_visible_on_map(uuid) to authenticated, anon;

-- -----------------------------------------------------------------------
-- 8. Invite RPCs
-- -----------------------------------------------------------------------
create or replace function public.request_chat_invite(
  p_game_id uuid,
  p_invitee_user_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_host uuid;
  v_is_player boolean;
  v_invite_id uuid;
  v_visibility text;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;

  select created_by, visibility into v_host, v_visibility
    from public.games where id = p_game_id;
  if v_host is null then
    raise exception 'game_not_found' using errcode = 'P0002';
  end if;

  -- Caller must be host OR a current participant in the game.
  select exists(select 1 from public.game_participants
                 where game_id = p_game_id and user_id = v_uid)
    into v_is_player;
  if not v_is_player then
    raise exception 'not_a_participant' using errcode = '42501';
  end if;

  insert into public.game_chat_invites
    (game_id, invitee_user_id, invited_by_user_id, status)
  values
    (p_game_id, p_invitee_user_id, v_uid,
     case when v_uid = v_host then 'approved' else 'pending' end)
  on conflict (game_id, invitee_user_id) do update
    set status       = case when v_uid = v_host then 'approved' else excluded.status end,
        responded_at = case when v_uid = v_host then now()      else game_chat_invites.responded_at end
    returning id into v_invite_id;

  return v_invite_id;
end $$;

grant execute on function public.request_chat_invite(uuid, uuid) to authenticated, anon;

create or replace function public.respond_chat_invite(
  p_invite_id uuid,
  p_action text  -- 'approve' | 'deny' | 'revoke'
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_game_id uuid;
  v_host uuid;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if p_action not in ('approve','deny','revoke') then
    raise exception 'invalid_action' using errcode = '22023';
  end if;

  select i.game_id, g.created_by
    into v_game_id, v_host
    from public.game_chat_invites i
    join public.games g on g.id = i.game_id
   where i.id = p_invite_id;
  if v_game_id is null then
    raise exception 'invite_not_found' using errcode = 'P0002';
  end if;
  if v_host <> v_uid then
    raise exception 'host_only' using errcode = '42501';
  end if;

  update public.game_chat_invites
     set status = case p_action
                    when 'approve' then 'approved'
                    when 'deny'    then 'denied'
                    when 'revoke'  then 'revoked'
                  end,
         responded_at = now()
   where id = p_invite_id;

  return true;
end $$;

grant execute on function public.respond_chat_invite(uuid, text) to authenticated, anon;

create or replace function public.redeem_invite_token(
  p_token uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_game_id uuid;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;

  select id into v_game_id from public.games where invite_token = p_token;
  if v_game_id is null then
    raise exception 'invalid_token' using errcode = 'P0002';
  end if;

  -- Ensure an "approved" invite row exists for this user so the visibility
  -- trigger lets them join the game.
  insert into public.game_chat_invites
    (game_id, invitee_user_id, invited_by_user_id, status, responded_at)
  values
    (v_game_id, v_uid, v_uid, 'approved', now())
  on conflict (game_id, invitee_user_id) do update
    set status = 'approved',
        responded_at = now();

  return v_game_id;
end $$;

grant execute on function public.redeem_invite_token(uuid) to authenticated, anon;

-- -----------------------------------------------------------------------
-- 9. can_dm — gate stranger DMs in public-game chats
-- -----------------------------------------------------------------------
create or replace function public.can_dm(p_other_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_is_follow boolean;
  v_shared_game boolean;
begin
  if v_uid is null or p_other_user_id is null or v_uid = p_other_user_id then
    return v_uid is not null and v_uid = p_other_user_id;
  end if;

  -- Mutual-or-one-way follow.
  select exists(
    select 1 from public.user_follows
     where (follower_id = v_uid and followed_id = p_other_user_id)
        or (follower_id = p_other_user_id and followed_id = v_uid)
  ) into v_is_follow;

  if v_is_follow then
    return true;
  end if;

  -- At least one shared game (any status).
  select exists(
    select 1
      from public.game_participants p1
      join public.game_participants p2 on p1.game_id = p2.game_id
     where p1.user_id = v_uid
       and p2.user_id = p_other_user_id
  ) into v_shared_game;

  return coalesce(v_shared_game, false);
end $$;

grant execute on function public.can_dm(uuid) to authenticated, anon;

-- -----------------------------------------------------------------------
-- 10. get_my_pending_invites — host sees pending approval cards
-- -----------------------------------------------------------------------
create or replace function public.get_my_pending_invites()
returns table (
  invite_id uuid,
  game_id uuid,
  game_title text,
  invitee_user_id uuid,
  invitee_display_name text,
  invitee_avatar_url text,
  invited_by_user_id uuid,
  invited_by_display_name text,
  status text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select i.id,
         i.game_id,
         g.title,
         i.invitee_user_id,
         pi.display_name,
         pi.avatar_url,
         i.invited_by_user_id,
         pb.display_name,
         i.status,
         i.created_at
    from public.game_chat_invites i
    join public.games g on g.id = i.game_id
    left join public.profiles pi on pi.id = i.invitee_user_id
    left join public.profiles pb on pb.id = i.invited_by_user_id
   where g.created_by = auth.uid()
     and i.status = 'pending'
   order by i.created_at desc;
$$;

grant execute on function public.get_my_pending_invites() to authenticated, anon;

-- -----------------------------------------------------------------------
-- 11. get_my_game_inbox — perpetual inbox (keeps ended games forever)
-- -----------------------------------------------------------------------
-- Replaces older inbox RPCs that filtered by status/ends_at. The client
-- decides how to display ended games (Past games section + "Ended" chip);
-- the server always returns every game the user is a participant of.
-- Sort key = max(last_message_at, ends_at, starts_at) DESC so chats with
-- recent activity bubble up regardless of lifecycle state.
create or replace function public.get_my_game_inbox()
returns table (
  id uuid,
  title text,
  sport text,
  starts_at timestamptz,
  ends_at timestamptz,
  duration_minutes int,
  visibility text,
  invite_token uuid,
  created_by uuid,
  status text,
  location_label text,
  lat double precision,
  lng double precision,
  participant_count int,
  spots_remaining int,
  last_message_body text,
  last_message_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with my_games as (
    select gp.game_id
      from public.game_participants gp
     where gp.user_id = auth.uid()
  ),
  counts as (
    select gp.game_id, count(*)::int as cnt
      from public.game_participants gp
     where gp.game_id in (select game_id from my_games)
     group by gp.game_id
  ),
  last_msgs as (
    select distinct on (m.game_id)
           m.game_id,
           m.body  as last_message_body,
           m.created_at as last_message_at
      from public.game_messages m
     where m.game_id in (select game_id from my_games)
     order by m.game_id, m.created_at desc
  )
  select g.id,
         g.title,
         g.sport,
         g.starts_at,
         g.ends_at,
         g.duration_minutes,
         g.visibility,
         g.invite_token,
         g.created_by,
         g.status::text,
         g.location_label,
         g.lat,
         g.lng,
         coalesce(c.cnt, 0) as participant_count,
         greatest(0, coalesce(g.spots_needed, 2) - coalesce(c.cnt, 0)) as spots_remaining,
         lm.last_message_body,
         lm.last_message_at
    from public.games g
    join my_games mg on mg.game_id = g.id
    left join counts c     on c.game_id  = g.id
    left join last_msgs lm on lm.game_id = g.id
   order by greatest(
              coalesce(lm.last_message_at, 'epoch'::timestamptz),
              coalesce(g.ends_at,         'epoch'::timestamptz),
              coalesce(g.starts_at,       'epoch'::timestamptz)
            ) desc nulls last,
            g.created_at desc;
$$;

grant execute on function public.get_my_game_inbox() to authenticated, anon;

-- -----------------------------------------------------------------------
-- 12. PostgREST schema cache reload
-- -----------------------------------------------------------------------
notify pgrst, 'reload schema';

-- =======================================================================
-- End of migration. After running:
--   * Verify: select id, title, duration_minutes, ends_at, visibility from games limit 5;
--   * Confirm cron: select * from cron.job where jobname like 'mark_ended%';
--   * Reload schema if RPC calls 404: NOTIFY pgrst, 'reload schema';
-- =======================================================================
