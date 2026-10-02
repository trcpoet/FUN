-- Game reads: enforce the visibility rules where the rows actually leave the table.
--
-- Two holes, both live in production, both reachable with nothing but the public
-- anon key and a free account:
--
--   1. `invite_token` was readable by everyone. `games` grants SELECT on every
--      column to anon and authenticated (schema.sql:3987-3989) and its only read
--      policy is `for select to public using (true)` (:3755). So
--        GET /rest/v1/games?select=id,invite_token&visibility=eq.invite_only
--      returned the token of every invite-only game — and `redeem_invite_token`
--      (:2864) asks for nothing but a token before writing an *approved* invite
--      row, which the participants trigger then accepts. Anyone could join any
--      invite-only game.
--
--   2. The "Same gender" gate was enforced only inside the three read RPCs
--      (`get_games_nearby`, `get_live_nearby`, `get_unified_feed`). The table
--      itself answered `select *` to anyone, so a woman-hosted women-only game's
--      title, description and exact coordinates were one REST call away for any
--      man — the precise thing 20260801130000 set out to make impossible:
--      "a women's-only game's coordinates must never reach a non-matching
--      client. Filtering was previously 100% client-side". It moved into the
--      RPCs; the table was left open behind them. Friends-only and invite-only
--      games leaked the same way (filtered in JS by `gameVisibleToViewer`).
--
-- Fixed here by making the table agree with the RPCs, so there is one answer to
-- "may this viewer see this game" no matter which door the query comes through.
-- The read RPCs are SECURITY DEFINER and keep their own explicit filters, so
-- their behaviour is unchanged.
--
-- Guests lose direct table access entirely (the new policies are `to
-- authenticated`). Nothing in the client reads these tables signed out: the map
-- goes through `get_games_nearby`, which is DEFINER and granted to anon.

-- 1) Participant test that cannot recurse ------------------------------------
-- The games policy asks "am I in this game?" and the participants policy asks
-- "can I see this game?". Left as plain subqueries those two policies would
-- evaluate each other forever (Postgres raises "infinite recursion detected in
-- policy"). SECURITY DEFINER breaks the cycle: this runs as the owner, so the
-- participants policy does not apply inside it.

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

-- `anon` is named as well as PUBLIC: Supabase's default privileges grant EXECUTE on
-- every new function to anon directly, so revoking PUBLIC alone leaves guests able to
-- call it. This is the form production received on 2026-09-27; the file said
-- `from public` / `to authenticated` until 2026-10-01.
revoke execute on function public.viewer_is_game_participant(uuid) from public, anon;
grant execute on function public.viewer_is_game_participant(uuid) to authenticated, service_role;

-- 2) Games: read what the viewer is allowed to see ----------------------------
-- Order matters for cost, not just for logic: the two cheap identity tests come
-- first, then the gender predicate, and `is_eligible_to_join_game` (several
-- queries, plpgsql) is only reached by a row that is not public.

drop policy if exists "Games are viewable by everyone" on public.games;

create policy "games: readable by viewers it is meant for"
  on public.games
  as permissive
  for select
  to authenticated
  using (
    created_by = (select auth.uid())
    or public.viewer_is_game_participant(id)
    or (
      public.can_view_game_for_gender(
        (select p.gender from public.profiles p where p.id = (select auth.uid())),
        (select h.gender from public.profiles h where h.id = games.created_by),
        games.requirements->>'matchType'
      )
      and (
        coalesce(games.visibility, 'public') = 'public'
        or public.is_eligible_to_join_game(games.id, (select auth.uid()))
      )
    )
  );

-- 3) Participants: readable exactly when their game is ------------------------
-- The subquery runs under the caller's rights, so the policy above decides.

drop policy if exists "Participants are viewable by everyone" on public.game_participants;

create policy "game_participants: readable when the game is"
  on public.game_participants
  as permissive
  for select
  to authenticated
  using (exists (select 1 from public.games g where g.id = game_participants.game_id));

-- 4) invite_token stops being a readable column -------------------------------
-- Column privileges rather than a separate table: smaller, reversible, and it
-- keeps `redeem_invite_token` working unchanged. The cost is that a column added
-- to `games` later is NOT automatically readable — add it to the grant below.

do $$
declare
  v_cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into v_cols
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'games'
     and column_name <> 'invite_token';

  execute 'revoke select on public.games from anon, authenticated';
  -- anon keeps the column grants even though no policy admits it to a single
  -- row. Privilege and policy fail differently: without the grant, the two
  -- SECURITY INVOKER feed RPCs (`get_live_nearby`, `get_unified_feed`) would
  -- raise "permission denied for table games" at a signed-out caller instead of
  -- handing back the empty list they return today.
  execute format('grant select (%s) on public.games to anon, authenticated', v_cols);
end $$;

comment on column public.games.invite_token is
  'Never granted to client roles. Read it through get_game_invite_token(), which answers only the host and the players who already joined.';

-- 5) The one legitimate way to read a token ------------------------------------
-- Host and participants only: both need it, because the share sheet in the
-- messenger is offered to anyone already in an invite-only game.

create or replace function public.get_game_invite_token(p_game_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_token uuid;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;

  select g.invite_token into v_token
    from public.games g
   where g.id = p_game_id
     and (
       g.created_by = v_uid
       or exists (
         select 1 from public.game_participants gp
          where gp.game_id = g.id and gp.user_id = v_uid
       )
     );

  return v_token; -- null when the caller is not in the game: no error, no oracle
end $function$;

revoke execute on function public.get_game_invite_token(uuid) from public;
grant execute on function public.get_game_invite_token(uuid) to authenticated;

notify pgrst, 'reload schema';

-- Verification (run as each role; see MIGRATION_ORDER.md for the psql recipe):
--
--   set role authenticated;
--   select set_config('request.jwt.claim.sub', '<a man''s uuid>', false);
--   select count(*) from public.games where requirements->>'matchType' = 'Same gender';
--     -- expect 0 for games hosted by a woman, and his own rows still visible
--   select invite_token from public.games limit 1;   -- expect: permission denied
--   select public.get_game_invite_token('<a game he hosts>');   -- expect: the uuid
--   select public.get_game_invite_token('<a game he is not in>'); -- expect: null
