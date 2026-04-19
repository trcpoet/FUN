# FUN — a sports map that actually moves

FUN is a **map-first pickup sports game** that kills the group-chat spiral:

- You open the app
- You see what’s happening near you (games + players + venues)
- You join (or host) in seconds
- You message the group without waiting for the map to finish “doing map things”

This repo contains the app, the Supabase database layer, and the glue that makes “real-time + geo + venues” feel instant.

### What problem does FUN solve?
Pickup sports is chaotic because discovery and coordination are fragmented:

- **Discovery**: “Where do people actually play around here?”
- **Timing**: “Is anyone playing tonight?”
- **Coordination**: “Who’s in? Where exactly? Are we still on?”
- **Trust**: “Will people show up?”

FUN turns that into a single flow: **map → join → chat → play → proof**.

### Tech stack (high level)
- **Frontend**: React + TypeScript + Tailwind (Vite build)
- **Maps**: Mapbox GL
- **Backend**: Supabase (Postgres + PostgREST + Realtime)
- **Deploy**: Vercel (app + serverless `api/` routes)
- **Venues source**: OpenStreetMap (Overpass) with an optional Supabase cache table for speed

### Repo layout
- **`Redesign FUN sports map/`**: the main web app (the thing you run + deploy)
- **`supabase/`**: migrations + schema changes (tables, RLS, RPCs, functions)
- **`docs/`**: supporting docs (runbooks / changelogs)

### Run it locally
From the app folder:

```bash
cd "Redesign FUN sports map"
npm i
npm run dev
```

### Deploy (Vercel)
This app is designed to be deployed on Vercel.

- **Required env** (client):
  - `VITE_MAPBOX_ACCESS_TOKEN`
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
- **Optional env**:
  - `VITE_MAPBOX_STYLE_URL`

More detailed deployment notes live in `Redesign FUN sports map/README.md`.

---

## Frontend: what we built

### Map-first UI (not a feed pretending to be a map)
The map is the home screen, not a “feature tab.”

- **Games** render as map pins (including countdown/live states)
- **Players** render nearby as markers
- **Venues** render as subtle dots/footprints so you can pick a place fast

### “Make it feel fast” decisions (on purpose)
We treated performance like a feature:

- **Progressive venue loading**: fetch a *near ring* first, paint it, then fetch the full radius so the map updates quickly even on slower networks.
- **Venue clustering off the main thread**: a Web Worker clusters venue points when available.
- **Don’t let venues starve chat**: when the messenger is open, the app can pause venue fetch kickoffs so Supabase chat traffic gets bandwidth.
- **Messages open instantly**: inboxes are prefetched on idle after login so the first open isn’t waiting on cold RPCs.

---

## Backend: what we built (Supabase)

FUN’s “backend” is a mix of **Postgres tables**, **RLS policies**, **RPCs** (Postgres functions), and **Realtime subscriptions**.

### Core concepts
- **Games**: rows with sport, coordinates, start time (or TTL for untimed games), and lifecycle status (scheduled → live → completed).
- **Participants**: who joined what game (and whether they’re the host).
- **Chat**:
  - Game chat threads live on `game_messages` (Realtime subscription per game)
  - Direct messages use DM threads + DM messages (inbox RPCs + message fetch + Realtime)

### Why RPCs matter here
RPCs are how we keep the app snappy and consistent:

- **Fewer round-trips** for “inbox-style” views (game inbox / DM inbox)
- **Stable response shapes** for the UI
- **Controlled permissions** (execute grants) + predictable access rules
- **Atomic operations** like `join_game()` prevent race conditions when multiple users act simultaneously

If an RPC is missing (or PostgREST schema cache is cold), the client has fallbacks for some flows, but the goal is: **deploy migrations, reload schema, stay fast**.

**Example: atomic game booking**
The `join_game()` RPC uses row-level locking (`FOR UPDATE`) to ensure that when multiple users try to join a game with 1 spot left, exactly 1 succeeds. Others see “Game is full” instantly. This prevents overbooking and keeps consistency even under high concurrency.

### Database architecture (how data is organized)
At a glance:

- **Relational tables for truth**
  - `games`, `game_participants`, `game_messages`
  - DM tables (threads + messages)
  - `user_stats` (levels/XP/streak-ready counters)
- **JSONB where the product needs flexibility**
  - `profiles.athlete_profile` stores the athlete profile payload (snapshot fields like occupation/university, skills, metrics, etc.) without forcing a schema migration for every new profile tile

This hybrid approach keeps the DB **strict where it must be strict** (games, membership, messaging) and **flexible where it should be flexible** (profile composition).

---

## Venues: the “why is it slow?” elephant

Venues can be expensive because OpenStreetMap Overpass queries return a lot of data.

FUN supports two modes:

1. **Fast mode (recommended)**: a Supabase cache table (`osm_sports_venues`) that returns venues via a single indexed query.
2. **Fallback mode**: Overpass via a same-origin proxy (`/api/overpass`) with aggressive client caching + progressive loading.

If you’re seeing slow venue loading in production, the #1 win is populating `osm_sports_venues` for your main regions so you’re not depending on Overpass latency.

Implementation and import steps live in `Redesign FUN sports map/README.md` (search for “OSM sports venues”).

---

## What “done” looks like (the FUN bar)
We ship toward metrics that prove the product works:

- **Time-to-first-join**: can a new user join something fast?
- **Show-up proxy**: did people who joined still show when the game went live / completed?
- **Repeat joins**: second game within 14 days
- **Host success**: hosted games that reach live/completed vs cancelled

If you’re reading this because you’re building with us: welcome. This repo is the engine that turns “I want to play tonight” into an actual game on a real map, with real people, and real coordination that doesn’t melt down.

