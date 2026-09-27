-- The loop that closes after the game.
--
-- The trust system is already built and has never once fired. `athlete_endorsements`,
-- `endorse_athlete`, `get_athlete_reputation`, `profiles.sportsmanship_avg`,
-- `TrustRatingsBlock`, `EndorsementsPanel`, the badge in chat — all shipped, and
-- every rating in the database is zero, because nothing in the app has ever asked
-- anyone to rate anyone. The missing piece was never a system. It was a moment.
--
-- The moment is the game's own chat thread, once it is over:
--
--   1. "Did it happen?"  — Yes / No / I didn't go. Writes `game_outcome_reports`,
--      and a Yes marks your own `game_participants.confirmed_result`, the column
--      that has been sitting there unused since the schema was written. This is
--      also the numerator of games-actually-played over games-created, which is
--      the one number worth watching before launch.
--
--   2. Rate the people you met — straight into the existing `endorse_athlete`.
--      Nothing new; it just finally gets called.
--
--   3. "Run it back?" — host-only, creates a poll in the thread. Everyone taps
--      In or Out. Enough Ins and the host gets a one-tap rematch prefilled with
--      the same sport, venue and squad, which is a path that already exists.
--
-- Check-in is deliberately not here. Noted as a later step, and when it comes,
-- joining a game should mark attendance rather than asking a second time.
--
-- Depends on: 20260927120000_game_lifecycle_fixes (for a game whose "over" is
-- honest — without it `ended_at` never reaches the client and the prompt would
-- appear at the wrong time or not at all).

-- ---------------------------------------------------------------------------
-- 0) The helper every policy below leans on
-- ---------------------------------------------------------------------------
-- Defined by 20260922120000, restated here so this migration does not depend on
-- apply order. SECURITY DEFINER breaks the policy recursion that a plain
-- subquery between `games` and `game_participants` would cause.

create or replace function public.viewer_is_game_participant(p_game_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1
      from public.game_participants gp
     where gp.game_id = p_game_id
       and gp.user_id = (select auth.uid())
  );
$function$;

revoke execute on function public.viewer_is_game_participant(uuid) from public, anon;
grant execute on function public.viewer_is_game_participant(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1) Did it happen?
-- ---------------------------------------------------------------------------

create table if not exists public.game_outcome_reports (
  game_id    uuid not null references public.games(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  -- 'played'    — it happened and I was there
  -- 'no_show'   — I turned up and it did not happen
  -- 'missed_it' — it may well have happened; I did not go
  outcome    text not null check (outcome in ('played', 'no_show', 'missed_it')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (game_id, user_id)
);

create index if not exists game_outcome_reports_game_idx on public.game_outcome_reports (game_id);

comment on table public.game_outcome_reports is
  'One answer per participant to "did it happen?", asked in the game chat once the '
  'game is over. The honest denominator for games-played over games-created.';

alter table public.game_outcome_reports enable row level security;

drop policy if exists "game_outcome_reports: read if in the game" on public.game_outcome_reports;
drop policy if exists "game_outcome_reports: write own"           on public.game_outcome_reports;

-- Visible to the people who were in it, which is who it is about.
create policy "game_outcome_reports: read if in the game"
  on public.game_outcome_reports as permissive for select to authenticated
  using (public.viewer_is_game_participant(game_id));

create policy "game_outcome_reports: write own"
  on public.game_outcome_reports as permissive for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.viewer_is_game_participant(game_id));

revoke all on public.game_outcome_reports from public, anon;
grant select, insert, update, delete on public.game_outcome_reports to authenticated;
grant all on public.game_outcome_reports to service_role;

create or replace function public.report_game_outcome(p_game_id uuid, p_outcome text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if p_outcome not in ('played', 'no_show', 'missed_it') then
    raise exception 'invalid_outcome' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.game_participants gp
     where gp.game_id = p_game_id and gp.user_id = v_uid
  ) then
    raise exception 'not_a_participant' using errcode = '42501';
  end if;

  insert into public.game_outcome_reports (game_id, user_id, outcome)
  values (p_game_id, v_uid, p_outcome)
  on conflict (game_id, user_id) do update
    set outcome = excluded.outcome, updated_at = now();

  -- `confirmed_result` has been on game_participants since the schema was
  -- written and nothing has ever set it. "I played" is what it means.
  update public.game_participants
     set confirmed_result = (p_outcome = 'played')
   where game_id = p_game_id and user_id = v_uid;
end $function$;

revoke execute on function public.report_game_outcome(uuid, text) from public, anon;
grant execute on function public.report_game_outcome(uuid, text) to authenticated, service_role;

-- What the thread needs to render the prompt: my answer, and the tally.
-- plpgsql, not sql: an aggregate with no GROUP BY returns one row even when the
-- WHERE matched nothing, so a participant test in the WHERE clause would still
-- have handed an outsider a row — including the participant count. The guard has
-- to be a `return` before any row is produced.
create or replace function public.get_game_outcome_summary(p_game_id uuid)
returns table (
  my_outcome     text,
  played_count   int,
  no_show_count  int,
  missed_count   int,
  total_reports  int,
  participants   int
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if (select auth.uid()) is null or not public.viewer_is_game_participant(p_game_id) then
    return;
  end if;

  return query
  select
    (select r2.outcome from public.game_outcome_reports r2
      where r2.game_id = p_game_id and r2.user_id = (select auth.uid())),
    coalesce(count(*) filter (where r.outcome = 'played'), 0)::int,
    coalesce(count(*) filter (where r.outcome = 'no_show'), 0)::int,
    coalesce(count(*) filter (where r.outcome = 'missed_it'), 0)::int,
    coalesce(count(r.*), 0)::int,
    (select count(*)::int from public.game_participants gp where gp.game_id = p_game_id)
  from public.game_outcome_reports r
  where r.game_id = p_game_id;
end $function$;

revoke execute on function public.get_game_outcome_summary(uuid) from public, anon;
grant execute on function public.get_game_outcome_summary(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) Who was there to rate
-- ---------------------------------------------------------------------------
-- `endorse_athlete` already refuses anything but a completed game you both
-- played. This is the list the rating row renders, and the only reason it is a
-- function rather than a select is that it also reports who you have already
-- rated, so the UI can stop asking.

create or replace function public.get_rateable_teammates(p_game_id uuid)
returns table (
  user_id      uuid,
  display_name text,
  avatar_url   text,
  my_rating    int
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    p.id,
    p.display_name,
    p.avatar_url,
    e.rating
  from public.game_participants gp
  join public.profiles p on p.id = gp.user_id
  left join public.athlete_endorsements e
    on e.game_id = p_game_id
   and e.athlete_id = gp.user_id
   and e.endorser_id = (select auth.uid())
  where gp.game_id = p_game_id
    and gp.user_id <> (select auth.uid())
    -- Definer, so the rule the policy would have applied is restated. Unlike the
    -- summary above this is a plain row filter, so an outsider gets zero rows.
    and public.viewer_is_game_participant(p_game_id)
  order by p.display_name nulls last;
$function$;

revoke execute on function public.get_rateable_teammates(uuid) from public, anon;
grant execute on function public.get_rateable_teammates(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) Run it back
-- ---------------------------------------------------------------------------

create table if not exists public.game_polls (
  id         uuid primary key default gen_random_uuid(),
  game_id    uuid not null references public.games(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  kind       text not null default 'rematch' check (kind in ('rematch')),
  question   text,
  created_at timestamptz not null default now(),
  closed_at  timestamptz
);

-- One open rematch poll per game. A second "who's in?" under the first one is
-- how a thread becomes noise.
create unique index if not exists game_polls_one_open_per_game
  on public.game_polls (game_id, kind)
  where closed_at is null;

create table if not exists public.game_poll_votes (
  poll_id    uuid not null references public.game_polls(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  choice     text not null check (choice in ('in', 'out')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (poll_id, user_id)
);

alter table public.game_polls      enable row level security;
alter table public.game_poll_votes enable row level security;

drop policy if exists "game_polls: read if in the game"   on public.game_polls;
drop policy if exists "game_polls: host creates"          on public.game_polls;
drop policy if exists "game_polls: host closes"           on public.game_polls;
drop policy if exists "game_poll_votes: read if in game"  on public.game_poll_votes;
drop policy if exists "game_poll_votes: write own"        on public.game_poll_votes;

create policy "game_polls: read if in the game"
  on public.game_polls as permissive for select to authenticated
  using (public.viewer_is_game_participant(game_id));

-- Host only, per the design: anyone can say they are in, only the host asks.
create policy "game_polls: host creates"
  on public.game_polls as permissive for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.games g
       where g.id = game_polls.game_id and g.created_by = (select auth.uid())
    )
  );

create policy "game_polls: host closes"
  on public.game_polls as permissive for update to authenticated
  using (exists (
    select 1 from public.games g
     where g.id = game_polls.game_id and g.created_by = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.games g
     where g.id = game_polls.game_id and g.created_by = (select auth.uid())
  ));

create policy "game_poll_votes: read if in game"
  on public.game_poll_votes as permissive for select to authenticated
  using (exists (
    select 1 from public.game_polls pl
     where pl.id = game_poll_votes.poll_id
       and public.viewer_is_game_participant(pl.game_id)
  ));

create policy "game_poll_votes: write own"
  on public.game_poll_votes as permissive for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.game_polls pl
       where pl.id = game_poll_votes.poll_id
         and pl.closed_at is null
         and public.viewer_is_game_participant(pl.game_id)
    )
  );

revoke all on public.game_polls      from public, anon;
revoke all on public.game_poll_votes from public, anon;
grant select, insert, update on public.game_polls to authenticated;
grant select, insert, update, delete on public.game_poll_votes to authenticated;
grant all on public.game_polls      to service_role;
grant all on public.game_poll_votes to service_role;

create or replace function public.create_rematch_poll(p_game_id uuid, p_question text default null)
returns uuid
language plpgsql
security invoker
set search_path to 'public'
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_id  uuid;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;

  -- Idempotent: pressing "Run it back?" twice reopens the same poll rather than
  -- failing on the unique index.
  select pl.id into v_id
    from public.game_polls pl
   where pl.game_id = p_game_id and pl.kind = 'rematch' and pl.closed_at is null;
  if v_id is not null then
    return v_id;
  end if;

  -- The insert policy is what enforces host-only; this only decides the message.
  insert into public.game_polls (game_id, created_by, kind, question)
  values (p_game_id, v_uid, 'rematch', nullif(btrim(coalesce(p_question, '')), ''))
  returning id into v_id;

  return v_id;
end $function$;

revoke execute on function public.create_rematch_poll(uuid, text) from public, anon;
grant execute on function public.create_rematch_poll(uuid, text) to authenticated, service_role;

create or replace function public.vote_rematch_poll(p_poll_id uuid, p_choice text)
returns void
language plpgsql
security invoker
set search_path to 'public'
as $function$
begin
  if (select auth.uid()) is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if p_choice not in ('in', 'out') then
    raise exception 'invalid_choice' using errcode = '22023';
  end if;

  insert into public.game_poll_votes (poll_id, user_id, choice)
  values (p_poll_id, (select auth.uid()), p_choice)
  on conflict (poll_id, user_id) do update
    set choice = excluded.choice, updated_at = now();
end $function$;

revoke execute on function public.vote_rematch_poll(uuid, text) from public, anon;
grant execute on function public.vote_rematch_poll(uuid, text) to authenticated, service_role;

create or replace function public.close_rematch_poll(p_poll_id uuid)
returns void
language sql
security invoker
set search_path to 'public'
as $function$
  -- The update policy is host-only, so this is safe as invoker.
  update public.game_polls set closed_at = now()
   where id = p_poll_id and closed_at is null;
$function$;

revoke execute on function public.close_rematch_poll(uuid) from public, anon;
grant execute on function public.close_rematch_poll(uuid) to authenticated, service_role;

-- The open poll for a game, with the tally and my own vote. One round-trip, the
-- shape the thread renders.
create or replace function public.get_rematch_poll(p_game_id uuid)
returns table (
  poll_id    uuid,
  created_by uuid,
  question   text,
  created_at timestamptz,
  closed_at  timestamptz,
  in_count   int,
  out_count  int,
  my_choice  text
)
language sql
stable
security invoker
set search_path to 'public'
as $function$
  select
    pl.id,
    pl.created_by,
    pl.question,
    pl.created_at,
    pl.closed_at,
    coalesce(count(*) filter (where v.choice = 'in'), 0)::int,
    coalesce(count(*) filter (where v.choice = 'out'), 0)::int,
    max(v.choice) filter (where v.user_id = (select auth.uid()))
  from public.game_polls pl
  left join public.game_poll_votes v on v.poll_id = pl.id
  where pl.game_id = p_game_id
    and pl.kind = 'rematch'
    and pl.closed_at is null
  group by pl.id, pl.created_by, pl.question, pl.created_at, pl.closed_at
  order by pl.created_at desc
  limit 1;
$function$;

revoke execute on function public.get_rematch_poll(uuid) from public, anon;
grant execute on function public.get_rematch_poll(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4) The read policy athlete_endorsements never had
-- ---------------------------------------------------------------------------
-- RLS is enabled on that table with INSERT and UPDATE policies and no SELECT
-- policy at all, so every client read of it returns nothing — silently. The
-- aggregate in `profiles.sportsmanship_avg` is maintained by a trigger and works
-- either way, which is why this has gone unnoticed: the number shows, the rows
-- behind it do not. Two reads are legitimate:
--   * your own endorsements, given or received;
--   * endorsements on a game you were in, which is what the rating row needs to
--     know who you have already rated.

drop policy if exists "athlete_endorsements: read own or shared game" on public.athlete_endorsements;

create policy "athlete_endorsements: read own or shared game"
  on public.athlete_endorsements as permissive for select to authenticated
  using (
    endorser_id = (select auth.uid())
    or athlete_id = (select auth.uid())
    or public.viewer_is_game_participant(game_id)
  );

notify pgrst, 'reload schema';

-- Verification (as a participant of a completed game, then as an outsider):
--   select public.report_game_outcome('<game>', 'played');
--   select * from public.get_game_outcome_summary('<game>');
--   select confirmed_result from public.game_participants
--    where game_id = '<game>' and user_id = auth.uid();          -- true
--
--   select * from public.get_rateable_teammates('<game>');        -- my_rating null at first
--   select public.endorse_athlete('<teammate>', '<game>', 5, '{}');
--   select * from public.get_rateable_teammates('<game>');        -- my_rating 5
--
--   -- host:
--   select public.create_rematch_poll('<game>', 'Same time next week?');
--   select public.create_rematch_poll('<game>');                  -- same id, not an error
--   -- everyone:
--   select public.vote_rematch_poll('<poll>', 'in');
--   select * from public.get_rematch_poll('<game>');
--   -- non-host insert into game_polls: expect 42501 from the policy.
--   -- as anon: every function above is 42501.
