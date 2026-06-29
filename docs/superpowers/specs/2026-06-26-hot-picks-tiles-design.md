# Hot Picks Tiles — Design Spec

**Status:** Approved for implementation planning  
**Date:** 2026-06-26  
**Sprint:** 1a Unit 2 (replaces bare `navigate('/')` wire-up)  
**Related:** `ROADMAP.md` bucket A · `~/.claude/plans/fun-sports-map-steady-eich.md` Unit 2

---

## Problem

On **Feed → Explore**, two **Hot Picks** hero cards (*Recommended Games*, *Popular Venues*) are styled as buttons but have **no `onClick`**. Copy promises personalization (“AI Choice”, “Explore Personalized Runs”) with **no backing data or interaction**.

Explore already shows **Global network** (chronological games, notes, statuses, media). Hot Picks must not duplicate that stream; it should answer **“what should I do right now?”** in two curated slices.

---

## Goals

1. Tapping a Hot Picks tile **shows a short curated list** (expand in place), not a blind jump to the map.
2. Tapping a **row** opens that game or venue **on the map** (existing or new deep-link).
3. Labels are **honest** for v1 (heuristic ranking, no fake AI).
4. **Minimal new backend** — derive from data Feed already loads or can load with existing APIs.

## Non-goals (v1)

- Real ML / “AI Choice” recommendations
- Google Places enrichment or rich venue cards (Phase 3)
- New feed tab or full-page list
- Infinite scroll inside Hot Picks

---

## Recommended interaction: **C — expandable digest cards**

### Collapsed (default)

Keep current hero card visual (rose = games, blue = venues). Add optional **live count** when data exists, e.g. `4 open near you`.

**Badge copy (rename):**

| Old | New |
|-----|-----|
| AI Choice | **For you** |
| Trending | **Busy spots** |

### Expanded (on tile tap)

- Accordion: **only one tile expanded at a time**.
- Show **up to 5 compact rows** + footer link **“See all on map”**.
- Second tap on same tile header **collapses**.

### Row tap → map

| Row type | Navigation |
|----------|------------|
| Game | `navigate('/?focusGameId=<id>')` — **exists** (`Feed.tsx`, `App.tsx`) |
| Venue | `navigate('/?focusVenueId=<id>')` — **add** mirroring `focusGameId` pattern, open `VenueInfoPopup` / venue selection |

### “See all on map” (footer)

- **Games tile:** `navigate('/')` + query e.g. `?hotPicks=games` → map opens with Live / games emphasis (reuse `liveNowOpen` or equivalent if simple).
- **Venues tile:** `navigate('/')` + `?hotPicks=venues` → map centered on user, venue layer visible.

Pure map shortcut (**A**) is the **footer escape hatch**, not the only behavior.

---

## Data sources (v1, no new tables)

### Recommended Games

- Source: `fetchLiveNearby` and/or open games from `fetchUnifiedFeed` (already called in `Feed.tsx` when `coords` exist).
- Filter: `status` open / not ended; within **25 km** (match live feed radius).
- Sort (heuristic “for you”):
  1. `participant_count` descending
  2. Sport overlap with viewer `athleteProfile` primary sports (if available)
  3. Distance ascending
- Cap: **5 rows**.

### Popular Venues (“busy spots”)

- Derive from **open games grouped by venue**:
  - Prefer stable venue id from game/OSM if present; else cluster by `location_label` + rounded lat/lng.
- Rank: **game count** in radius descending.
- Display: venue name, distance, `N games` subtitle.
- Cap: **5 rows**.
- If no venue id on game rows, use lat/lng center + label until `focusVenueId` lands.

---

## UI components

| Piece | Location | Notes |
|-------|----------|-------|
| Hot Picks section | `src/app/pages/Feed.tsx` ~446–486 | Refactor into subcomponent if file grows |
| Compact game row | Reuse `GameFeedCard` compact variant or slim row from `UnifiedFeedCards` | Same tap behavior as Feed |
| Compact venue row | New slim row: name, distance, game count | Tap → venue focus |
| Accordion state | `useState<'games' \| 'venues' \| null>` | One open at a time |
| Map deep-link | `src/app/App.tsx` | Add `focusVenueId` effect parallel to `focusGameId` |

### Empty states

- **Collapsed + zero items:** show count `0 near you`; expand shows “No open games nearby” / “No busy venues yet” + CTA “Browse map”.
- **No location:** prompt to enable location (reuse existing geolocation patterns); cards disabled or show copy.

---

## Visual / motion (frontend-design)

- **Collapsed:** existing poster cards; add small count pill bottom-left when `count > 0`.
- **Expanded:** card border brightens; list `animate-in fade-in slide-in-from-top-2` (~200ms); respect `prefers-reduced-motion`.
- **Row:** 44px min tap target; sport emoji or venue pin; distance right-aligned muted.
- **Do not** add a third full-height scroll region on Explore.

---

## Error handling

- Fetch failures: expanded section shows retry-friendly message; collapsed card still tappable.
- Deep-link game/venue not in cache: mirror `focusNoteId` fallback (`fetchNoteById` pattern) — fetch venue/game by id if needed.

---

## Testing / acceptance

Manual (no test framework required for v1):

1. `/feed` → Explore → tap **Recommended Games** → list expands with ≤5 games (or empty state).
2. Tap a game row → map centers, game popup opens.
3. Tap **Popular Venues** → other tile collapses; venue list shows or empty state.
4. Tap venue row → map centers, venue sheet opens.
5. **See all on map** → map with appropriate emphasis.
6. Badges say **For you** / **Busy spots**, not AI Choice / Trending.
7. Global network section unchanged above Hot Picks.

**Done when:** Hot Picks tiles are interactive, honest, and distinct from Global network.

---

## Implementation order (for writing-plans)

1. Pure helpers: `rankHotPickGames`, `rankHotPickVenues` (new `src/app/lib/hotPicks.ts` or colocate in Feed).
2. Accordion UI + rename badges in `Feed.tsx`.
3. `focusVenueId` deep-link in `App.tsx` + venue open handler.
4. Optional `?hotPicks=` map emphasis.
5. Manual verify click-paths; one commit: `feat(feed): Hot Picks expandable digest with map deep-links`.

---

## Open decisions (defaults chosen)

| Question | Default |
|----------|---------|
| List in Feed vs map-only | **Expand in Feed (C)** |
| AI branding | **Removed** until real ranking |
| Venue popularity signal | **Game count at venue or list of venues closest to you** in 25 km |
| Max rows | **5** | | What of we wanted a list of venues from closest to furthest, show max 5 rows but with the ability to scroll down to load more venues
