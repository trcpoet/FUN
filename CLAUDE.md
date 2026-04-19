# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Start Commands

All commands run from `Redesign FUN sports map/` directory:

```bash
# Local development
npm install
npm run dev         # Start Vite dev server on http://localhost:5173

# Production build
npm run build       # Outputs to dist/

# Database utilities
npm run import-
 # Imports OpenStreetMap venue data into Supabase
```

## Environment Setup

Create `.env` in `Redesign FUN sports map/` with:

```
VITE_MAPBOX_ACCESS_TOKEN=<mapbox token>
VITE_SUPABASE_URL=<supabase url>
VITE_SUPABASE_ANON_KEY=<supabase anon key>
```

Server-only (for `/api/` routes on Vercel):
- `SUPABASE_SERVICE_ROLE_KEY` — OSM importer
- `OSM_IMPORT_SECRET` — shared secret for import endpoint

## Database Setup & Schema

Database migrations live in `supabase/migrations/`. Apply them in order per `supabase/MIGRATION_ORDER.md`:

```bash
supabase db push  # (if using Supabase CLI locally)
```

After schema changes, refresh the PostgREST cache:

```sql
NOTIFY pgrst, 'reload schema';
```

Core schema: `supabase/schema.sql` (tables, RLS, RPCs, functions)

## Architecture Overview

### Repo Layout

```
├── Redesign FUN sports map/    — Main web app (React + Vite)
│   ├── src/
│   │   ├── lib/
│   │   │   ├── api.ts          ← CENTRALIZED API LAYER (all Supabase calls)
│   │   │   ├── supabase.ts      ← Client init + DB type definitions
│   │   │   └── [other utils]
│   │   ├── app/
│   │   │   ├── App.tsx          ← Root map shell (~630 lines)
│   │   │   ├── components/      ← UI components
│   │   │   ├── pages/           ← Route-level pages
│   │   │   ├── contexts/        ← React context (AuthContext)
│   │   │   └── map/             ← Map config + utilities
│   │   ├── hooks/               ← Custom React hooks
│   │   ├── styles/              ← Global CSS
│   │   └── main.tsx             ← App entry + BrowserRouter
│   └── api/                     ← Vercel serverless routes
│       ├── overpass.ts          ← OSM Overpass proxy
│       └── osm-venues-import.ts ← OSM venue importer
├── supabase/                   — Database layer
│   ├── schema.sql
│   ├── migrations/              ← 17+ incremental SQL files
│   ├── MIGRATION_ORDER.md
│   └── SCHEMA_CHANGELOG.md
└── docs/                        — Supporting documentation
```

### Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | React 18 + TypeScript + Vite |
| **Styling** | Tailwind CSS 4 + Motion/Framer Motion |
| **Maps** | Mapbox GL JS + Three.js (3D avatars) |
| **Backend** | Supabase (Postgres + PostgREST + Realtime) |
| **Forms** | React Hook Form |
| **Charts** | Recharts |
| **Deploy** | Vercel (SPA + serverless `/api/` routes) |

### Data Flow at Scale

1. **Map Load**: User location → `useGeolocation` hook → parallel Supabase RPCs (`get_games_nearby`, `get_profiles_nearby`)
2. **Game Pins**: Rendered with emoji, clustered at low zoom, individual at high zoom
3. **Venue Loading**: Check `osm_sports_venues` cache first → fallback to Overpass via `/api/overpass` → Web Worker clusters the data off-thread
4. **Chat Inboxes**: Prefetched on login idle so messenger opens instantly
5. **Messaging**: Game chat → Supabase Realtime on `game_messages` table; DMs use `dm_threads`/`dm_messages`

## Dev Conventions (Critical)

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
- **Progressive Loading**: Fetch "near ring" venues first, then expand radius
- **Web Workers**: Venue clustering runs off-thread via `venueCluster.worker.ts`
- **Prefetching**: Chat inboxes prefetch on login idle
- **Pause Venue Fetches When Chatting**: If the messenger is open, pause venue fetch kickoffs to prioritize chat bandwidth

### Config Tuning
All map UX constants (zoom thresholds, icon sizes, pulse timings) live in `src/app/map/mapConfig.ts`. Tweak there, not hardcoded in components.

### Client Cache Fallbacks
The app uses localStorage flags like `fun_profiles_athlete_column` to gracefully handle missing or newly added columns. Check `App.tsx` and relevant pages for pattern.

## Key Files to Know

| File | Role |
|---|---|
| `src/main.tsx` | App entry: mounts React, sets up BrowserRouter, wraps with AuthProvider |
| `src/app/App.tsx` | Map shell: all game/player rendering, state, interaction handlers |
| `src/lib/api.ts` | **Central API layer** — auth, games, profiles, stats, chat, venues |
| `src/lib/supabase.ts` | Supabase client init + all DB row type definitions |
| `src/app/components/MapboxMap.tsx` | Mapbox canvas: renders game pins, player avatars, venues |
| `src/app/map/mapConfig.ts` | Tunable map UX constants |
| `src/app/lib/sportsVenues.ts` | Venue fetching (Supabase cache → Overpass fallback) |
| `src/app/lib/venueCluster.worker.ts` | Web Worker for venue clustering |
| `supabase/schema.sql` | Postgres tables, RLS policies, RPCs |

## Testing & Debugging

There is **no test framework installed** currently. Manual testing workflow:
- Run `npm run dev` locally
- Use browser DevTools to inspect network requests to Supabase
- Check Supabase Studio for schema, data, and Realtime activity
- Verify RLS policies are correct (common source of silent failures)

## Deployment (Vercel)

- `build` command: `npm run build` → outputs `dist/`
- `vercel.json` configures SPA rewrites (non-`/api/` paths → `index.html`)
- `/api/` routes auto-deploy as serverless functions
- **Required env vars**: `VITE_MAPBOX_ACCESS_TOKEN`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- **Serverless env vars**: `SUPABASE_SERVICE_ROLE_KEY`, `OSM_IMPORT_SECRET`

## Existing Documentation

For deeper context, refer to:
- `README.md` — problem statement, tech stack, performance decisions
- `GEMINI.md` — development conventions and database patterns
- `AGENTS.md` — AI agent coding instructions (if using ECC)
- `Redesign FUN sports map/README.md` — deployment runbook, OSM venue setup
- `supabase/MIGRATION_ORDER.md` — definitive guide for migrations
