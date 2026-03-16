# Supabase setup (beginner-friendly)

1. **Create a project** at [supabase.com](https://supabase.com) → New project.

2. **Run the schema**
   - In the dashboard: **SQL Editor** → **New query**
   - Paste the contents of `schema.sql`
   - Click **Run**
   - Then run the migration: open **New query**, paste the contents of `migrations/20250315000000_gamification_avatars_notifications.sql`, click **Run**

3. **Get your keys**
   - **Settings** → **API**: copy **Project URL** and **anon public** key.
   - In your web app, create `.env` (see project root `.env.example`) and set:
     - `VITE_SUPABASE_URL=<Project URL>`
     - `VITE_SUPABASE_ANON_KEY=<anon public key>`

4. **Optional: allow creating games without a sign-up form**
   - **Authentication** → **Providers** → enable **Anonymous**
   - The app can then call `signInAnonymously()` so visitors get a session and can create/join games. You can add email sign-in later.

5. **PostGIS**
   - The schema enables the `postgis` extension. If your project is new, it’s already available; if you see an error, check that PostGIS is enabled in **Database** → **Extensions**.

Done. The app uses `get_games_nearby(lat, lng, radius_km)` to load games on the map and inserts into `games` when you create a game.
