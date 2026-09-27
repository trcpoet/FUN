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

### The short version (verified against production 2026-09-27: none of these are applied)

Nine files, three steps. The reason it is not one step: two of them deliberately
remove something the **currently deployed** client still asks for, and one adds
something the **new** client needs before it ships. So: add first, swap the client,
remove last.

**Step 1 — before the deploy. ✅ APPLIED TO PRODUCTION 2026-09-27.** All additive;
the live client ignores every one of them and behaves exactly as it did.

```
20260922130000_guest_browse_read_paths.sql    ✅ applied + verified
20260927120000_game_lifecycle_fixes.sql       ✅ applied + verified
20260927130000_game_social.sql                ✅ applied + verified
20260927140000_unified_feed_games_v2.sql      ✅ applied + verified
20260927150000_suggested_games.sql            ✅ applied + verified
20260927160000_post_game_loop.sql             ✅ applied + verified
```

Applied through the Supabase MCP, each in its own transaction, each verified against
its own checks before the next was applied. What the verification actually exercised,
on temporary rows inside transactions that were rolled back:

- the gender rule across all six viewer/host combinations;
- a guest read returning a public Co-ed game with `created_by` null, while the
  invite-only and Same-gender games at the same coordinates did not come back;
- a game started 90 minutes late coming out **live with 90 minutes left** rather than
  born ended, and End closing `status`, `ended_at` and `ends_at` together — the
  before/after being `live, ends_at +70min` then `completed, ends_at now`;
- rescheduling a completed game leaving it completed and over;
- a member commenting, liking and reading back `liked_by_me = true`, while the guest
  wrapper returned the same text with the author stripped;
- the feed returning a populated `game` object, and dropping a 5-day-old untimed game
  that the old TTL-less predicate would have kept forever;
- the scorer ranking basketball-soon > volleyball-soon > basketball-in-3-days >
  tennis-soon for a basketball player, excluding the viewer's own games, and
  returning nothing at all to a guest;
- the full post-game loop: outcome recorded (and `confirmed_result` finally written),
  a teammate rated 5, the poll created twice yielding one poll, two In votes counted,
  and a **non-host blocked by RLS** from opening a poll.

Two live consequences of Step 1, both intended:

- `mark_ended_games_completed` is now scheduled under pg_cron every 5 minutes. On its
  first two runs it moved the 34 games whose windows had long expired from
  `open`/`live` to `completed`. They were already invisible on the map; the stored
  status now agrees with that.
- `get_unified_feed` lost its `anon` EXECUTE grant (it had one; `20260922140000` was
  going to remove it anyway). Verified safe: the only caller is `Feed.tsx`, behind
  `RequireMember`.

**Step 2 — merge and deploy. ✅ DONE 2026-09-27 15:10 UTC.** Merged as `5f49a11`;
Vercel served the new build on `fun-trcpoet.vercel.app` 50 seconds later. Confirmed
by fingerprint rather than by assumption — `theme-color` `#0B0C10`→`#0A0F1C`, the
cold-boot loader core `#10b981`→`#00F2FE`, and `/og-card.png` 404→200 — then by
driving the deployed page: map canvas rendered, Outfit loaded, `--primary` resolving
to `#00f2fe`, and **zero JS errors**.

Note PR #31 had already merged only the *first* commit of the branch six days
earlier; the merge brought the remaining 15.

**Step 3 — after the deploy. ✅ APPLIED 2026-09-27.** These break the *old* client,
which is why they waited until it was gone.

```
20260926120000_venues_in_bbox_slim.sql                      ✅ applied + verified
20260922120000_game_read_visibility_and_invite_tokens.sql   ✅ applied + verified
20260922140000_guest_browse_lock_anon_tables.sql            ✅ applied + verified
```

The precondition for the last one was checked against the live site before applying
it, not assumed: a full network capture of the deployed guest session showed
**zero direct table reads** — every call went through `get_guest_games_nearby`,
`get_guest_notes_nearby` and `get_venues_in_bbox`. That is exactly what the lockdown
requires, so it could not break what nothing was calling.

What Step 3 verification exercised:

- `get_venues_in_bbox` still returns 1000 rows for the same bbox, now 9 columns and
  **96 bytes per row** instead of 20 columns, and `anon` can still execute it;
- `games.invite_token` unreadable by `anon` and `authenticated` while every other
  column stays readable; a direct `select invite_token` refused with permission
  denied; `get_game_invite_token` returning the uuid to the host and `null` to an
  outsider — no error, no oracle;
- after the lockdown, a guest reading `profiles`, `map_notes`, `user_follows`,
  `venue_reviews` and `games` directly gets **0 rows from each**, while
  `get_venues_in_bbox` still returns venues. The table-level SELECT grant is
  deliberately retained (so the SECURITY INVOKER feed RPCs return an empty list
  rather than raising) — it is the *policies* that no longer name `anon`;
- the live site re-checked afterwards: same three RPCs at 200, still zero direct
  table reads, still zero JS errors.

The two guest RPCs return 0 rows in production right now. That is the data, not a
regression: there are **0 map notes in the database**, and all 45 games are
`completed` (the newest expired the day before, and the new pg_cron sweep tidied
their status).

### Follow-up

`schema.sql` has not been regenerated for these nine. `scripts/dump-schema.mjs`
shells out to the `supabase` binary, which is not installed on this machine
(`spawnSync supabase ENOENT`). Install the CLI and run `node scripts/dump-schema.mjs
> supabase/schema.sql` so the baseline stops drifting — it is currently nine
migrations behind production.

Run each file on its own, in a single transaction, and stop on the first error —
three of them drop and recreate a function, and without a transaction there is a
window where that function does not exist:

```bash
psql "$DATABASE_URL" --single-transaction -v ON_ERROR_STOP=1 -f supabase/migrations/<file>.sql
```

Every file ends with its own verification queries. Run them before moving to the
next one. Regenerate `schema.sql` (`node scripts/dump-schema.mjs`) once the batch
is done.

### Per-file detail

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

- **`20260928100000_game_host_summary.sql` — ✅ APPLIED 2026-09-28.** Additive:
  `get_games_nearby`, `get_guest_games_nearby` and `get_suggested_games` gain
  `host_name` / `host_avatar_url` / `host_sportsmanship`. Drop + create, ACLs
  re-granted. The guest wrapper projects all three as NULL, so "a guest never
  learns who hosts" stays a schema property. Verified: member sees the name and
  4.6, anon sees null, null, null.

- **`20260928110000_saved_venues.sql` — ✅ APPLIED 2026-09-28.** Additive:
  `saved_venues` (text `venue_id`, no FK — the OSM importer replaces rows and a
  cascade would erase people's saves), own-row RLS, `toggle_saved_venue`,
  `get_my_saved_venues`, `get_saved_venue_ids`. Verified: toggle on/off/on,
  another member reads zero of mine, anon refused.

- **`20260928120000_chat_reads.sql` — ✅ APPLIED 2026-09-28.** Additive: `chat_reads`
  (`thread_kind` + `thread_id` + `user_id`, no FK on `thread_id` because it points at
  three tables), five RLS policies, `viewer_is_dm_thread_member`, `mark_thread_read`,
  `get_thread_read_receipts`, `get_my_unread_counts`, three sender triggers, a backfill
  seeding everyone at `now()`, and the table added to `supabase_realtime`.

  Read state got its own table rather than a `last_read_at` column on the membership
  tables for two reasons found while designing it: `game_participants` SELECT is
  `to public using (true)`, so a column there would publish "when was this person last
  on their phone" to anon; and `dm_thread_members` SELECT is self-only, so while a
  definer RPC could read a peer's watermark, **Realtime cannot** — it evaluates RLS with
  the subscriber's own JWT and cannot route through a definer function, so "Seen" could
  never have updated live from there.

  Verified in a rolled-back transaction before applying: a backward mark and an equal
  mark both leave the row's `ctid` at `(0,1)` — no write, therefore no WAL, therefore no
  realtime fan-out — while a forward mark moves it to `(0,2)`. Also verified: a future
  timestamp is clamped to `now()`, a non-participant is refused, an unknown thread kind
  is refused, a member sees a peer's row in a shared game, nobody sees a peer's *note*
  row (notes have no audience, so they are own-row only), and `anon` is refused on both
  the table and the function. Backfill wrote 45 game rows and 6 dm rows; `map_notes` is
  empty so the note backfill correctly wrote none. Row counts unchanged.

  One correction applied on top (`chat_reads_tighten_grants`): Supabase's schema-wide
  default hands `authenticated` DELETE, TRUNCATE, REFERENCES and TRIGGER on every public
  table — `games` has them too, so this is not new — but nothing ever deletes a read
  watermark, so they are revoked here.

- **`20260928130000_chat_message_client_id.sql` — ✅ APPLIED 2026-09-28.** Additive:
  nullable `client_id` / `edited_at` / `deleted_at` on `game_messages`, `dm_messages`
  and `map_note_comments`, plus three partial unique indexes on `(user_id, client_id)`.
  The index is what makes retry safe: a resend raises `23505`, which the client treats
  as success instead of posting the message twice.

- **`20260928140000_chat_realtime_publication.sql` — ✅ APPLIED 2026-09-28.** One line:
  `notifications` added to `supabase_realtime`. **The bell has never worked.** The
  publication has held exactly `dm_messages` and `game_messages` since it was created
  and no migration ever added to it, so `subscribeToNotifications` has never fired an
  event in production or anywhere. Safe unfiltered, because the table's only SELECT
  policy is `auth.uid() = user_id` and Realtime evaluates it with the subscriber's JWT.
  Publication now: `chat_reads, dm_messages, game_messages, notifications`.

  Advisors after all three: the only flagged objects are `st_estimatedextent` and
  `spatial_ref_sys` (PostGIS) and `push_notifications_sent` (RLS on, no policy, so it
  denies everyone — service-role only). Nothing added here is flagged.

- **`20260928150000_note_comment_write_visibility.sql` — ✅ APPLIED 2026-09-28.** Adds
  `map_note_visible_to(note, viewer)` and makes `add_note_comment` call it.

  **This corrects a finding that was wrong.** The plan for the chat work recorded that
  `map_note_comments: read if can see note` "ignores `map_notes.visibility`, so every note
  comment is readable by anon". Tested against production, it is not: the policy delegates
  to `exists (select 1 from map_notes n where n.id = note_id)`, and Postgres applies
  `map_notes`' own RLS to that subquery, so an invisible note makes the EXISTS false. The
  visibility check is inherited, not missing. A member who cannot see a private note reads
  **zero** of its comments; so does anon, which is additionally excluded because the policy
  is `to authenticated`. The positive control passed in the same transaction — the same
  member reads a public note's comment fine — so the zeroes mean what they say.

  **The real bug was the opposite: a write hole, not a read leak.** `add_note_comment` is
  SECURITY DEFINER, so it runs as the table owner and does not inherit that check, and it
  validated nothing. A member who could neither read A's private note nor insert into it
  directly could call the RPC and land a comment in A's private thread.

  Verified after applying, six cases: non-owner into a private note refused; non-follower
  into a friends-only note refused; nonexistent note refused with the *same* error, so the
  RPC cannot be used to probe which ids exist; owner into their own private note allowed;
  mutual follower into a friends-only note allowed; anyone into a public note allowed.

  Note: one intermediate run appeared to show a non-follower posting to a friends-only
  note. That was a bad fixture, not a bug — the two test accounts follow each other in
  production, so the "stranger" was a friend. Re-run with a genuine non-follower, it is
  refused.

## Open security finding — anonymous sign-ins are enabled

Not a migration, and not introduced by this work, but it interacts badly with it.

`auth.users` holds 4 anonymous accounts out of 13 (last sign-in 2026-03-25, so they are
dormant test accounts). Anonymous sign-in being **enabled** means anyone holding the
publishable anon key can mint a JWT whose role is `authenticated` — and the entire
guest model draws its line exactly there: `anon` browses, `authenticated` acts. Every
`to authenticated` policy in the schema, old and new, admits such a user.

Supabase's own linter flags this on 42 tables, 36 of which predate today.

The app no longer needs it: guest browsing replaced anonymous sign-in, which is why
the "In Supabase enable: Authentication → Providers → Anonymous" error copy was
removed from Create Game. Recommended: turn the Anonymous provider **off** at
Authentication → Providers. Before doing so, note those 4 accounts host 7 games and
hold 6 participant rows — all expired — so decide whether to reassign or leave them.

## Known gaps

- The SQL Editor snippets in the Supabase dashboard are **historical scratch**, not a
  source of truth. Production is ahead of them. See `SCHEMA_CHANGELOG.md`.
