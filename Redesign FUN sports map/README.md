
  # Redesign FUN sports map

  This is a code bundle for Redesign FUN sports map. The original project is available at https://www.figma.com/design/9XldnDN5ao4uDuUcIwv8Ur/Redesign-FUN-sports-map.

  ## Running the code

  Run `npm i` to install the dependencies.

  Run `npm run dev` to start the development server.

  ## Deploying to Vercel

  - **Output directory:** The repo’s `vercel.json` sets `"outputDirectory": "dist"` (Vite’s default). If your project was set to use `build`, either rely on this file or set **Output Directory** to `dist` in Vercel → Project Settings → General.
  - **Mapbox token:** In Vercel → Project Settings → Environment Variables, add `VITE_MAPBOX_ACCESS_TOKEN` (and optionally `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). Without the Mapbox token, the map will show a message asking for it.
  - **Athlete profile:** Run the SQL migration `supabase/migrations/20250320000000_athlete_profile_jsonb.sql` on your Supabase project so `profiles.athlete_profile` exists (the profile editor persists there).
  