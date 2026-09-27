# Schema changelog

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
