# Using the schema from frontend and backend

This doc describes how the new schema (gamification, avatars, notifications) is exposed as **functions** in the frontend and backend, and how you can build on it.

---

## Frontend: API layer and hooks

### Central API (`src/lib/api.ts`)

All Supabase calls for games, profiles, stats, and notifications go through typed functions:

| Function | Purpose |
|----------|--------|
| `getGamesNearby(lat, lng, radiusKm?)` | Fetch games near a point (wraps RPC `get_games_nearby`). |
| `createGame({ title, sport, lat, lng, spotsNeeded? })` | Create a game (host is auto-inserted as participant with role `host`). |
| `joinGame(gameId)` | Current user joins a game (inserts `game_participants` with role `player`). |
| `completeGame({ gameId, winnerTeamOrUser?, score? })` | Host marks game completed → updates stats, streaks, badges, notifications. |
| `getProfilesNearby(lat, lng, radiusKm?, limit?)` | Nearby profiles (includes `avatar_id` for 3D map). |
| `getMyProfile()` | Current user’s `avatar_id` and `display_name`. |
| `updateMyAvatarId(avatarId)` | Set Ready Player Me (or other) avatar ID. |
| `getMyStats()` | Current user’s `user_stats` (XP, level, streaks, games played). |
| `getMyBadges()` | Badges earned by current user. |
| `getMyNotifications(limit?)` | List of notifications. |
| `markNotificationRead(id)` | Mark one notification as read. |
| `subscribeToNotifications(onNotification)` | Realtime: callback when a new notification is inserted. |
| `avatarIdToGlbUrl(avatarId, quality?)` | Build GLB URL from `avatar_id` (e.g. for Mapbox 3D layer). |

Use these from components instead of calling `supabase.from(...)` or `supabase.rpc(...)` directly so types and behavior stay consistent.

### Hooks

| Hook | What it does |
|------|----------------|
| `useMyProfile()` | Loads and exposes `avatarId`, `displayName`; provides `setAvatar(avatarId)` and `refetch`. |
| `useUserStats()` | Loads `user_stats` for current user → `stats` (XP, level, streaks, etc.) and `refetch`. |
| `useNotifications({ limit? })` | Loads notifications, subscribes to Realtime, exposes `notifications`, `markRead(id)`, `refetch`. |

Existing hooks `useGamesNearby` and `useProfilesNearby` still call the same RPCs (and now get `status` and `avatar_id` in the response).

### What’s wired in the UI

- **Map:** `avatarGlbUrl` comes from `useMyProfile().avatarId` → `avatarIdToGlbUrl(avatarId)` and is passed to `MapboxMap` for the 3D user avatar.
- **Game popup:** If the current user is the **host** of the selected game, a **“Complete game”** button is shown; clicking it calls `completeGame({ gameId })`, which runs the backend `complete_game` RPC.
- **Toasts:** New notifications (e.g. “Badge earned”, “Game completed”) are shown as a short-lived toast at the top; the app subscribes to `notifications` via Realtime and shows the latest unread.

---

## Backend: Postgres and Realtime

### RPCs you must have (migrations)

1. **Base schema** (`schema.sql`): `create_game`, `get_games_nearby`, `get_profiles_nearby`, `update_my_location`, plus tables and RLS.
2. **First migration** (`20250315000000_gamification_avatars_notifications.sql`): Adds `profiles.avatar_id`, `games.status`, `game_participants.role` / `confirmed_result`, tables `user_stats`, `badges`, `user_badges`, `notifications`, `game_results`; updates `get_profiles_nearby` (returns `avatar_id`), `create_game` (inserts host, sets status), `get_games_nearby` (returns `status`).
3. **Second migration** (`20250315100000_complete_game_function.sql`): Defines `complete_game(p_game_id, p_winner_team_or_user?, p_score?)` which:
   - Ensures caller is the game host,
   - Inserts/updates `game_results`, sets `games.status` to `completed`,
   - For each participant: upserts `user_stats` (games played, streak, XP, level), awards badges (first_game, ten_games, streak_7), inserts `notifications` (badge_earned, game_completed).

### Realtime for notifications

For live toasts, the frontend subscribes to **inserts** on `notifications` filtered by `user_id`. In Supabase:

- **Database → Replication:** ensure the `notifications` table has **Realtime** enabled (published for `INSERT`).

---

## What you can do next (ideas)

1. **Avatar customization**  
   Add a settings/profile screen: open Ready Player Me (or your flow), on export get `avatarId`, call `updateMyAvatarId(avatarId)`. The map already uses `avatarIdToGlbUrl(avatarId)` for the 3D marker.

2. **Show stats in the UI**  
   Use `useUserStats()` and display level, XP, current streak, and “games played” in the top bar or a profile drawer.

3. **Badges list**  
   Use `getMyBadges()` (or a small hook) and show earned badges with names/descriptions from the `badges` table.

4. **Filter games by status**  
   `get_games_nearby` now returns `status`. In the carousel or map, hide or style games with `status === 'completed'` or `'cancelled'`.

5. **“Spots filled” and game status**  
   Compare `game_participants` count to `games.spots_needed` and set `games.status` to `'full'` when full (e.g. in a trigger or in `joinGame` flow). Frontend can show “2/6 spots” and disable join when full.

6. **Weather nudge**  
   Add an Edge Function that calls a weather API for the game’s location and returns a short message; call it from the game detail or map and show “Sun in 2h — good time to play” or “Rain in 1h”.

7. **Leaderboard**  
   Query `user_stats` ordered by `xp` or `games_played_total` (with RLS or a secure function) and show a simple “Top players” list.

8. **Sound / haptics**  
   On `joinGame` success or when a notification arrives, play a short sound (e.g. Howler.js) or trigger `navigator.vibrate(1)` on mobile.

These all use the same schema and API layer above; you can implement them step by step.
