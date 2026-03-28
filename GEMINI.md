# GEMINI.md - Project Context & Instructions

## Project Overview
**FUN** is a map-first pickup sports application designed for real-time discovery and coordination of games, players, and venues. It aims to eliminate the fragmentation of group chats by providing a seamless flow from the map to gameplay.

### Architecture & Tech Stack
- **Frontend**: React 18, TypeScript, Tailwind CSS, Vite.
- **Maps**: Mapbox GL JS for the core map interface, with Three.js for 3D avatar rendering.
- **Backend**: Supabase (Postgres, PostgREST, Realtime, RLS).
- **APIs**: Centralized API layer in `src/lib/api.ts` wrapping Supabase RPCs and Mapbox Geocoding.
- **Venues**: Sourced from OpenStreetMap (Overpass API) with an optional indexed Supabase cache (`osm_sports_venues`).
- **Deployment**: Optimized for Vercel.

---

## Building and Running

### Prerequisites
- Node.js (v18+ recommended)
- Supabase project (URL and Anon Key)
- Mapbox Access Token

### Local Development
1. Navigate to the app directory:
   ```bash
   cd "Redesign FUN sports map"
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up environment variables:
   Copy `.env.example` to `.env` and fill in:
   - `VITE_MAPBOX_ACCESS_TOKEN`
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Start the development server:
   ```bash
   npm run dev
   ```

### Production Build
```bash
npm run build
```

### Database Setup
Apply migrations located in `supabase/migrations/` in the order specified in `supabase/MIGRATION_ORDER.md`. The base schema is in `supabase/schema.sql`.

---

## Development Conventions

### "Fast-First" Philosophy
Performance is treated as a core feature. Adhere to these patterns:
- **RPC over Table Queries**: Use `supabase.rpc()` for complex joins or "inbox-style" views to minimize round-trips.
- **Progressive Loading**: Fetch critical data (like a "near ring" of venues) first before expanding the search radius.
- **Background Tasks**: Offload heavy computations (like clustering) to Web Workers when possible.
- **Prefetching**: Prefetch chat inboxes on idle after login to ensure instant opening.

### Database & State
- **Strict vs. Flexible**: Use strict relational tables for core truth (games, participants, messages) and `jsonb` (e.g., `profiles.athlete_profile`) for flexible, evolving product data.
- **RLS (Row Level Security)**: Always verify that new tables have appropriate RLS policies. Refer to `supabase/migrations/` for existing patterns.
- **Idempotency**: All migration SQL should be written to be idempotent (safe to re-run).

### Code Style
- **Centralized API**: Never call `supabase` directly from components. Use or extend the functions in `src/lib/api.ts`.
- **Typing**: Maintain and update TypeScript interfaces in `src/lib/supabase.ts` to match the database schema.
- **Environment Variables**: Always trim environment variables when reading them (see `src/lib/supabase.ts`) to avoid JWT/REST 401 errors caused by trailing spaces.

### Testing & Validation
- **Verification**: After making schema changes, run `NOTIFY pgrst, 'reload schema';` to refresh the PostgREST cache.
- **Client Cache**: Be aware of local storage flags like `fun_profiles_athlete_column` which the app uses to handle missing columns gracefully.

---

## Key Files
- `Redesign FUN sports map/src/lib/api.ts`: Central entry point for all data operations.
- `Redesign FUN sports map/src/lib/supabase.ts`: Type definitions and Supabase client initialization.
- `supabase/schema.sql`: Core database structure.
- `supabase/MIGRATION_ORDER.md`: Definitive guide for database setup.
- `supabase/SCHEMA_CHANGELOG.md`: History of database changes and fixes.
