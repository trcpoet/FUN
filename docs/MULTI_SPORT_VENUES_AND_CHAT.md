# Multi-sport venues & per-game chat

## How Stitch maps to this codebase

| Stitch screen | Meaning in code |
|----------------|-----------------|
| Multi-sport map pin (e.g. basketball + tennis + “24”) | Several **`games`** rows near the same coordinates. Mapbox **clusters** them; zooming expands the cluster into separate icons. |
| “Central Park Courts” card with rows per sport | **Same venue**, multiple **`games`** filtered by distance; **group by `sport`** for display. |
| Chat header: place name + **BASKETBALL** | **`GameMessengerSheet`** thread = one **`game_id`**. Subtitle uses `game.sport`. Title uses `game.title` — set **`location_label`** / title when creating a game at a venue so it reads like “Rucker Park”. |
| One “Join” / event card per pin | **`GameEventPopup`** is bound to a **single `GameRow`** / `game_id`. |

## Core rule (already true in DB)

**Chat is keyed by `game_id`, not by map coordinates.**

- `public.game_messages.game_id` → `public.games.id`
- RLS: only **participants** read/write messages for that game.

So “different chat groups per sport game” = **different `games` rows** (different `game_id`s). You do **not** need a separate chat table per venue; you need **clear UX** to pick **which game** (which `game_id`) when several exist at one place.

## Data model options

### A. Current model (no migration)

- Each pickup is a **`games`** row with its own `sport`, `lat`, `lng`, `title`, optional `location_label`.
- **Same coordinates** + **different `sport`** ⇒ different games ⇒ different chats. ✅
- **Same coordinates** + **same sport** ⇒ multiple concurrent pickups ⇒ still **different `game_id`s** ⇒ different chats. ✅

### B. Optional future: stable venue key on `games`

If you want easier queries (“everything at this OSM venue”):

- Add nullable `venue_osm_id text` (e.g. `way/123456`) on `games`, filled when creating from **Create game at venue**.
- Chat still stays on **`game_id`**; `venue_osm_id` is only for **grouping UI** and analytics.

## UX flows to implement

1. **Venue selected (OSM pitch / sports centre)**  
   - List **open games** near that point, **grouped by sport** (Stitch card).  
   - Each row → one `game_id` → **Join** or **Open chat** (if already joined).

2. **Cluster pin (many games)**  
   - Today: click cluster → **zoom in** until icons split.  
   - Stitch-style upgrade: at max zoom (or on long-press), **`getClusterLeaves`** → list games in a sheet → pick one game.

3. **Map icon click**  
   - Already opens **`GameEventPopup`** for one **`game_id`** — correct for single-game pins.

4. **Messenger**  
   - **`focusThread.gameId`** = chat thread.  
   - To match Stitch (place + sport in header), pass **`location_label`** into thread focus when you extend `MessengerThreadFocus` (optional).

## Files touched by the venue list UI

- `src/app/lib/gamesAtVenue.ts` — distance filter + group-by-sport helpers  
- `src/app/components/VenueInfoPopup.tsx` — games list grouped by sport  
- `src/app/components/MapboxMap.tsx` — pass nearby games + join/chat handlers  

## Product note

- **Read/send chat** still requires **joining** `game_participants` (existing RLS). Buttons should show **Join** until joined, then **Chat**.
