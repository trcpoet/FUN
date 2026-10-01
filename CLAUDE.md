# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Start Commands

All commands run from the `Redesign FUN sports map/` directory, and every path in this file
is relative to it unless it says otherwise (this file and `.github/` sit at the repo root):

```bash
# Local development
npm install
npm run dev         # Start Vite dev server on http://localhost:5173

# Production build
npm run build       # Outputs to dist/

# Before merging to main — the same four checks CI runs
npm run typecheck && npm test && npm run check:vercel && npm run build

# Database utilities
npm run import-osm  # Imports OpenStreetMap venue data into Supabase
```

## Environment Setup

Create `.env` in `Redesign FUN sports map/` with:

```
VITE_MAPBOX_ACCESS_TOKEN=<mapbox token>
VITE_SUPABASE_URL=<supabase url>
VITE_SUPABASE_ANON_KEY=<supabase anon key>
VITE_SENTRY_DSN=<optional; crash reporting via src/lib/errorReporting.ts, off when unset>
VITE_MAPBOX_STYLE_URL=<optional; overrides the basemap style>
VITE_PUBLIC_ORIGIN=<optional, build-time; absolute origin for share cards and the sitemap — falls back to Vercel's own URL, then root-relative>
```

Server-only (for `/api/` routes on Vercel):
- `SUPABASE_URL` — every route that talks to Supabase (most fall back to `VITE_SUPABASE_URL`;
  `osm-venues-import` does not)
- `SUPABASE_SERVICE_ROLE_KEY` — `osm-venues-import`, `warm-venues`, `venue-enrich`, `venue-photo`
- `SUPABASE_ANON_KEY` — `invite-preview` (falls back to `VITE_SUPABASE_ANON_KEY`)
- `OSM_IMPORT_SECRET` — shared secret for `osm-venues-import`
- `GOOGLE_PLACES_API_KEY` — `venue-enrich`, `venue-photo`
- `WORLD_NEWS_API_KEY` — `local-news`
- `MAPBOX_ACCESS_TOKEN` — `directions` (falls back to `VITE_MAPBOX_ACCESS_TOKEN`)

## Database Setup & Schema

Database migrations live in `supabase/migrations/`. Apply them one file at a time, in the order
`supabase/MIGRATION_ORDER.md` gives — never with `supabase db push`, which applies every pending
file at once, including any a teammate added since you last looked:

```bash
supabase db query --linked -f supabase/migrations/<file>.sql
supabase migration repair --linked --status applied <version>   # db query does not record it
```

Pass the file with `-f`: inlining it fails, because every migration opens with a `--` comment
that the CLI parses as a flag. Then confirm the objects exist (`pg_proc`, `pg_policy`,
`information_schema.columns`) and refresh the PostgREST cache:

```sql
NOTIFY pgrst, 'reload schema';
```

Core schema: `supabase/schema.sql` — a generated snapshot of production (tables, RLS, RPCs,
functions, grants). Regenerate it after applying anything:
`node scripts/dump-schema.mjs > supabase/schema.sql`.

## Architecture Overview

### Repo Layout

```
├── .github/workflows/typecheck.yml — CI: typecheck, tests, check:vercel, build
├── Redesign FUN sports map/    — Main web app (React + Vite)
│   ├── src/
│   │   ├── lib/
│   │   │   ├── api.ts           ← CENTRALIZED API LAYER (all Supabase calls)
│   │   │   ├── supabase.ts      ← Client init + DB type definitions
│   │   │   ├── guestRpc.ts      ← Member vs guest read RPCs, chosen by session
│   │   │   └── [other utils]
│   │   ├── app/
│   │   │   ├── App.tsx          ← Root map shell (~1,450 lines)
│   │   │   ├── components/      ← UI components
│   │   │   ├── pages/           ← Route-level pages
│   │   │   ├── contexts/        ← React context (AuthContext)
│   │   │   ├── lib/             ← Map, venue and game logic (pure, unit-tested)
│   │   │   └── map/             ← Map config + utilities
│   │   ├── hooks/               ← Custom React hooks
│   │   ├── styles/              ← Global CSS
│   │   └── main.tsx             ← App entry + BrowserRouter
│   ├── api/                     ← Vercel serverless routes: overpass, osm-venues-import,
│   │                              warm-venues, auto-cache-venues, venue-enrich, venue-photo,
│   │                              invite-preview, directions, geo, local-news
│   ├── server/lib/              ← Logic the routes share (unit-tested)
│   ├── scripts/                 ← dump-schema, check-vercel-json, import-osm-venues, OG card
│   ├── supabase/                ← Database layer
│   │   ├── schema.sql           ← Generated snapshot of production
│   │   ├── migrations/          ← 60+ incremental SQL files
│   │   ├── MIGRATION_ORDER.md
│   │   └── SCHEMA_CHANGELOG.md
│   └── vercel.json              ← Rewrites; Vercel validates it strictly
└── docs/                        — Supporting documentation
```

### Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | React 19 + TypeScript + Vite, with the React Compiler |
| **Routing** | React Router 7 |
| **Styling** | Tailwind CSS 4 + Motion |
| **Maps** | Mapbox GL JS + Three.js (3D avatars) |
| **Backend** | Supabase (Postgres + PostgREST + Realtime) |
| **Forms** | React Hook Form |
| **Charts** | Recharts |
| **Errors** | Sentry (`@sentry/react`), loaded lazily, off when `VITE_SENTRY_DSN` is unset |
| **Deploy** | Vercel (SPA + serverless `/api/` routes) |

### Data Flow at Scale

1. **Map Load**: User location → `useGeolocation` hook → parallel Supabase RPCs (`get_games_nearby`, `get_profiles_nearby`; a guest gets `get_guest_games_nearby` instead, chosen in `guestRpc.ts`, and no profiles)
2. **Game Pins**: Sport glyphs rasterized on demand (`registerGameSportImages.ts`), clustered at low zoom, individual at high zoom
3. **Venue Loading**: Read from the database only (`get_venues_in_bbox`, nearest first). A cache miss fires a non-blocking `/api/warm-venues` request that imports from Overpass server-side, and the map picks the rows up on its next read. Mapbox clusters the pins natively.
4. **Chat Inboxes**: Prefetched on idle after sign-in so the messenger opens instantly
5. **Messaging**: Game chat → Supabase Realtime on `game_messages` table; DMs use `dm_threads`/`dm_messages`

## Dev Conventions (Critical)

### Guests browse; members act
A signed-out visitor sees **what** is happening, **where**, **when** and **how many** are in —
never **who**. The map, venue cards, public Co-ed games and public notes are all open; anything
that writes, names a person, or opens a member surface (feed, messenger, profiles) asks for an
account at the moment it is tapped, and returns the person to what they tapped.

- Enforced in SQL, not in JSX: guests may execute only the `get_guest_*` functions, which project
  no `created_by`/`user_id`. Every identity-bearing table is `to authenticated`.
  See `supabase/migrations/20260922130000_*` and `..._20260922140000_*`.
- Client reads pick their function by session in one place — `src/lib/guestRpc.ts`. A component
  that needs to know asks `currentUserId == null`, never the network.
- Gating copy and the "back where I was" links live in `src/lib/guestAccess.ts`; the sheet is
  `SignInGate`, the page-level equivalent is `RequireMember`.
- Auth lives in exactly one place: the Profile tab. `/login` and `/signup` are aliases that
  redirect there. There are no auth controls on the map.

### Centralized API Rule
**Never call `supabase` directly from components.** All data operations go through `src/lib/api.ts`. This:
- Keeps permissions logic in one place
- Makes caching/prefetching possible
- Simplifies testing and refactoring

See `src/lib/api.ts` for the full list of functions (auth, games, profiles, stats, messaging, etc.)

### TypeScript & Typing
- Maintain type definitions in `src/lib/supabase.ts` to match the Postgres schema
- Always trim environment variables when reading them (trailing spaces cause JWT 401 errors):
  ```typescript
  const token = (process.env.VITE_MAPBOX_ACCESS_TOKEN || '').trim();
  ```

### Database & RLS
- **RLS (Row Level Security)** is enforced on all sensitive tables
- Before adding a table, define RLS policies in a migration
- When queries fail mysteriously, check RLS policies first
- Use RPCs for complex joins and "inbox-style" views (fewer round-trips, stable shapes)

### "Fast-First" Philosophy
FUN treats performance as a feature. Key patterns:

- **RPC over Table Queries**: Complex aggregations/joins use Postgres functions, not direct SELECT
- **Nearest First**: Venue reads are ordered by distance, so PostgREST's 1,000-row cap keeps the closest venues rather than an arbitrary sample
- **No Blocking on OSM**: The map never waits for Overpass; missing areas are imported in the background (`/api/warm-venues`)
- **Let the Map Go Idle**: Nothing writes map style every frame. Animations run on a budget (`src/app/map/animationBudget.ts`) and stop when they settle, so an untouched map draws nothing
- **Prefetching**: Chat inboxes prefetch on idle after sign-in
- **Pause Venue Fetches When Chatting**: If the messenger is open, pause venue fetch kickoffs to prioritize chat bandwidth

`venueCluster.worker.ts` is unreferenced: venue clustering is Mapbox's own, and moving the park
scan into a worker was measured and rejected (see `b7deb29`).

### Config Tuning
All map UX constants (zoom thresholds, icon sizes, pulse timings) live in `src/app/map/mapConfig.ts`. Tweak there, not hardcoded in components.

### Client Cache Fallbacks
The app uses localStorage flags like `fun_profiles_athlete_column` to gracefully handle missing or newly added columns. Check `App.tsx` and relevant pages for pattern.

## Key Files to Know

| File | Role |
|---|---|
| `src/main.tsx` | App entry: mounts React, sets up BrowserRouter, wraps with AuthProvider, starts error reporting |
| `src/app/App.tsx` | Map shell: all game/player rendering, state, interaction handlers |
| `src/lib/api.ts` | **Central API layer** — auth, games, profiles, stats, chat, venues |
| `src/lib/supabase.ts` | Supabase client init + all DB row type definitions |
| `src/app/components/MapboxMap.tsx` | Mapbox canvas: renders game pins, player avatars, venues |
| `src/app/map/mapConfig.ts` | Tunable map UX constants |
| `src/app/lib/sportsVenues.ts` | Venue reads: database only; a cache miss asks `/api/warm-venues` to import in the background |
| `src/lib/guestRpc.ts` | Picks the member or guest read RPC by session, in one place |
| `supabase/schema.sql` | Generated snapshot of production: tables, RLS policies, RPCs, grants |
| `vercel.json` | Rewrites (`/g/:token` → `/api/invite-preview`, then the SPA catch-all) |

## Testing & Debugging

Vitest covers the pure logic (`npm test`, 50+ files under `src/` and `server/`), and
`npm run typecheck` covers both tsconfigs. CI (`.github/workflows/typecheck.yml`, on Node from
`.nvmrc`) runs those plus `npm run check:vercel` and the production build on every PR and every
push to main. A push to main deploys at the moment CI starts, so CI reports a bad deploy rather
than preventing one — run the same four locally before merging. There are no component or
end-to-end tests, so the rest is manual:
- Run `npm run dev` locally
- Use browser DevTools to inspect network requests to Supabase
- Check Supabase Studio for schema, data, and Realtime activity
- Verify RLS policies are correct (common source of silent failures)

## Deployment (Vercel)

- Production: `https://fun-trcpoet.vercel.app`; every push to main deploys
- `build` command: `npm run build` → outputs `dist/`
- `vercel.json` rewrites `/g/:token` to `/api/invite-preview` (share-link unfurls; it must stay
  above the catch-all) and every other non-`/api/`, non-asset path to `index.html`
- Vercel validates `vercel.json` strictly: an unknown key, even a `"//"` comment, fails the
  deploy and leaves the previous one serving. `npm run check:vercel` catches it first
- `/api/` routes auto-deploy as serverless functions
- **Required env vars**: `VITE_MAPBOX_ACCESS_TOKEN`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- **Serverless env vars**: see Environment Setup above

## Existing Documentation

For deeper context, refer to:
- `README.md` — problem statement, tech stack, performance decisions
- `GEMINI.md` — development conventions and database patterns
- `AGENTS.md` — AI agent coding instructions (if using ECC)
- `Redesign FUN sports map/README.md` — deployment runbook, OSM venue setup
- `supabase/MIGRATION_ORDER.md` — definitive guide for migrations
