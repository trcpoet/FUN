# Filter + Presence Trust Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Ghost/Squad/Public *presence* system (who sees you), game-*visibility* filtering on the map (which games you can see/join), and DB-backed *follows* — building on the already-shipped *filter* trust work.

**Architecture:** Three independent systems must not be conflated: **A — Presence** (others seeing you; `LocationVisibilityMode`), **B — Filters** (what you see; `gameFilters.ts` — already done), **C — Game visibility** (who can join/see a game; `games.visibility`). Invariant: A never disables B (Ghost users still fetch games and Apply filters).

**Tech Stack:** React 18 + TS + Vite + Tailwind + Supabase (PostGIS RPCs). Single linked project `gdzhyhmqufqmcdsvvotj` (production — the only DB).

**STATUS: COMPLETE — migration `20260615231608_filter_presence_trust.sql` applied to PRODUCTION + verified; client code (api.ts, gameFilters.ts, App.tsx, TopUI.tsx, PublicProfile.tsx, DiscoveredPeopleCarousel.tsx) implemented; `npx tsc --noEmit` clean (exit 0). Hardening: revoked PUBLIC/anon EXECUTE on update_my_presence. Remaining: manual two-account functional test + optional `/code-review` + commit (on user request).**

**Live-access path (resolved):** Supabase MCP OAuth failed (422 / localhost callback unreachable). Pivoted to **Supabase CLI 2.106** (`brew upgrade`d from 2.75) → `supabase db query --linked` and `gen types --project-id` both run via the **Management API** (Docker-free, no password). Migration applies via `supabase db push`. Sequencing: **all-in this pass**.

---

## Phase 0 — Audit findings

### Confirmed from static analysis (do not re-derive)

| Area | Finding | Source |
|---|---|---|
| **System B — Filters** | **DONE & committed.** `FiltersState.matchType` exists; `displayGames` routes through `gameMatchesFilters` (inclusive skill/age/matchType); single-source `appliedFilters` + derived `effectiveGamesRadiusKm`; active pill; empty banner; persisted `fun_applied_f_v1`. | `gameFilters.ts`, `App.tsx:115/123/570-576`, `FiltersModal.tsx:32/42/272`; commit `a718a8a` |
| `games.visibility` | **Column EXISTS** (`public`\|`friends_only`\|`invite_only`, default `public`, indexed). | migration `20260501080000` L73-89 |
| `is_eligible_to_join_game(game_id,user_id)` | **RPC EXISTS** — canonical visibility logic: host always; `public` → true; `friends_only` → mutual **or** one-way `user_follows` **or** approved invite; `invite_only` → approved invite only. **This is the contract `gameVisibleToViewer` must mirror.** | migration `20260501080000` L166-231 |
| `user_follows` table | **EXISTS** with RLS (read public; insert/delete own). DB follow-graph already present. | migration `20260501080000` L99-124 |
| `games.requirements` | jsonb; `get_games_nearby` returns it (live-probed, memory obs 568/576). | plan `2026-06-13` pre-flight |
| `get_games_nearby` body | **NOT in version control** (predates tracking). Section 7 of `20260501080000` (L434-449) is a verified no-op — it does **not** modify the RPC. | migration `20260501080000` |
| `location_visibility` (presence) | **localStorage ONLY** (`locationVisibility.ts`, key `fun_location_visibility_v1`). No DB column, no RPC. Modes: `ghost`\|`close_friends`\|`public`. | `locationVisibility.ts`; grep: 0 SQL hits |
| Client follows | **localStorage ONLY** (`localFollows.ts`, key `fun_discover_followed_ids`) — does **not** use the existing `user_follows` table. | `localFollows.ts` |
| `displayGames` visibility | **NO `gameVisibleToViewer` step** — friends_only/invite_only games are shown to everyone on the map. | `App.tsx:570-576` |
| API layer | `getProfilesNearby` exists (`api.ts:842`); **no** `updateMyPresence`, `followUser`/`unfollowUser`, or presence logic. | `api.ts` grep |
| `get_profiles_nearby` returns | `ProfileNearbyRow` = `{ profile_id, display_name, avatar_url, avatar_id?, sportsmanship?, status_body?, status_expires_at?, lat, lng, distance_km }`. So profiles location is already served — source column unknown (live-only). | `supabase.ts:161-174` |

### Open questions — RESOLVED via live introspection

1. **Location source = `profile_locations`** (NOT profiles). Columns: `profile_id` (PK, 1:1 FK→profiles.id), `lat`, `lng`, `location_geography` (geography), `updated_at`. **The prompt's "add lat/lng to profiles" was wrong** — presence `location_visibility` goes on `profile_locations`; `updated_at` already exists for staleness.
2. **`get_profiles_nearby` body** — reads `profile_locations pl` JOIN profiles JOIN auth.users + lateral status; already enforces **45-min** staleness (not 30) + onboarding/anonymous privacy (self always shown); distance via `st_distance`, order by `<->`. Migration ANDs a visibility gate; preserves 45m.
3. **`get_games_nearby` does NOT return `visibility`** → migration drops+recreates it with `visibility` appended (return-type change can't use CREATE OR REPLACE). Re-grant `anon, authenticated`.
4. **`profiles.id = auth.users.id`** confirmed (FK).
5. **Existing writer = `update_my_location(p_lat,p_lng)`** (kept; called directly at `App.tsx:317` — a pre-existing api.ts-bypass). New `update_my_presence(lat,lng,mode)` mirrors it + sets visibility.
6. **Security finding (fixed in migration):** `profile_locations` had RLS policy *"viewable by everyone (using true)"* → any caller could read ghost users' coords directly, bypassing the RPC. All readers are SECURITY DEFINER + client never reads the table directly, so migration restricts direct SELECT to own-row. `get_advisors` unavailable without MCP — security checklist applied manually; will re-verify via `db query` post-apply.

### Environment reconciliation (prompt was authored for Cursor)

| Prompt references | Reality in this (Claude Code) session | Substitution |
|---|---|---|
| `user-supabase`, `user-postgres`, `cursor-ide-browser` MCP | **Not present** | Supabase MCP = `plugin_supabase_supabase` (OAuth); browser verify = manual `npm run dev` + `window.__FUN_MAP__` DEV handle + DevTools |
| `backend-patterns`, `mapbox-*` skills | **Not in skill list** | Apply patterns manually; MapboxMap edits surgical (file is ~3200 lines, fragile) |
| ECC agents `code-reviewer`/`typescript-reviewer`/`security-reviewer`/`database-reviewer` | **Not in agent list** | `superpowers:requesting-code-review` skill + `/code-review` command + `npx tsc --noEmit` gate |
| `apply_migration` straight to DB | Single **production** DB; no staging | Show SQL + advisors for approval before applying; idempotent guards (`add column if not exists`) |
| Supabase CLI | v2.75.0 linked, but `db query` needs v2.79.0+, no service-role key in `.env` | Can't run arbitrary SQL via CLI; need MCP or a credential |

---

## Remaining scope (the 06-14 superset over the shipped filter work)

- **System C — Game visibility on map (NO DDL):** add `gameVisibleToViewer(game, currentUserId, followedIds)` to `gameFilters.ts` mirroring `is_eligible_to_join_game`; insert as a `displayGames` step. Pure client-side; only needs `followedIds` (works with current localStorage follows, better with DB follows).
- **System A — Presence (REQUIRES DDL):** `profiles` presence columns + `update_my_presence` RPC + visibility-aware `get_profiles_nearby` (exclude self, ghost, stale >30 min; `public` → in-radius; `close_friends` → either-direction `user_follows`). API `updateMyPresence`; wire in `App.tsx`/`TopUI.tsx`; ghost banner in `MapboxMap`; rename presence "Live" → "Public".
- **DB follows (REQUIRES API + one-time migrate):** `followUser`/`unfollowUser`/`fetchMyFollowedIds` in `api.ts` against `user_follows`; one-time localStorage→DB upsert on login; deprecate `localFollows.ts`.

Proposed presence migration shape (**PENDING Q1/Q2 above — column choices may change**): `profiles.location_visibility text not null default 'ghost' check (...)`, `location_updated_at timestamptz`, and lat/lng **only if profiles lacks a location source**; geo index on non-ghost + fresh rows; `update_my_presence` security definer (own row, `auth.uid()`); rewrite `get_profiles_nearby` for visibility + staleness.

---

## Phase 1 — Migration (WRITTEN: `supabase/migrations/20260615231608_filter_presence_trust.sql`)

1. `profile_locations.location_visibility text not null default 'ghost'` + check + `(location_visibility, updated_at)` index.
2. RLS: drop *"viewable by everyone"*, add *"read own only"* (`profile_id = auth.uid()`).
3. `update_my_presence(p_lat,p_lng,p_mode)` — upsert location + visibility (auth.uid only).
4. `get_profiles_nearby` — `CREATE OR REPLACE` (same shape) + visibility AND-clause.
5. `get_games_nearby` — DROP + recreate with `visibility` column + re-grant.
6. `notify pgrst, 'reload schema'`.

**Apply:** `supabase db push` (only this new file is pending; local⇄remote in sync). **Verify:** `gen types` shows new column + RPC shapes; `db query` spot-checks ghost exclusion.
**Behavior change to flag:** existing `profile_locations` rows default to `ghost` → users hidden until they pick Public/Squad (presence toggle is currently cosmetic server-side).

## Phase 2-4 — Client (task list)

- [ ] **api.ts:** `updateMyPresence({lat,lng,mode})`, `followUser`/`unfollowUser`/`fetchMyFollowedIds` (→ `user_follows`), one-time `localFollows`→DB upsert on login. Add `visibility` to game row type.
- [ ] **supabase.ts:** add `visibility` to `GameRow`; reconcile types from `gen types`.
- [ ] **gameFilters.ts:** `gameVisibleToViewer(game, currentUserId, followedIds)` — public→show; host→show; friends_only→`followedIds.has(host)` (client knows only own-direction follows; server enforces actual join via `is_eligible_to_join_game`); invite_only→host only. Document approximation.
- [ ] **App.tsx:** add `gameVisibleToViewer` step to `displayGames` (after `gameMatchesFilters`); wire `updateMyPresence` on visibility change + GPS heartbeat (immediate on mode change, 30s throttle); migrate follows to DB; do NOT gate filters/queries on `locationVisibility`.
- [ ] **TopUI.tsx:** rename presence "Live" → "Public".
- [ ] **MapboxMap.tsx:** surgical ghost banner ("You're hidden — filters still apply"); players from RPC (no client ghost filter); games filtered in `displayGames` before props.

## Phase 5 — Verify

- [ ] `gen types` post-migration: `visibility` on get_games_nearby, `location_visibility` on profile_locations.
- [ ] `db query`: ghost row absent from another caller's get_profiles_nearby; squad visible to follower only.
- [ ] `npx tsc --noEmit` clean; `/code-review` + `superpowers:requesting-code-review` on touched files.
- [ ] Manual (`npm run dev` + `window.__FUN_MAP__`): friends_only game hidden for non-follower; ghost banner; filters still apply while ghost.
