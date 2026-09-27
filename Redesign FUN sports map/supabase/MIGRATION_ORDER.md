# Migration order

## The rule

**`schema.sql` is the baseline. Migrations apply on top of it, in filename order.**

```
supabase/schema.sql            <- full production snapshot (tables, RLS, policies,
                                  functions, triggers, indexes, grants, realtime)
supabase/migrations/*.sql      <- incremental changes, applied in filename order
```

To rebuild from nothing:

```bash
psql "$DATABASE_URL" -f supabase/schema.sql
for f in supabase/migrations/*.sql; do psql "$DATABASE_URL" -f "$f"; done
```

## Why schema.sql exists

The migration folder contains **only incremental patches**. No migration creates
`public.games`, `public.profiles`, or `public.game_participants` — those tables (and
`game_results`, `user_stats`, `athlete_endorsements`, `status_updates`, `dm_*`,
`game_messages`, …) came from ad-hoc SQL Editor runs during early development and were
never captured as migrations.

Between 2026-07-23 and 2026-08-10 `schema.sql` was an empty 0-byte file, which meant the
repo could not rebuild the database at all. It was regenerated from production on
2026-08-10.

## Regenerating schema.sql

`supabase db dump` requires Docker, which is not installed on this machine. Use the
Docker-free equivalent instead — it pulls the same objects through the Management API:

```bash
node scripts/dump-schema.mjs > supabase/schema.sql
```

Requires a linked project (`supabase link --project-ref <ref>`). No DB password needed.

Regenerate it whenever you apply a batch of migrations to production, so the baseline
never drifts far from live.

## Applying migrations to production

> **Do not run `supabase db push` casually.** It applies *every* pending migration,
> including any a teammate added since you last looked.
>
> As of 2026-08-10, **no migration is deliberately held back** — every file in
> `migrations/` is live in production. Applied that day:
> `20260808010000_games_nearby_untimed_ttl`, `20260809120000_note_likes_read_path`,
> `20260810000000_drop_legacy_create_game_overload`,
> `20260810120000_unified_feed_gender_gate`.
>
> Applied on 2026-08-11: `20260811000000_game_chat_archive` — verified live
> (archive → thread leaves `get_my_game_inbox`, undo → it returns, other 23
> threads untouched, test row restored to `chat_hidden_at = null`). The
> "game must have ended" guard could not be exercised at the time — every game
> in `games` was already past its window — and was confirmed by hand on
> 2026-08-12: a game created for the future refused archiving until it ended.
>
> Regenerate `schema.sql` after applying anything, and re-check before trusting it:
> work merging in from another branch can add migrations under you. `venue_coverage`
> landed this way on 2026-08-10 (`20260810130000_venue_coverage.sql`, arriving with the
> venue-pipeline merge) between two dumps taken minutes apart.

To apply a single migration deliberately, pass the **file** — do not inline it:

```bash
supabase db query --linked -f supabase/migrations/<file>.sql
```

Inlining with `"$(cat …)"` fails: every migration here opens with a `--` comment, and the
CLI parses that leading `--` as a flag (`Unrecognized flag: -- Drop the legacy …`).

Then confirm PostgREST picked up any signature change:

```sql
notify pgrst, 'reload schema';
```

## Verifying a migration before applying it

Never wrap a check in `begin; … rollback;` through the CLI — the CLI does not hold the
transaction across statements. Instead create the candidate object into `pg_temp`, which
gives you Postgres's full parse and return-type check against real production types with
zero net change:

```sql
create function pg_temp.probe(...) returns ... language sql as $$ ... $$;
```

For a `drop`, verify the target resolves to exactly one object first:

```sql
select oid::regprocedure from pg_proc
where proname = '<name>' and pronargs = <n> and pronamespace = 'public'::regnamespace;
```

## Pending — apply in this order

- **`20260922130000_guest_browse_read_paths.sql` — apply BEFORE deploying guest mode.**
  Additive: relaxes `can_view_game_for_gender` (no gender on file now means "Co-ed
  only" rather than "nothing at all") and adds the six `get_guest_*` wrappers,
  granted to `anon`. Safe with the current client, which never calls them. Applying
  it early simply lets members with no gender see Co-ed games.

- **`20260922140000_guest_browse_lock_anon_tables.sql` — apply AFTER that client is live.**
  Restrictive: moves every identity-bearing read policy from `public`/`anon` to
  `authenticated` and revokes `anon` (and PUBLIC) EXECUTE on the member read RPCs.
  A client that still reads `profiles`, `map_notes` or `get_venue_reviews` as a
  guest gets empty results or 42501 afterwards, so this one waits for the deploy.
  Guests keep `osm_sports_venues`, `venue_coverage`, the badge catalogue and the
  `get_guest_*` functions — nothing else.


- **`20260922120000_game_read_visibility_and_invite_tokens.sql` — deploy the client FIRST.**
  It revokes client privilege on `games.invite_token`, and the currently deployed
  `fetchMyGameInbox` still names that column in its select, so applying this first
  breaks every signed-in user's chat inbox with `permission denied`. The build that
  drops it also adds `getGameInviteToken()`, which is how the host's share link is
  read afterwards. Verified against a local Postgres reproduction of the policies:
  a man no longer reads a woman-hosted "Same gender" game, a non-participant reads
  no `invite_token`, and friends-only / invite-only games still reach the people
  who follow the host or hold an approved invite.

- **`20260926120000_venues_in_bbox_slim.sql` — deploy the client FIRST.**
  Drop + create: the map projection narrows from 20 columns to the nine the map
  actually draws. A client that still reads `opening_hours` or `hero_image_url` off
  a map row is not broken by it — the venue card refetches the full row on open —
  it simply shows hours and hero a few hundred milliseconds later. Deploying first
  removes even that.

- **`20260927120000_game_lifecycle_fixes.sql` — safe in either order.**
  Two function bodies get strictly more correct against the shipped client
  (`games_set_ends_at` stops clobbering `start_game`'s `ends_at`; `end_game` closes
  `ends_at` as well as `status`), and `get_my_game_inbox` only gains columns
  (`ended_at`, `live_started_at`) — it is a drop + create because the return type
  changes, so re-run `notify pgrst, 'reload schema';` after. The client build that
  reads the two new columns ships alongside. Schedules
  `mark_ended_games_completed` under pg_cron when the extension is present; when it
  is not, the migration raises a notice instead of failing, and the sweep stays
  unscheduled (no read path depends on it).

- **`20260927130000_game_social.sql` — apply before the client that reads it.**
  Additive: three new tables (`game_comments`, `game_comment_likes`, `game_likes`),
  their RLS, and the RPCs the feed card calls. Every policy delegates to the games
  read policy, so nothing here decides visibility on its own. `anon` holds no table
  privilege at all — a guest reads comments only through `get_guest_game_comments`,
  which projects no `user_id`. The client tolerates its absence (a game simply shows
  no conversation), so the order is a preference, not a requirement.

- **`20260927140000_unified_feed_games_v2.sql` — apply WITH or after the client.**
  Drop + create: `get_unified_feed` gains a `game` jsonb column and real social
  counts for games. The shipped client ignores the extra column, so applying it
  early is safe; applying it late means feed game cards render without a schedule
  or spots until it lands (`feedItemToGameRow` handles a null `game`). Depends on
  `game_social` for the two tables it counts. Re-run
  `notify pgrst, 'reload schema';` after.

- **`20260927150000_suggested_games.sql` — apply any time.**
  Purely additive: `get_suggested_games` (the one scorer behind the map's nudge
  and Explore's shelf) plus `get_games_at_venue` / `get_guest_games_at_venue` for
  a venue's "played here" history. Both callers treat a missing function as
  "nothing to suggest", so the client is safe either side of it. `get_suggested_games`
  is SECURITY DEFINER but returns nothing without `auth.uid()`, and enforces the
  same gender, liveness and TTL rules as `get_games_nearby` — a suggestion is
  always a game the map would draw.

- **`20260927160000_post_game_loop.sql` — apply after `game_lifecycle_fixes`.**
  Additive: `game_outcome_reports`, `game_polls`, `game_poll_votes`, their RLS and
  RPCs, plus the SELECT policy `athlete_endorsements` never had (RLS is enabled on
  it with INSERT and UPDATE policies and no SELECT policy, so every client read of
  it has silently returned nothing — the trigger-maintained
  `profiles.sportsmanship_avg` masked it, because the number showed while the rows
  behind it did not). It restates `viewer_is_game_participant` so it does not
  depend on apply order. The client treats every function here as optional: an
  un-migrated database shows a finished game with no prompt rather than an error.
  Ordered after the lifecycle fixes because the prompt keys off an honest
  "this game is over", which is what those give it.

## Known gaps

- The SQL Editor snippets in the Supabase dashboard are **historical scratch**, not a
  source of truth. Production is ahead of them. See `SCHEMA_CHANGELOG.md`.
