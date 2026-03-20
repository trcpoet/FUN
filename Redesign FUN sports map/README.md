
  # Redesign FUN sports map

  This is a code bundle for Redesign FUN sports map. The original project is available at https://www.figma.com/design/9XldnDN5ao4uDuUcIwv8Ur/Redesign-FUN-sports-map.

  ## Running the code

  Run `npm i` to install the dependencies.

  Run `npm run dev` to start the development server.

  ## Deploying to Vercel

  - **Output directory:** The repo’s `vercel.json` sets `"outputDirectory": "dist"` (Vite’s default). If your project was set to use `build`, either rely on this file or set **Output Directory** to `dist` in Vercel → Project Settings → General.
  - **Mapbox token:** In Vercel → Project Settings → Environment Variables, add `VITE_MAPBOX_ACCESS_TOKEN` (and optionally `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). Without the Mapbox token, the map will show a message asking for it.
  - **Athlete profile:** Run `supabase/migrations/20250320000000_athlete_profile_jsonb.sql` so `profiles.athlete_profile` exists. If SQL shows the column but the app still errors, run **`NOTIFY pgrst, 'reload schema';`** in the SQL Editor (PostgREST schema cache). Then call `clearAthleteProfileColumnCache()` or remove `fun_profiles_athlete_column` from localStorage.
  - **Profile uploads:** Post/reel uploads use the public `avatars` bucket under `feed/posts/{user_id}/` and `feed/reels/{user_id}/` (same bucket as avatars and story media). If uploads return **400**, run `../supabase/migrations/20250322000000_storage_avatars_bucket.sql` in **Supabase → SQL Editor** (creates the bucket and RLS for `{user_id}/`, `stories/…`, and `feed/…` paths).
  