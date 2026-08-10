# Schema changelog

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
`20260810000000_drop_legacy_create_game_overload.sql`.

No client change needed: `src/lib/api.ts` calls the 11-arg version first and only falls back
to the 9-arg on a specific "missing argument" error, so the fallback branch simply becomes
unreachable.

### `get_unified_feed` skips the gender gate

Lists games that `get_games_nearby` and `get_live_nearby` deliberately hide. Known,
knowingly not fixed.
