# Schema changelog

## 2026-10-01 — The ledger matches the folder; `schema.sql` keeps what was revoked

No new migration, and no migration SQL ran. Three records were wrong about production.

**The ledger.** `supabase_migrations.schema_migrations` now lists all 63 files under their
own versions. Nine files had no row (applied by hand), and eighteen were recorded under
the time the Supabase MCP applied them rather than their filename version. `supabase
migration repair` recorded 27 versions and removed 19 rows; it writes only the history
table. Every file's objects were confirmed live first. The 19 removed rows are archived in
`snapshots/2026-10-01-ledger-rows-replaced.sql`.

Comparing what those rows recorded with the files found six files edited after they ran.
Four differ only in comment wording or formatting (`game_lifecycle_fixes`, `suggested_games`,
`game_host_summary`, `saved_venues`). `chat_reads` had absorbed the separately applied
`chat_reads_tighten_grants`, so that row had no file of its own. One difference was real:
`20260922120000_game_read_visibility_and_invite_tokens` revoked `viewer_is_game_participant`
from PUBLIC only and granted it to `authenticated`, while production received
`from public, anon` and `to authenticated, service_role`. Revoking PUBLIC alone leaves anon
the EXECUTE that Supabase's default privileges grant, so the file was corrected to the form
production has. Production's ACL already was `{postgres, authenticated, service_role}`.

**`schema.sql` privileges.** The dump only ever added grants. Supabase's default privileges
grant ALL on new tables and EXECUTE on new functions to `anon`, `authenticated` and
`service_role`, so a database built from it would have handed a guest `games.invite_token`
(reproduced on a local Postgres) and every member-only RPC. `dump-schema.mjs` now resets
each table and function for those roles and grants exactly what production has, column
grants included; replayed against grant-everything defaults, 45 of 45 privilege checks
matched production. The regenerated file also picks up `get_invite_preview`
(`20260929120000`), which the last dump predated.

## 2026-09-28 — Age, country and the legal documents, before the account exists

`20260928180000_account_setup_and_legal.sql`.

FUN is splitting into two communities that never meet: under-18s and adults. The line
is a birthdate, so sign-up now asks for it (with country, gender and acceptance of the
Terms, Privacy Policy and Community Guidelines), and the server — not the form — decides:
`handle_new_user` raises on an under-age sign-up, which aborts the auth insert, so no
account exists to clean up. The minimum is 13, or the country's higher legal minimum
(`min_age_by_country`: GDPR digital-consent ages, Australia's 16). Teen sign-ups stay
shut (`app_flags.teen_signups_open`) until the wall between the tiers is live.

The birthdate lives in `profile_private`, which only its owner can read and nobody can
write through the API — so it cannot be edited to cross the line — and is stripped from
auth metadata, which would otherwise ride in every session token. Accounts made before
this, or sent back by a terms update, finish at `/account-setup`.

## 2026-09-28 — `schema.sql` caught up with production

Regenerated in `422e2c9`, the first dump since 2026-08-12: 44 tables, 122 functions,
111 policies, 77 indexes and 16 triggers (was 34 / 81 / 83 / 64 / 12). The Realtime
publication now reads `chat_reads, dm_messages, game_messages, notifications`.

Checked against the repo rather than trusted: every table, function and added column
that any of the 61 files in `migrations/` creates exists in the dump. That matters for
the seven files from `20260809120000` to `20260813090000`, which were applied by hand
and so have no row in `supabase_migrations.schema_migrations` — their objects are live
all the same. The September files that went through the Supabase MCP are recorded
under their apply-time versions (`20260927144918 guest_browse_read_paths` for
`20260922130000_guest_browse_read_paths.sql`), so `supabase migration list` will not
line up with the folder by version.

## 2026-09-28 — Guests can no longer write to PostGIS's coordinate table

`20260928170000_spatial_ref_sys_read_only.sql`.

`spatial_ref_sys` arrived with postgis, in `public`, owned by supabase_admin, RLS off,
and with every privilege granted to `anon` and `authenticated`. PostgREST served it, so
a signed-out browser holding the publishable key could edit or delete rows — and every
geography in this schema is SRID 4326, which PostGIS resolves by reading that table.
Deleting one row would have taken the map's distance queries down for everyone.

`postgres` can neither enable RLS (not the owner) nor revoke (not the grantor), but it
holds TRIGGER, so a statement-level trigger now refuses writes from the two API roles.
Reads, and supabase_admin (postgis upgrades), are untouched.

## 2026-09-28 — The map read carries the host; venues can be saved

`20260928100000_game_host_summary.sql`, `20260928110000_saved_venues.sql`.

`games.created_by` is a bare uuid and there is no batch profile lookup anywhere
in the client — every use of it is an identity comparison to decide host-ness,
never a name fetch. So a card that names the host had two options: two
round-trips per pin tap, or denormalise onto the row already being read. On a map
where tapping around is the main gesture, the first is the wrong answer.
`get_guest_games_nearby` nulls all three columns, exactly as it already nulled
`created_by`, so the client renders no host row because there is no host name —
not because the JSX checked who was looking.

`saved_venues` gives the venue card a Save that survives changing phone.
`venue_id` is text (OSM ids look like `way/642660826`) and deliberately carries
no foreign key: the OSM importer deletes and reinserts rows on a re-import, and a
cascade there would silently wipe every save. An orphan is harmless — the read
inner-joins and drops it.

## 2026-09-27 — The loop that closes after the game

`20260927160000_post_game_loop.sql`.

Before: the trust system was complete and had never fired. `athlete_endorsements`,
`endorse_athlete`, `get_athlete_reputation`, `profiles.sportsmanship_avg`,
`TrustRatingsBlock`, the badge in chat — all shipped, and every rating in the
database was zero, because nothing in the app had ever asked anyone to rate anyone.
`game_participants.confirmed_result` had been in the schema since it was written
and nothing had ever set it. And `athlete_endorsements` had RLS enabled with INSERT
and UPDATE policies and **no SELECT policy at all**, so any client read of it
returned nothing — silently, because the trigger-maintained aggregate on `profiles`
kept working and the number on screen looked fine.

After: three tables and the moment that fills them, in the game's own chat thread
once the game is over. `game_outcome_reports` answers "did it happen?" (and a
`played` finally sets `confirmed_result`, which is the honest numerator of
games-played over games-created). `get_rateable_teammates` is the row of faces that
calls the endorsement RPC that has existed all along. `game_polls` /
`game_poll_votes` are the host-only "run it back?" with one In-or-Out vote each and
a partial unique index allowing exactly one open poll per game.

`get_game_outcome_summary` is plpgsql rather than sql on purpose: an aggregate with
no GROUP BY returns one row even when the WHERE matched nothing, so a participant
test in the WHERE clause would still have handed an outsider a row — including the
participant count.

Check-in is deliberately still deferred; when it lands, joining a game should mark
attendance rather than asking a second time.

## 2026-09-27 — Games ranked for the person looking at them

`20260927150000_suggested_games.sql`.

Before: nothing in the schema answered "is anyone playing my sport near me
tonight?". `get_games_nearby` ordered by distance, `get_unified_feed` by
`created_at`, and the client's `rankGameRows` was a four-key sort. The app knew
what games existed and nothing about which one you would go to.

After: `get_suggested_games` scores sport match 40%, time-to-start 25%, distance
20%, spots left 10% and host reputation 5%, modelled on `get_similar_athletes` —
the only other weighted scorer here. Your own games and ones you already joined
are excluded; the gender, liveness and TTL rules are the same ones
`get_games_nearby` enforces, so a suggestion is always a pin the map would draw.
An unrated host scores the middle of the scale, not the bottom, so reputation
tips a tie rather than burying a first-time host.

Also `get_games_at_venue` (+ a guest wrapper): the games hosted at a set of
coordinates, past ones flagged. OSM records what a place is *tagged* as, not what
happens there — a park tagged `leisure=park` may have three hoops and a `pitch`
may be locked every evening — and this is the only first-hand evidence either way.

## 2026-09-27 — Games become things you can talk about in public

`20260927130000_game_social.sql`, then `20260927140000_unified_feed_games_v2.sql`.

Before: a game had exactly one conversation, `game_messages` — the private thread
for people who had already joined. There was nowhere to ask the question you ask
*before* joining ("beginners welcome?", "is there parking?"), and the feed threw
games away entirely, because `get_unified_feed` returned them with
`comment_count = 0, like_count = 0, liked_by_me = false` hard-coded and no start
time, status, spots or venue. There was nothing to put on a card you could act on.

After: `game_comments`, `game_comment_likes` and `game_likes` give a game the same
three tables notes already had, with the same RPC surface, so the feed renders both
through the same components. Every policy delegates to the games read policy — a
comment on an invite-only game is invisible to someone who cannot see the game,
without this migration knowing anything about visibility — and `anon` holds no
privilege on the tables at all, reading only through `get_guest_game_comments`,
which projects no author. `get_unified_feed` returns a `game` jsonb column with
everything a joinable card needs, including whether the viewer is already in, and
real counts. It also gains the untimed-TTL predicate it never had: a pickup game
with no start time used to sit in the feed forever, while the map retired it after
three days.

## 2026-09-27 — An ended game ends

`20260927120000_game_lifecycle_fixes.sql`.

Before: `status`, `ends_at` and `ended_at` could all disagree about the same game,
and every consumer keyed off a different one. `start_game` set
`ends_at = now() + duration` and its own `BEFORE UPDATE OF starts_at` trigger
immediately overwrote that with `starts_at + duration`, so a 7 pm game started at
8:30 was born already over. `end_game` set `status` and `ended_at` but left
`ends_at` an hour in the future, which is what `mark_ended_games_completed`'s own
WHERE clause reads. And `get_my_game_inbox` — the one surface that lists games
regardless of date, so it cannot infer "over" from a row's absence — returned
`ends_at` without `ended_at`, so a game the host ended 20 minutes in read
"Live · 70:00 left" in its own chat header.

After: the trigger respects an `ends_at` the statement set deliberately and never
re-times a completed or cancelled game; `end_game` closes `status`, `ended_at` and
`ends_at` together; the inbox returns the whole lifecycle (`status`, `ends_at`,
`ended_at`, `live_started_at`) and lets the client decide. `mark_ended_games_completed`
is scheduled under pg_cron where the extension exists, and says so in a notice where
it does not — it stays revoked from `authenticated`, because it writes other people's
rows.

`get_unified_feed`'s missing untimed-TTL predicate is deliberately not here:
`unified_feed_games_v2` replaces that function for feed game cards and fixes it there.


## 2026-09-26 — The map read stops carrying the venue card's data

`20260926120000_venues_in_bbox_slim.sql`.

Before: `get_venues_in_bbox` returned 20 columns for up to 1,000 venues — 416 KB per
map load, of which 303 KB was `wikidata_description`, `photo_attributions`,
`hero_image_url`, `enrichment_source`, `wikidata_label`, `opening_hours`, `website`,
`operator`, `surface` and `lit`: data the map never draws, downloaded, parsed and
held as a GeoJSON property on every pin so that the venue card could re-read the same
row through `fetchVenueById` the moment it opened.

After: nine columns — position and identity, what to draw, and whether to draw it at
all. 113 KB. Filters, ordering and the cap are unchanged. The venue card still reads
the full row on open, which it already did.

## 2026-09-22 — Guests browse; the database is what says so

`20260922130000_guest_browse_read_paths.sql`, then (after the client ships)
`20260922140000_guest_browse_lock_anon_tables.sql`.

Before: a signed-out visitor saw an empty map, because `can_view_game_for_gender`
answered "no gender on file, no games" — and at the same time could read every
profile, the whole follow graph, every public note with its author, and every
venue review with its `user_id`, straight off the tables. The product said
"guests see nothing about people" while the database said the opposite.

After: guests read six `get_guest_*` functions and nothing else. Each is a thin
SECURITY DEFINER select over the function members already use, projecting no
`created_by` and no `user_id`, filtered to public games and public notes. The
gender rule now reads "Co-ed is open to everyone; Same gender needs an exact
match", which is what every other part of the app already assumed, and which also
gives a member who skipped onboarding the Co-ed games instead of an empty map.
The identity tables move to `authenticated`, so the anonymity is a property of
the schema rather than of the UI.

Note the deploy order: part 1 is additive and can go first; part 2 removes access
the shipped client still uses, so it follows the deploy. MIGRATION_ORDER.md has
the detail.


## 2026-09-22 — Game reads enforce their own rules

`20260922120000_game_read_visibility_and_invite_tokens.sql`.

Two things were true of production until today: any signed-in account could read
every game's `invite_token` (and `redeem_invite_token` asks for nothing else, so
that is a key to every invite-only game), and the "Same gender" rule was enforced
only inside the read RPCs while the table itself answered `select *` to anyone —
including a signed-out caller. The gate that migration `20260801130000` moved out
of the client was never put on the door the rows actually leave through.

Now: `games` and `game_participants` have SELECT policies that mirror the RPCs
(host, participant, or gender-and-visibility eligible) and `invite_token` is
revoked from the client roles, readable only through the new
`get_game_invite_token()` for the host and joined players. `anon` keeps the
column grants but matches no policy, so signed-out reads come back empty rather
than as an error — the two SECURITY INVOKER feed RPCs read `games` under the
caller's rights and would otherwise fail outright for guests.

Caveat to carry forward: column-level grants do not cover columns added later. A
new column on `games` needs adding to that grant, or clients get
`permission denied` for it.


## 2026-08-10 — Baseline recovered, SQL Editor snippets triaged

### What happened

`schema.sql` had been a 0-byte file since 2026-07-23, and no migration creates the base
tables. The ~26 snippets saved in the Supabase SQL Editor were the only surviving copy of
the foundational schema.

**Fixed:** `schema.sql` regenerated from production (33 tables, 80 functions, 82 policies,
62 indexes) via the new Docker-free `scripts/dump-schema.mjs`. The repo can rebuild again.

**Fixed:** added `20260810000000_drop_legacy_create_game_overload.sql` to remove a
duplicate `create_game` overload (see below).

---

## SQL Editor snippet triage

Production is **ahead of** these snippets — the live `get_unified_feed` takes
`p_map_radius_km` where the snippet says `p_radius_km`, and prod has `venue_reviews`,
`venue_photos`, `venue_comments`, `venue_photo_reports`, `venue_comment_likes` that appear
in no snippet at all. **Snippets are historical scratch, not a source of truth.**

Everything in the "critical" column below is now captured in `schema.sql`, so all of it is
safe to delete from the dashboard.

**Deletion clearance (verified 2026-08-10).** The snippets create **44 distinct functions and
21 distinct tables**. Every one of them was checked against production *and* against
`schema.sql`: **0 missing in either**. No snippet is the last copy of anything. The raw text
is archived verbatim at `supabase/snapshots/2026-08-10-sql-editor-snippets.sql` (marked
DO NOT RUN — it is not dependency-ordered and several snippets are broken).

The only snippet worth keeping is one you **wrote but never ran** — a draft of work still
pending. That exists nowhere else. Everything else can go.

### Broken — do NOT re-run

| Snippet | Defect |
|---|---|
| **Create and Fix Game RPCs and Support Columns** | *Highest blast radius.* Declares parameter `sport text` but the body inserts `p_sport` ⇒ runtime failure. Opens with `drop function … cascade` on **every** `create_game` overload — re-running it today destroys the working 11-arg function and installs a broken one. |
| **Substitute Queue Join/Leave Logic** | `join_game` is malformed: after `if v_spots_needed is null` it falls straight into `from public.game_participants gp …`, missing both the `then … end if;` and the `select count(*) into v_player_count`. Will not compile. Also silently drops `limit 50` from `get_games_nearby`, leaving it unbounded. The working live `join_game` came from elsewhere and is now in `schema.sql`. |
| **Location-Based Map Notes with Unified Nearby Feed** | `get_unified_feed` references `g.visibility`, `g.lat`, `g.lng` and `is_game_visible_on_map()` that a *later* snippet creates ⇒ order-dependent failure. Signature is also stale vs production. |
| **My Notes Inbox Feed** | `get_my_note_inbox` declares `RETURNS TABLE (… is_author boolean)` but selects `as is_athor`. Harmless today (positional binding), a landmine on any refactor. |

### Critical — were the only copy, now captured in schema.sql

`Beginner-Friendly Sports Map Schema` (postgis, profiles, games, profile_locations,
game_participants, base RLS) · gamification snippet (user_stats, badges, user_badges,
notifications, **game_results**) · `complete_game` · auth trigger (`handle_new_user`,
`on_auth_user_created`) · athlete endorsements · `24h Status Updates` ·
`Direct Message Threads & Inbox` · athlete-profile JSONB + `search_profiles` · per-game
chat (`game_messages`) · `Host Rate Limit & Nearby Game Merge Helpers` ·
`Sync game coordinates from location` (`fun_games_sync_lat_lng`) ·
`Atomic Game Join RPC Function`.

`game_results` in particular existed in **zero** repo files before this change.

### Redundant — safe to delete

**Exact duplicates** (keep one, delete the rest):
- `Trigger Schema Reload` ≡ `Reload Schema Notification` — both are just `notify pgrst, 'reload schema';`
- `Live Game Lifecycle and Nearby Filtering` ≡ `Live game lifecycle & nearby filters`
- The `location_label` migration, saved twice
- The athlete-profile JSONB migration, saved three times
- The "Users can delete own participation" policy, saved twice

**Superseded iterations** — only the last of each chain ever mattered, and even that is now
superseded by `schema.sql`:
- ~8 successive `get_games_nearby` definitions
- ~7 successive `get_profiles_nearby` definitions, of which three patch the same function in
  sequence: `Nearby Profiles Map Visibility Fix` → `Nearby profiles lookup with self visibility`
  → `Get Nearby Profiles (Self-Included)`

**Scratch SELECTs with no reason to be saved:**
`Nearby Sports Games Lookup` · `Fetch Recent Game Location and Timing Data` ·
`List of specific public functions` · `Fetch User Profile Status` · `Drop Game Inbox Function` ·
`Untitled query` · plus the one-off `select count(*) from osm_sports_venues`,
`select column_name from information_schema.columns where table_name='games'`, and
`select pg_get_functiondef(…)` probes.

> The dashboard sidebar was scrolled when captured, so a few snippets above
> "Sync game coordinates from location" are not classified here. Apply the same rule:
> if it only creates objects, `schema.sql` already has them; if it only selects, delete it.

---

## Live findings (independent of snippets)

### `create_game` had two overloads — the only app-level duplicate

Verified against production: every other duplicated function name in `public` is a PostGIS
built-in. `create_game` had both

- 9-arg `(p_title, p_sport, p_lat, p_lng, p_spots_needed, …)` — legacy, and
- 11-arg `(p_title, p_sport, p_spots_needed, p_lat, p_lng, …, p_duration_minutes, p_visibility)`

The 9-arg version is `SECURITY DEFINER`, executable by `anon`/`authenticated`, and inserts
games rows while silently ignoring duration and visibility — a write path that bypasses the
visibility rules enforced everywhere else. Dropped by
`20260810000000_drop_legacy_create_game_overload.sql`, **applied to production 2026-08-10**.

Verified after the drop: exactly one overload remains —
`create_game(text,text,integer,double precision,double precision,timestamptz,text,text,jsonb,integer,text)`,
`SECURITY DEFINER`, executable by `authenticated` but **not** `anon`.

No client change needed: `src/lib/api.ts` calls the 11-arg version first and only falls back
to the 9-arg on a specific "missing argument" error, so the fallback branch simply becomes
unreachable.

### `get_unified_feed` skipped the gender gate — fixed

It listed games that `get_games_nearby` and `get_live_nearby` deliberately hide. Closed by
`20260810120000_unified_feed_gender_gate.sql`, applied to production 2026-08-10 and verified
live (`get_unified_feed` now calls `can_view_game_for_gender`).
