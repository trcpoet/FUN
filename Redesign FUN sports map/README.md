
  # Redesign FUN sports map

  This is a code bundle for Redesign FUN sports map. The original project is available at https://www.figma.com/design/9XldnDN5ao4uDuUcIwv8Ur/Redesign-FUN-sports-map.

  ## Running the code

  Run `npm i` to install the dependencies.

  Run `npm run dev` to start the development server.

  ## Deploying to Vercel

  - **Output directory:** The repo’s `vercel.json` sets `"outputDirectory": "dist"` (Vite’s default). If your project was set to use `build`, either rely on this file or set **Output Directory** to `dist` in Vercel → Project Settings → General.
  - **Mapbox token:** In Vercel → Project Settings → Environment Variables, add `VITE_MAPBOX_ACCESS_TOKEN` (and optionally `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). Without the Mapbox token, the map will show a message asking for it.
  - **Mapbox style:** The app uses the Studio style `mapbox://styles/trcpoet/cmn1l2br1003e01s52y4q9uzt` by default. Override with `VITE_MAPBOX_STYLE_URL` if needed. The same **public** access token (`pk.…`) must belong to an account that can load that style (your token already does for `trcpoet` styles).
  - **Athlete profile:** Run `supabase/migrations/20250320000000_athlete_profile_jsonb.sql` so `profiles.athlete_profile` exists. If SQL shows the column but the app still errors, run **`NOTIFY pgrst, 'reload schema';`** in the SQL Editor (PostgREST schema cache). Then call `clearAthleteProfileColumnCache()` or remove `fun_profiles_athlete_column` from localStorage.
  - **Profile uploads:** Post/reel uploads use the public `avatars` bucket under `feed/posts/{user_id}/` and `feed/reels/{user_id}/` (same bucket as avatars and story media). If uploads return **400**, run `../supabase/migrations/20250322000000_storage_avatars_bucket.sql` in **Supabase → SQL Editor** (creates the bucket and RLS for `{user_id}/`, `stories/…`, and `feed/…` paths).

  ## Create game: `POST …/rpc/create_game` 404

  PostgREST returns **404** when the `create_game` function is missing, has the **wrong argument list** (the app expects `p_description`, `p_requirements`, etc.), or **anon/authenticated** cannot execute it.

  **Fastest fix (one paste):** In Supabase → **SQL Editor**, run the whole file **`../supabase/snippets/fix_create_game_rpc_404.sql`**. It drops old overloads, ensures `games` columns, recreates `create_game` + `get_games_nearby`, grants execute, and reloads the API schema.

  **Or run migrations in order:** `../supabase/migrations/20260321000000_games_requirements.sql` then `../supabase/migrations/20260322000000_create_game_grants.sql`. See `../supabase/SCHEMA_CHANGELOG.md` and `../supabase/MIGRATION_ORDER.md` if you are bootstrapping from scratch.

  ## No sports venues on the map?

  Venues come from **OpenStreetMap** (Overpass) or **`osm_sports_venues`** in Supabase — **not** from the `create_game` SQL. If pins disappeared after a DB change, check:

  1. **Location** — the map needs a center: **allow location** or **search a place** so `venuesCenter` is set. With no coords, the app does not fetch venues.
  2. **Zoom** — venue dots/footprints only show at **zoom ≥ ~8–9** (`VENUE_LAYER_MIN_ZOOM` / `VENUE_DOT_MIN_ZOOM` in `src/app/map/mapConfig.ts`). Zoom in.
  3. **Filters** — in **Filters**, if **Sports** is non-empty, OSM venues must match `sport=*` (or `leisure=sports_centre` without a sport tag is shown). Clear sports to see everything.
  4. **Supabase cache** — if `osm_sports_venues` has no rows **in your current map area**, the app falls back to Overpass. Import a bbox that covers where you’re looking, or rely on Overpass (check Network → `/api/overpass` for errors).
  5. **Session** — if you previously hit a missing `osm_sports_venues` table, remove `sessionStorage` key `fun.sportsVenues.skipOsmDb` so the client tries the table again.

  ## OSM sports venues (fast Supabase cache)

  The map loads venue points from **`public.osm_sports_venues`** when the bbox has rows; otherwise it falls back to **Overpass** (same as before).

  1. Apply migration **`../supabase/migrations/20260321000001_osm_sports_venues.sql`** in Supabase SQL Editor (then run **`NOTIFY pgrst, 'reload schema';`** if PostgREST still 404s). Until this table exists, the app falls back to Overpass and **stops repeating** failed REST calls after the first missing-table error. After you add the table, clear the client skip flag: remove `sessionStorage` key `fun.sportsVenues.skipOsmDb` or call `clearSportsVenuesDbSkip()` from `src/app/lib/sportsVenues.ts` in dev.
  2. In **Vercel** (or your host), set server env vars (never expose `SUPABASE_SERVICE_ROLE_KEY` to the browser):
     - `SUPABASE_URL` — project URL
     - `SUPABASE_SERVICE_ROLE_KEY` — service role key
     - `OSM_IMPORT_SECRET` — long random string (shared secret for the import API)
  3. **Import** OSM venues into the table for a geographic **rectangle** (`minLat`, `minLng`, `maxLat`, `maxLng`). Pick numbers that cover your city or region (e.g. from [bboxfinder](http://bboxfinder.com) or approximate from the map).

     **A — Script (easiest)** — from the `Redesign FUN sports map` folder, with the same secret you set in Vercel:

     ```bash
     cd "Redesign FUN sports map"
     export OSM_IMPORT_SECRET="paste-the-same-secret-as-vercel"
     export IMPORT_URL="https://YOUR-PROJECT.vercel.app/api/osm-venues-import"
     node scripts/import-osm-venues.mjs 40.7 -74.05 40.78 -73.92
     ```

     You should see `200` and JSON like `{"ok":true,"upserted":…}`. `IMPORT_URL` must be a **deployed** URL (`vite` dev does not run Vercel `api/` routes unless you use `vercel dev`).

     **B — `curl`** (same thing as the script):

     ```bash
     curl -sS -X POST "https://YOUR-PROJECT.vercel.app/api/osm-venues-import" \
       -H "Content-Type: application/json" \
       -H "Authorization: Bearer YOUR_OSM_IMPORT_SECRET" \
       -d '{"minLat":40.7,"minLng":-74.05,"maxLat":40.78,"maxLng":-73.92}'
     ```

     Repeat for other regions as needed, or schedule a cron job that POSTs different bboxes.

  **Performance notes:** Venue search location is **debounced** (~420ms). With sports filters selected, **Overpass** queries add a tighter `sport~` regex on `leisure=pitch` (sports centres are still unfiltered). Venue **clustering** runs in a **Web Worker** when supported. When loading from Overpass with a **large** search radius, the app requests a **small ring first** (nearby venues), then the **full** radius so the map can update sooner.
  