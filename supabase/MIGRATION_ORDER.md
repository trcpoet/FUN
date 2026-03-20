# Supabase SQL: what to run and in what order

## Why you see a 400 on `profiles`

The app sometimes selects `athlete_profile` on `public.profiles`. If that column does not exist, **PostgREST returns HTTP 400** (“column does not exist”). The frontend caches that state in `localStorage` under `fun_profiles_athlete_column` so later loads skip the bad select.

**To fix permanently:** add the column by running the migration below, then **clear that cache** (DevTools → Application → Local Storage → remove `fun_profiles_athlete_column`, or call `clearAthleteProfileColumnCache()` from `src/lib/api.ts`).

**Verify the column:**

```sql
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles' and column_name = 'athlete_profile';
```

You should see one row (`athlete_profile`, `jsonb`).

---

## Option A — Existing project (SQL Editor, one script at a time)

Run each file **once**, in this order, in **Supabase → SQL Editor → New query → Run**. All migration SQL here is written to be **idempotent** where possible (safe to re-run many files).

| # | File |
|---|------|
| 1 | `schema.sql` — only if you never applied the base tables/RLS; if your project already has `profiles`, `games`, etc., **skip** or you risk conflicting with live objects |
| 2 | `migrations/20250315000000_gamification_avatars_notifications.sql` |
| 3 | `migrations/20250315100000_complete_game_function.sql` |
| 4 | `migrations/20250315200000_create_game_starts_at.sql` |
| 5 | `migrations/20250316000000_auth_profiles_onboarding.sql` |
| 6 | `migrations/20250317000000_game_location_label.sql` |
| 7 | `migrations/20250320000000_athlete_profile_jsonb.sql` ← **fixes missing `athlete_profile` / profile 400** |
| 8 | `migrations/20250320000001_games_description.sql` |
| 9 | `migrations/20250321000000_game_chat_roster.sql` |
| 10 | `migrations/20250322000000_storage_avatars_bucket.sql` ← **fixes Storage 400 on avatar / story / feed uploads** |
| 11 | `migrations/20250323000000_search_profiles_trgm.sql` ← **people search: `display_name_search` / `handle_search` + `search_profiles` RPC** |
| 12 | `migrations/20250324000000_game_participants_delete_rls.sql` ← **Unjoin: `DELETE` on own `game_participants` row** |
| 13 | `migrations/20250325000000_games_host_delete_rls.sql` ← **Delete hosted game: `DELETE` on `games` where `created_by = auth.uid()`** |
| 14 | `migrations/20260321000000_games_requirements.sql` ← **`games.requirements` jsonb + `create_game` / `get_games_nearby` include `p_requirements`** |

If you are unsure what is already applied, run steps 7–9 first for the current app features (athlete profile JSON, game description, chat/roster RPCs). Steps 2–6 are required if your database predates gamification (no `avatar_id`, `games.status`, `complete_game`, etc.).

**Profile photo & uploads:** run step 10 if `POST .../storage/v1/object/avatars/...` returns **400** (missing bucket or RLS).

---

## Option B — Brand-new database

1. Run the full `schema.sql` once (creates core tables and RLS).
2. Run **all** files in `migrations/` in the table order above (2 through 9).

`schema.sql` alone is **not** enough for the current app; the migrations add columns and replace `create_game` / `get_games_nearby` / `get_profiles_nearby` to match the client.

---

## Supabase CLI (`supabase db push`)

Migrations are applied in **filename sort order**. The repo uses unique timestamps so each file applies once. After pushing, still **clear** `fun_profiles_athlete_column` in the browser if the app had cached “absent” before the column existed.

---

## Troubleshooting

| Symptom | Likely cause |
|--------|----------------|
| 400 on `profiles` with `athlete_profile` | Run `20250320000000_athlete_profile_jsonb.sql`, then **`NOTIFY pgrst, 'reload schema';`** in SQL Editor (PostgREST cache), then clear `fun_profiles_athlete_column` |
| `get_games_nearby` / `create_game` errors about `description` or `location_label` | Run `20250317000000_game_location_label.sql` and `20250320000001_games_description.sql` before `20250321000000_game_chat_roster.sql` |
| Inbox 404 / `get_my_game_inbox` not in schema cache | Run `migrations/20250321000000_game_chat_roster.sql` (or `scripts/get_my_game_inbox_rpc.sql` if tables already exist), then `NOTIFY pgrst, 'reload schema';`. The app falls back to table queries if the RPC is missing. |
| `onboarding_completed` or `avatar_id` missing | Run gamification + auth migrations (rows 2 and 5) |
| **400** on `storage/v1/object/avatars/...` (upload) | Create public **avatars** bucket and policies: run `20250322000000_storage_avatars_bucket.sql` |
