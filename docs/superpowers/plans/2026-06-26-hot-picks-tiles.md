# Hot Picks Expandable Digest — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the two static "Hot Picks" hero cards on Feed → Explore into honest, interactive expandable digest cards that show curated nearby games/venues and deep-link into the map.

**Architecture:** A new pure module `hotPicks.ts` ranks already-loaded feed games and freshly-fetched nearby venues. `Feed.tsx` renders an accordion (one card open at a time) over those ranked lists. `App.tsx` gains a `focusVenueId` URL effect (mirroring the existing `focusNoteId`/`focusGameId` effects) so a venue row can open the map's `VenueInfoPopup`.

**Tech Stack:** React 18 + TS, Tailwind, react-router, Supabase (`osm_sports_venues` via existing `fetchSportsVenuesFromDb` / `fetchVenueById`).

**Source spec:** `docs/superpowers/specs/2026-06-26-hot-picks-tiles-design.md` (approved). **Sprint:** 1a Unit 2.

## Grounded deviations from the spec (data-shape reality)

These are faithful realizations of the spec's goals given the actual data shapes:

1. **Games ranking** — `LiveFeedItem` (api.ts:178-221) has **no `participant_count`**. "For you" = sport-overlap with `athleteProfile.primarySports` → computed distance asc → engagement (`like_count + comment_count`) tiebreak.
2. **Venues tile** — feed games carry **no venue id/label**, so "open games grouped by venue" (busy spots) is infeasible. Use the user's handwritten refinement: **nearby `osm_sports_venues` closest→furthest, 5 visible, scroll to load more.** Honest badge: **"Near you"** (proximity), not "Busy spots" (popularity).
3. **`?hotPicks=` map emphasis** (spec step 4, optional) is **deferred** — "See all on map" navigates to `/`; the map already shows all venues/games. No map-emphasis wiring in v1.

## Global Constraints (verbatim from spec + CLAUDE.md)

- **Honest copy:** badges "AI Choice"→**"For you"**, "Trending"→**"Near you"**. No fake AI/ML.
- **No new tables / no new RPC** — derive from data Feed already loads or existing venue APIs.
- **Accordion:** only one tile expanded at a time; second tap on same header collapses.
- **Rows:** ≥44px tap target; distance right-aligned, muted. Games cap **5**. Venues **5 visible, scroll for more** (fetch up to 30 by distance; no infinite scroll).
- **Motion:** expanded list `animate-in fade-in slide-in-from-top-2` (~200ms); respect `prefers-reduced-motion`. Do not add a third full-height scroll region on Explore.
- **Map UX constants** live in `src/app/map/mapConfig.ts` (radius/bbox deltas if tuned).
- **No test framework installed** (CLAUDE.md). TDD adapted: pure helpers verified with a throwaway `npx tsx` assertion script (red→green, **not committed**); UI/deep-link verified via `npx tsc --noEmit` gate + manual click-paths.

---

### Task 1: `hotPicks.ts` pure ranking helpers

**Files:**
- Create: `Redesign FUN sports map/src/app/lib/hotPicks.ts`
- Scratch test (not committed): `scratchpad/hotPicks.check.ts`

**Interfaces:**
- Produces:
  - `type HotPickGame = { id: string; title: string; sport: string | null; lat: number; lng: number; distanceKm: number | null }`
  - `type HotPickVenue = { id: string; name: string; sport: string | null; lat: number; lng: number; distanceKm: number | null }`
  - `distanceKm(a, b): number` (haversine; reuse an existing geo util if one is found via grep, else define locally)
  - `rankHotPickGames(items: LiveFeedItem[], opts: { center?: {lat;lng}|null; primarySports?: string[]; limit?: number }): HotPickGame[]`
  - `rankHotPickVenues(fc: SportsVenueGeoJSON | null, opts: { center?: {lat;lng}|null; limit?: number }): HotPickVenue[]`
- Consumes: `LiveFeedItem` (`../../lib/api`), `SportsVenueGeoJSON` (`./sportsVenueTypes`).

- [ ] **Step 1: Grep for an existing haversine to stay DRY**

Run: `grep -rn "haversine\|distanceKm\|toRad\|6371" "Redesign FUN sports map/src" | grep -iv node_modules`
If a reusable pure distance fn exists, import it instead of defining a new one.

- [ ] **Step 2: Write `hotPicks.ts`** with the two ranking helpers + `distanceKm` (code below — grounded against api.ts:178-221 game fields and `dbRowToVenueProperties` geometry `[lng,lat]`).

- [ ] **Step 3: Write `scratchpad/hotPicks.check.ts`** — asserts: (a) a game whose `sport` ∈ primarySports outranks a closer non-matching game; (b) among same sport-match, the closer game wins; (c) venues come back sorted closest→furthest and capped at `limit`.

- [ ] **Step 4: Run the scratch check (expect FAIL first if written before impl, then PASS)**

Run: `cd "Redesign FUN sports map" && npx tsx ../scratchpad/hotPicks.check.ts`
Expected: prints `OK` for all three assertions. If `tsx` unavailable, fall back to `npx vite-node` or compile-and-run; if neither, rely on `tsc --noEmit` + manual reasoning and note it.

- [ ] **Step 5: Delete the scratch check, then commit the module**

```bash
git add "Redesign FUN sports map/src/app/lib/hotPicks.ts"
git commit -m "feat(feed): hot-picks ranking helpers (sport+distance games, nearest venues)"
```

---

### Task 2: `focusVenueId` map deep-link

**Files:**
- Modify: `Redesign FUN sports map/src/app/App.tsx` (add effect after the `focusNoteId` effect ~line 323; add imports if missing)

**Interfaces:**
- Consumes: `fetchVenueById(id): Promise<{ data: OsmSportsVenueRow | null; error: Error | null }>` (api.ts:1407 — **verify exact return shape first**), `venueSelectionFromDbRow(row)` (`./lib/venueSelection`), existing `setSelectedVenue`, `setMapSearchLocation`, `setMapSearchLocationName`, `handleCenterOnCoords`.
- Produces: URL contract `/?focusVenueId=<osm_sports_venues.id>` opens that venue's popup on the map.

- [ ] **Step 1: Verify `fetchVenueById` return shape**

Run: `sed -n '1407,1420p' "Redesign FUN sports map/src/lib/api.ts"`
Confirm it returns `{ data, error }` with `data: OsmSportsVenueRow | null`.

- [ ] **Step 2: Ensure imports** `fetchVenueById` (from `../lib/api`) and `venueSelectionFromDbRow` (from `./lib/venueSelection`) exist in App.tsx; add if missing.

- [ ] **Step 3: Add the effect** (mirrors the `focusNoteId` fetch-by-id fallback at App.tsx:295-323):

```tsx
// Deep link from Feed Hot Picks → map venue focus (centers + opens venue popup).
useEffect(() => {
  const params = new URLSearchParams(location.search);
  const vid = params.get("focusVenueId");
  if (!vid) return;
  const strip = () => {
    params.delete("focusVenueId");
    navigate({ pathname: location.pathname, search: params.toString() ? `?${params.toString()}` : "" }, { replace: true });
  };
  void fetchVenueById(vid).then((r) => {
    if (r.error || !r.data) { strip(); return; }
    setMapSearchLocation({ lat: r.data.lat, lng: r.data.lng });
    setMapSearchLocationName(r.data.name?.trim() || "Venue");
    handleCenterOnCoords({ lat: r.data.lat, lng: r.data.lng });
    setSelectedVenue(venueSelectionFromDbRow(r.data));
    strip();
  });
}, [location.pathname, location.search, navigate]);
```

- [ ] **Step 4: Type-check gate**

Run: `cd "Redesign FUN sports map" && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add "Redesign FUN sports map/src/app/App.tsx"
git commit -m "feat(map): focusVenueId deep-link opens a venue popup from a URL"
```

---

### Task 3: Hot Picks expandable digest UI in `Feed.tsx`

**Files:**
- Modify: `Redesign FUN sports map/src/app/pages/Feed.tsx` (replace the `{/* Recommendations Grid */}` section ~447-486; add imports + state; add a lazy venue fetch)

**Interfaces:**
- Consumes: `rankHotPickGames`, `rankHotPickVenues`, `HotPickGame`, `HotPickVenue` (Task 1); `fetchSportsVenuesFromDb(bbox, opts)` (`../lib/sportsVenues`); `useMyProfile().athleteProfile.primarySports`; existing `coords`, `liveItems`, `navigate`.
- Produces: tap game row → `navigate('/?focusGameId=<id>')`; tap venue row → `navigate('/?focusVenueId=<id>')` (Task 2).

- [ ] **Step 1: Add imports + state.** `useMyProfile`, `fetchSportsVenuesFromDb`, hotPicks helpers, `ChevronDown`. State: `const [hotPick, setHotPick] = useState<"games" | "venues" | null>(null);` plus `venueFeatures`/`venuesLoading`/`venuesLoaded` for the lazy venue fetch.

- [ ] **Step 2: Derive ranked games** with `useMemo` from `liveItems` + `coords` + `athleteProfile.primarySports` (cap 5).

- [ ] **Step 3: Lazy-fetch venues on first expand of the venues card** — compute a bbox `±0.3°` around `coords`, call `fetchSportsVenuesFromDb`, store features; rank with `rankHotPickVenues` (cap 30). Guard: no `coords` → disabled/empty state.

- [ ] **Step 4: Replace the two static `<button>`s** with two accordion cards:
  - Collapsed: keep poster visuals; badges **"For you"** (games, rose) / **"Near you"** (venues, blue); add a count pill bottom-left when count > 0; header toggles `setHotPick(prev => prev === id ? null : id)`.
  - Expanded games: up to 5 rows (sport emoji/title, distance right); row → `navigate('/?focusGameId=<id>')`; footer "See all on map" → `navigate('/')`. Empty → "No open games nearby".
  - Expanded venues: a `max-h-[~17rem] overflow-y-auto` list (≈5 rows visible, scroll for more) of ranked venues (pin, name, `Nkm`); row → `navigate('/?focusVenueId=<id>')`; footer "See all on map" → `navigate('/')`. Empty → "No venues nearby"; no coords → "Turn on location".
  - Motion: `animate-in fade-in slide-in-from-top-2 duration-200`.

- [ ] **Step 5: Type-check gate**

Run: `cd "Redesign FUN sports map" && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add "Redesign FUN sports map/src/app/pages/Feed.tsx"
git commit -m "feat(feed): Hot Picks expandable digest cards with map deep-links"
```

---

## Manual acceptance (user, on localhost:5173, logged in)

1. `/feed` → Explore → tap **For you (Recommended Games)** → expands ≤5 games (or "No open games nearby").
2. Tap a game row → map centers, game popup opens.
3. Tap **Near you (Popular Venues)** → games card collapses; venue list shows, 5 visible, scrolls for more (or empty/located states).
4. Tap a venue row → map centers, venue sheet opens.
5. Badges read **For you** / **Near you**. Global network section above is unchanged.

## Sprint-end gate
- `cd "Redesign FUN sports map" && npm run build` passes (tsc + vite; slow on iCloud-Desktop).
- Optional `/code-review` on the branch diff before PR.

## Self-review notes
- **Spec coverage:** interaction C (expand-in-place) ✓; honest badges ✓; row→map deep-links ✓ (games existing, venues new); ≤5 games / scrollable venues ✓; empty + no-location states ✓; motion + reduced-motion ✓. Deferred (documented): `?hotPicks=` emphasis, "games grouped by venue" popularity signal.
- **Type consistency:** `HotPickGame`/`HotPickVenue` produced in Task 1 consumed in Task 3; `focusVenueId` URL produced in Task 2 consumed in Task 3.

---

## Update — v2 (2026-06-27): dedicated pages instead of inline accordion

Per user direction, the inline accordion (interaction C) was replaced with **dedicated full pages**, and Hot Picks moved **above** the Global network on Explore:

- `Feed.tsx`: Hot Picks tiles render first; each tile navigates (`ArrowUpRight` affordance) to a page — `/feed/games`, `/feed/venues`. Accordion + on-Feed data fetching removed.
- New lazy routes in `main.tsx`: `RecommendedGames` (`/feed/games`), `PopularVenues` (`/feed/venues`).
- **`/feed/games`** — `getGamesNearby` → `rankLiveGameRows`: drops `ended`/`cancelled` games (the "not old games that have ended" requirement); ranks sport-overlap → distance → fullest → newest. Rich rows (spots, distance, LIVE badge).
- **`/feed/venues`** — `fetchSportsVenuesFromDb` with a search radius that **expands on scroll** (IntersectionObserver sentinel) for perpetual infinite scroll; rows show venue info (sport/leisure, surface, access, hours, website).
- `hotPicks.ts`: removed the `LiveFeedItem` game ranker; added `rankLiveGameRows(GameRow[])` + `isLiveGame` + `formatKm`; enriched `HotPickVenue` with display fields. Reused `distanceKmBetween` from `map/mapBounds`.
