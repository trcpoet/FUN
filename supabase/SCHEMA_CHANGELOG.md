# Schema changelog

## 2025-03-15 – Gamification, 3D avatars, notifications

**File:** `migrations/20250315000000_gamification_avatars_notifications.sql`  
**Run after:** `schema.sql`

### What was added

| Change | Purpose |
|--------|--------|
| **profiles.avatar_id** | Ready Player Me (or other) 3D avatar ID for map markers; frontend uses `https://models.readyplayer.me/{avatar_id}.glb?quality=medium` |
| **games.status** | `open` \| `full` \| `completed` \| `cancelled` for lifecycle and filtering |
| **game_participants.role** | `host` \| `player`; creator is inserted as host by `create_game()` |
| **game_participants.confirmed_result** | Whether this participant confirmed the game result |
| **user_stats** | One row per user: `games_played_total`, `games_played_by_sport`, `current_streak_days`, `longest_streak_days`, `xp`, `level`, `last_game_date` |
| **badges** | Definition table (slug, name, description, criteria); seeded with first_game, ten_games, streak_7, early_bird, rain_or_shine |
| **user_badges** | Which user has which badge (user_id, badge_id) |
| **notifications** | In-app toasts: user_id, type, payload, is_read |
| **game_results** | One row per completed game: game_id, winner_team_or_user, score, confirmed_by_host |

### Functions updated

- **get_profiles_nearby** – now returns `avatar_id` in the result set (for 3D avatar layer).
- **create_game** – sets `status = 'open'` and inserts the creator into `game_participants` with `role = 'host'`.
- **get_games_nearby** – now returns `status` so the app can filter or style by open/full/completed.

### RLS

- **user_stats**: select only for owner (stats updated by backend/Edge Function with service role).
- **badges**, **user_badges**: select for everyone.
- **notifications**: select and update only for owner.
- **game_results**: select for everyone.

### Next step (recommended)

Implement an **Edge Function** (or Postgres function called via service role) that runs when a game is marked completed:

1. Insert into **game_results**.
2. Update **games.status** to `completed`.
3. For each participant, update **user_stats** (games_played_total, streak, xp, level) and check **badges** criteria → insert into **user_badges** and **notifications**.

Then wire the frontend: call that function when the host confirms the result, and subscribe to **notifications** (Supabase Realtime) for toasts.
