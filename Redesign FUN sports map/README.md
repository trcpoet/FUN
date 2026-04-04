# FUN — The Web App

This is the frontend for FUN. It's a React + Mapbox app that shows you games, players, and venues near you in real time. 

If you're wondering what FUN actually is, check the [main README](../README.md) for the whole story.

## Getting Started

You need:
- Node 16+
- Supabase project set up
- Mapbox API token

Run this:
```bash
npm install
npm run dev
```

App fires up at http://localhost:5173. Changes auto-reload.

## What's where

```
src/
├── main.tsx                 # Entry point
├── app/
│   ├── App.tsx              # Map + state management lives here
│   ├── components/          # UI bits
│   ├── pages/               # Route pages (profiles, settings, etc.)
│   ├── contexts/            # Auth, user state
│   ├── map/
│   │   ├── MapboxMap.tsx    # The actual Mapbox renderer
│   │   └── mapConfig.ts     # Zoom thresholds, icon sizes, etc.
│   └── lib/
│       └── sportsVenues.ts  # Fetches venues from Supabase or Overpass
├── lib/
│   ├── api.ts               # ALL Supabase calls go through here
│   ├── supabase.ts          # Client init + types
│   └── [utils]
├── hooks/                   # Custom React hooks
└── styles/                  # CSS + Tailwind

api/
├── overpass.ts              # Proxy to OpenStreetMap Overpass API
└── osm-venues-import.ts     # Server function: imports venues into Supabase
```

## How it works

**When you open the app:**
1. Gets your location
2. Fetches games, players, venues all at once
3. Game pins render (emoji + countdown/live status)
4. Player avatars show up when you're zoomed in
5. Venue dots so you can pick a place fast

**Chat & messaging:**
- Game chat uses Supabase Realtime (updates live)
- DMs cache on login so the inbox opens instantly

**Venues:**
- First checks our Supabase cache (`osm_sports_venues`) for speed
- Falls back to Overpass API if cache is empty
- Loads "nearby" venues first so map updates quick on slow networks
- Clusters venues in a Web Worker to not freeze the UI

## .env setup

Create `.env` in this directory:

```
VITE_MAPBOX_ACCESS_TOKEN=pk_...
VITE_SUPABASE_URL=https://....supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...
```

Optional:
```
VITE_MAPBOX_STYLE_URL=mapbox://styles/...
```

## Important rules

**1. Use `src/lib/api.ts` for everything**
Don't call Supabase directly from components. All data fetching goes through `api.ts`. Keeps permissions in one place, makes caching possible, easier to test.

**2. Keep types in sync**
Edit `src/lib/supabase.ts` when the database schema changes.

**3. Check RLS policies**
When queries mysteriously fail, 99% of the time it's Row-Level Security on the database side.

## Deploying to Vercel

### Build & run
```bash
npm run build     # outputs to dist/
```

Vercel will auto-detect this. Output directory is `dist/`.

### Environment variables
Add these in Vercel → Project Settings → Environment Variables:

**Client (required):**
- `VITE_MAPBOX_ACCESS_TOKEN` — your Mapbox public token
- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — Supabase public key

**Optional:**
- `VITE_MAPBOX_STYLE_URL` — custom map style (defaults to our studio style)

**Server-only (for `/api/` routes):**
- `SUPABASE_SERVICE_ROLE_KEY` — admin key for the importer (never expose to browser)
- `OSM_IMPORT_SECRET` — random secret shared between import script and API

### Database migrations
Before deploying, make sure Supabase has all migrations applied. See `../supabase/MIGRATION_ORDER.md` for the checklist.

After running migrations, reload the schema cache in Supabase SQL Editor:
```sql
NOTIFY pgrst, 'reload schema';
```

## Stuck? Here's what usually happens

### "Create game returns 404"
The RPC function is missing or PostgREST hasn't reloaded. Try:
```sql
NOTIFY pgrst, 'reload schema';
```

If that doesn't work, run the migrations:
- `../supabase/migrations/20260321000000_games_requirements.sql`
- `../supabase/migrations/20260322000000_create_game_grants.sql`

Or just paste the whole `../supabase/snippets/fix_create_game_rpc_404.sql` file in Supabase SQL Editor.

### "No venues showing up"
Check these in order:
1. **Location set?** Allow location or search a place. Map needs coordinates.
2. **Zoom level?** Venues show at zoom 8+. Zoom in. (Config: `VENUE_LAYER_MIN_ZOOM` in `mapConfig.ts`)
3. **Sports filter?** If you filtered sports, venues must have matching `sport=` tags. Clear the filter.
4. **Supabase cache empty?** If your area has no rows in `osm_sports_venues`, we fall back to Overpass. See "Import venues" below.
5. **Stale session flag?** Remove the sessionStorage key `fun.sportsVenues.skipOsmDb` to retry.

### "Athlete profile column missing"
Run this in Supabase SQL Editor:
```sql
-- From ../supabase/migrations/20250320000000_athlete_profile_jsonb.sql
-- (just paste the whole file)

NOTIFY pgrst, 'reload schema';
```

If the column exists but the app errors anyway, clear the client cache:
```javascript
// Dev console
localStorage.removeItem('fun_profiles_athlete_column');
```

### "Profile uploads return 400"
Run this in Supabase SQL Editor:
```sql
-- From ../supabase/migrations/20250322000000_storage_avatars_bucket.sql
-- (paste the whole file)

NOTIFY pgrst, 'reload schema';
```

## Speed: import venues into Supabase

By default, venues come from Overpass on-demand. If you want it faster, cache them in Supabase.

**Step 1: Create the table**
In Supabase SQL Editor, run:
```
../supabase/migrations/20260321000001_osm_sports_venues.sql
```

Then:
```sql
NOTIFY pgrst, 'reload schema';
```

**Step 2: Set up environment vars in Vercel**
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OSM_IMPORT_SECRET` — any long random string

**Step 3: Import a region**
Find a bounding box for your city on [bboxfinder.com](http://bboxfinder.com), then run:

```bash
cd "Redesign FUN sports map"
export OSM_IMPORT_SECRET="whatever-you-set-in-vercel"
export IMPORT_URL="https://YOUR-PROJECT.vercel.app/api/osm-venues-import"
node scripts/import-osm-venues.mjs 40.7 -74.05 40.78 -73.92
```

Should see `200 {"ok":true,"upserted":…}`.

Or use curl:
```bash
curl -sS -X POST "https://YOUR-PROJECT.vercel.app/api/osm-venues-import" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_OSM_IMPORT_SECRET" \
  -d '{"minLat":40.7,"minLng":-74.05,"maxLat":40.78,"maxLng":-73.92}'
```

**Note:** The import URL has to be deployed on Vercel. `npm run dev` doesn't run `/api/` routes (use `vercel dev` if testing locally).

## Performance stuff you should know

- Venue searches are **debounced** (~420ms) so panning the map doesn't spam the API
- **Overpass queries** with sports filters get tighter regex, but sports centres without explicit tags still show
- **Venue clustering** runs in a Web Worker so it doesn't freeze the UI
- **Large radius** Overpass queries load "near ring" first (nearby venues), then expand — map updates sooner
