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
The link lives in the gitignored `supabase/.temp/`, so a fresh git worktree has to be
linked (or have that folder copied in) before the dump can reach production.

Regenerate it whenever you apply a batch of migrations to production, so the baseline
never drifts far from live.

Privileges are dumped exactly, not just added. Supabase's default privileges give
`anon`, `authenticated` and `service_role` ALL on every new table and EXECUTE on every new
function, so a replay that only granted would quietly undo every migration that revoked
something. Each table and function is therefore reset for those roles (and PUBLIC) and
then granted what production has, including column-level grants. Checked on 2026-10-01 by
replaying the statements on a local Postgres that starts from those grant-everything
defaults: all 45 privilege checks (`games`, `games.invite_token`, `chat_reads`, four RPCs,
three roles) matched production.

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

To apply a single migration deliberately, pass the **file** — do not inline it — and then
record it in the ledger, which `db query` does not write:

```bash
supabase db query --linked -f supabase/migrations/<file>.sql
supabase migration repair --linked --status applied <version>
```

Inlining with `"$(cat …)"` fails: every migration here opens with a `--` comment, and the
CLI parses that leading `--` as a flag (`Unrecognized flag: -- Drop the legacy …`).

Then confirm PostgREST picked up any signature change:

```sql
notify pgrst, 'reload schema';
```

### The migration ledger

`supabase_migrations.schema_migrations` matches the folder as of 2026-10-01: all 63 files,
each under its own filename version, and `supabase migration list --linked` shows no
local-only or remote-only rows. Before that it had drifted two ways. Files applied by hand
through the SQL editor or `db query` left no row at all (the seven August files from
`20260809120000` to `20260813090000`, plus `spatial_ref_sys_read_only` and
`account_setup_and_legal`). Files applied through the Supabase MCP's `apply_migration` were
recorded under the time they ran rather than their own version
(`20260927144918 guest_browse_read_paths` for `20260922130000_guest_browse_read_paths.sql`).

It was repaired with `migration repair` alone, which writes only that history table and
runs no migration SQL: 27 versions recorded as applied, each one's objects confirmed live
first, and 19 mislabelled rows removed. What those 19 rows recorded is archived verbatim in
`snapshots/2026-10-01-ledger-rows-replaced.sql`, since six of the files had been edited
after they ran (see `SCHEMA_CHANGELOG.md`, 2026-10-01).

To keep it matching, apply with `db query -f` and record with `migration repair`, as above.
If something is applied through the MCP's `apply_migration`, its row carries the wrong
version: revert that version and record the file's own. A complete ledger still is not
proof — confirm the objects exist before trusting it.

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

**✅ Done 2026-09-28.** `schema.sql` was regenerated from production in `422e2c9`
(04:34 UTC, after `20260928170000`), and a second dump taken afterwards matched it
line for line apart from the timestamp. It covers every migration through
`20260928170000`, not just these nine: every table (28), function (100) and added
column (23) that any file in `migrations/` creates is present in it.

That dump did not capture column-level grants, and it only ever added privileges, never
revoked them. This note said on 2026-09-28 that the gap "fails closed". It did not:
Supabase's default privileges grant every new table to `anon`, so a database built from
that `schema.sql` would have let a guest read `games.invite_token` again (reproduced on a
local Postgres on 2026-10-01). **Fixed 2026-10-01:** the dump now records exact
privileges, column-level included — see "Regenerating schema.sql".

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

- **`20260928160000_note_comment_authors_and_paging.sql` — ✅ APPLIED 2026-09-28.**
  DROP + CREATE of `get_note_comments_with_likes` (gains `author_name`,
  `author_avatar_url`, a `p_limit` cap and a `p_before` cursor) and of
  `add_note_comment` (gains `p_client_id`).

  Note replies were the last surface where you could not tell who wrote what — the
  function returned a bare `user_id`. Safe to widen: it is granted to `authenticated`
  only, so no identity reaches a guest, and it is SECURITY INVOKER so the `profiles`
  join resolves under the caller's own RLS.

  **Both are drop+create, and dropping a function drops its grants.** Verified after
  applying with `has_function_privilege`: `authenticated` can execute both, `anon`
  cannot, and no stale overload survived that PostgREST could resolve ambiguously.
  Also probed through PostgREST itself with the publishable key — both return
  `42501 permission denied`, not `PGRST202 could not find the function`, which proves
  the schema cache picked up the new parameter names *and* that anon is refused.

  Paging verified on a five-comment fixture with distinct timestamps: the full thread
  returns `c1..c5` in reading order, `p_limit => 2` returns the newest two, and a
  `p_before` cursor on c4 returns `c3,c4` — inclusive, as designed, with the caller
  dropping the repeated boundary row by id. An earlier run of this test was
  meaningless because `generate_series` gave all five rows the same `created_at`,
  leaving the order to a random uuid tiebreak; it was redone with distinct times.

- **`20260928170000_spatial_ref_sys_read_only.sql` — ✅ APPLIED 2026-09-28.** A
  statement-level trigger that refuses INSERT/UPDATE/DELETE/TRUNCATE on
  `public.spatial_ref_sys` from `anon` and `authenticated`.

  Found in the pre-launch security pass: the table is PostGIS's, sits in `public` with
  RLS off, and supabase_admin had granted the API roles every privilege on it. Before
  applying, a PATCH through PostgREST with the publishable key returned **200**; one
  `DELETE ?srid=eq.4326` would have broken every geography query in the app. RLS and
  REVOKE are both unavailable to `postgres` (not owner, not grantor); TRIGGER is.

  Dry-run first inside `begin; … rollback;` (owner write passes, `set local role anon`
  write raises, `authenticated` reads 4326), then confirmed nothing persisted. After
  applying, probed through PostgREST as a guest: PATCH and DELETE both return
  `401 42501 spatial_ref_sys is read-only`, a read of 4326 returns 200, and
  `get_guest_games_at_venue` still computes geography distances (52 m to a real game).
  The `rls_disabled_in_public` lint on this table stays — only the owner can clear it.

- **`20260928180000_account_setup_and_legal.sql` — ✅ APPLIED 2026-09-28.** Birthdate,
  country, gender and legal acceptance, collected before an account exists (phase 1 of
  the teen/adult split). New tables `profile_private` (owner-read, no write policy),
  `legal_acceptances`, `legal_documents`, `min_age_by_country`, `app_flags`
  (`teen_signups_open = false`); `handle_new_user` now applies the rules at insert and
  strips the answers from auth metadata; RPCs `get_guest_signup_rules`,
  `get_my_account_status`, `complete_account_setup`.

  Applied **before** the client that sends the fields, deliberately: the old client sends
  no birthdate, which takes the "created but setup incomplete" path, so sign-ups kept
  working in between.

  Dry-run inside `begin; … rollback;` through the MCP (which holds the transaction),
  inserting real `auth.users` rows: an adult with full metadata gets a private row, 3
  acceptances, gender, `setup complete = true`, and metadata reduced to its unrelated
  keys. Refused with no `auth.users` row left: 12 in US (`FUN_UNDER_MIN_AGE`), 15 in US
  (`FUN_TEEN_SIGNUPS_CLOSED`), 15 in AU and DE (min 16), a future date, a malformed
  date, a 3-letter country, a stale terms version. A metadata-less sign-up is created
  incomplete, cannot insert into `profile_private` directly (42501), completes via the
  RPC, and a later attempt to change its birthdate is ignored. Guests can call only
  `get_guest_signup_rules`. Verified afterwards that the rollback left no objects.

  `min_age_by_country` values are GDPR Art. 8 national ages plus AU 16, KR 14, CN 14 —
  **to be confirmed by counsel** before teens are admitted outside the US.
  `legal_documents.current_version` must equal `LEGAL_VERSION` in `src/lib/legal.ts`.

- **`20260929120000_invite_preview.sql` — ✅ APPLIED 2026-09-29.** Adds
  `get_invite_preview(uuid)`, the data behind a real share-link unfurl. Read by
  `api/invite-preview.ts`, which rewrites six meta tags into the served
  `index.html` for `/g/<token>`.

  **The projection is the point.** Ten columns, none of which can name a person:
  no `created_by`, no host, no participant names, no `id`, no coordinates, no
  `description`. What, where, when, how many — the same four things the map already
  shows a signed-out visitor, now on the share card. Verified over HTTP in
  production with the publishable key: the response carries exactly those ten
  fields and nothing else.

  Granted to `anon` because crawlers are unauthenticated. Enumeration is not a
  concern (`invite_token` is a v4 uuid) and the token is already the credential —
  whoever holds it can redeem and join. The endpoint reads with the **anon** key
  rather than the service role specifically so it cannot exceed a guest.

  Verified end to end on production: a crawler UA gets per-game `<title>`,
  `og:title`, `og:url` and the twitter pair; a well-formed but unknown token
  degrades to the generic shell; a non-uuid token is rejected at the edge with a
  400; and a real visitor still boots the SPA, reaches `RedeemInvite`, and
  bounces to sign-in with `?redirect=/g/<token>` intact.

  Note for whoever edits that route next: the `/g/:token` rewrite must stay
  **above** the SPA catch-all in `vercel.json`, and that file takes no comments.
  An extra key such as `"//"` fails Vercel's schema validation, and a failed
  build leaves the *previous* deployment serving — which is indistinguishable
  from the rewrite quietly not working. That cost one deploy cycle to diagnose.

- **`20261002120000_chat_reads_revoke_internal_rpcs.sql` — ✅ APPLIED 2026-10-02.**
  Takes two helpers from `20260928120000_chat_reads.sql` back off the REST surface.

  `chat_reads_touch_sender()` is a **trigger function** and was reachable at
  `/rest/v1/rpc/chat_reads_touch_sender`. Calling a trigger function directly
  raises rather than doing damage, so this is less a hole closed than an endpoint
  that should never have existed. Revoked from everyone including `authenticated`,
  because PostgreSQL checks EXECUTE when a trigger is *created*, not when it
  fires — verified in a rolled-back transaction: with EXECUTE revoked from
  public, anon and authenticated, inserting a game message still advanced the
  sender's watermark.

  `viewer_is_dm_thread_member(uuid)` kept the default PUBLIC execute, so `anon`
  could call it. Harmless on its own — it answers "is auth.uid() in this thread",
  always false for anon — but the guest surface is meant to be exactly the
  `get_guest_*` functions. `authenticated` keeps it, because the
  `chat_reads: read your dm thread` policy calls it and a policy's function runs
  with the querying role's privileges; verified the policy still evaluates.

  Grant matrix after, confirmed with `has_function_privilege`:

  | function | anon | authenticated |
  |---|---|---|
  | `chat_reads_touch_sender` | ✗ | ✗ (trigger only) |
  | `viewer_is_dm_thread_member` | ✗ | ✓ (policy needs it) |
  | `mark_thread_read`, `get_my_unread_counts`, `get_thread_read_receipts`, `map_note_visible_to` | ✗ | ✓ |
  | `get_invite_preview` | ✓ | ✓ (crawlers are unauthenticated — intended) |

  Ledger note: `apply_migration` records under its own timestamp, which left an
  orphan row (`20261002043655`) and an unrecorded file. Repaired both ways, so
  the ledger is 64 rows against 64 files with zero mismatches.

## Resolved 2026-09-28 — anonymous sign-ins were enabled

**Resolved.** Re-checked 2026-09-28: `GET /auth/v1/settings` reports
`anonymous_users: false` (email is the only provider, confirmation required), and the
advisors no longer raise the anonymous-access lint.

Turning the provider off stops only *new* anonymous sign-ins; an existing session keeps
refreshing. 2 of the 4 dormant accounts still held one, so those 2 rows were deleted from
`auth.sessions` on 2026-09-28 (their refresh tokens went with them). Verified after: 0
sessions and 0 unrevoked refresh tokens belong to anonymous users. The 4 accounts, their
profiles, 6 participant rows and 7 expired games were left as they were.

The original finding is kept below for the record.

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
