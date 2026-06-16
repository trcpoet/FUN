# Filter Trust (Approach A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every control in `FiltersModal` visibly affect the map/game list by routing all applied filters through a single source of truth (`appliedFilters`) and matching games against `games.requirements` with inclusive rules.

**Architecture:** `appliedFilters` (a `FiltersState`) is the only state that drives fetch radii and client-side filtering. A new pure module `gameFilters.ts` parses `game.requirements` and decides visibility with inclusive matching (missing/`Any` always passes; only explicit conflicts hide). The duplicate `gamesRadiusKm` state is eliminated in favour of a derived `effectiveGamesRadiusKm = sportExtendRadius ?? appliedFilters.gamesRadiusKm`. Profile `gameMatchPreferences` (jsonb, no migration) seed filters once per user.

**Tech Stack:** React 18 + TypeScript + Vite + Tailwind + Supabase (PostGIS RPC `get_games_nearby`). Optional unit tests via Vitest.

---

## Pre-flight facts (verified 2026-06-14, do not re-derive)

- **RPC returns `requirements`.** A live anon probe of `get_games_nearby` (Times Square, 120 km) returned 22 rows; each row includes `requirements` as a JSON object. Client-side requirement filtering is viable — **no SQL migration required**. The function body is NOT in any local migration (it predates migration tracking); section 7 of `supabase/migrations/20260501080000_game_duration_and_visibility.sql` is a verified no-op. Do not try to edit it locally.
- **`GameRow` already declares** `requirements?: Record<string, unknown> | null` (`src/lib/supabase.ts:45`). RPC row columns: `created_at, created_by, description, distance_km, ended_at, id, lat, live_started_at, lng, location_label, participant_count, requirements, sport, spots_needed, spots_remaining, starts_at, status, substitute_count, title`.
- **Canonical option labels** (`src/lib/gamePreferenceOptions.ts`): `LEVEL_OPTIONS = ["Any","Beginner","Intermediate","Advanced","Competitive"]`; `AGE_RANGE_OPTIONS = ["Any","13–17","18–24","25–34","35–44","45+"]` (EN-DASH `–`, U+2013); `MATCH_TYPE_OPTIONS = ["Co-ed","Men's","Women's"]`.
- **Create-game** stores requirements as `{ skillLevel, ageRange, matchType, visibility, school }` using those canonical arrays (`CreateGameModal.tsx:379-389`, options rendered `:971/:992/:1013`). So games in the DB already use canonical labels.
- **`useNearbyMapQueries` cache key** already includes `gamesRadiusKm` + `athletesRadiusKm` (`src/hooks/useNearbyMapQueries.ts:13-29`). Skill/age/matchType are client-side → **cache key needs no change**.
- **`ProfileEditSheet.handleSave`** spreads `...draft` into `onSaveAthleteProfile` (`:228`), and `draft` is initialised `{...emptyAthleteProfile(), ...athleteProfile}` (`:148`). Adding `gameMatchPreferences` to the payload type + parse/merge + UI is sufficient to persist & restore it.
- **`useMyProfile()`** returns `{ athleteProfile, updateProfile, ... }` (`src/hooks/useMyProfile.ts:60-71`); App already destructures `athleteProfile` (`App.tsx:153`).

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `src/app/lib/gameFilters.ts` | Pure matching: `parseRequirements`, `gameMatchesFilters`, `countMatchingGames`, `deriveDefaultFiltersFromProfile`, `mapSportSkillLevelToFilterLevel` | **Create** |
| `src/app/lib/gameFilters.test.ts` | Vitest unit tests for the pure module | **Create** (optional task) |
| `src/lib/gamePreferenceOptions.ts` | Add `isAnyPreference`, age-bucket ranges + `normalizeAgeRange`, `ageRangesOverlap` | Modify |
| `src/app/components/FiltersModal.tsx` | Extend `FiltersState` (+`matchType`), canonical option lists, matchType select, live-preview footer props | Modify |
| `src/app/App.tsx` | Unify radius state, wire `displayGames`, onApply/onClear, profile seed + localStorage, pill summary, empty-state banner | Modify |
| `src/lib/athleteProfile.ts` | `gameMatchPreferences` type + parse + merge | Modify |
| `src/app/components/athlete-profile/ProfileEditSheet.tsx` | Identity-tab "Game matching" fields | Modify |
| `src/app/components/TopUI.tsx` | Active-filter pill next to Filter button | Modify |

**Out of scope (do NOT build):** sport chips on map, preset bundles (Tonight/Casual), bbox/"only what I see" filtering, venue enrichment filters (lit/indoor), radial hub redesign, feed ranking, server-side RPC filter params.

---

## Inclusive matching rules (the contract `gameFilters.ts` must satisfy)

For each dimension, **filter `Any`/empty = no constraint (pass)**, and **game requirement missing/`Any`/unknown = pass**. Only hide on explicit conflict:

| Dimension | Conflict (hide) when | Rule |
|---|---|---|
| Sports (`filters.sports`) | game.sport ∉ allow-list | case-insensitive membership; empty list = all |
| Skill | game skill is a *specific different* level | equality: pass iff `gameSkill==filterSkill` (game `Any` passes) |
| Age | buckets do **not** overlap | inclusive range overlap on `[minAge,maxAge]` |
| Match type | game match is a *specific different* format | equality: pass iff `gameMatch==filterMatch` (game `Any` passes) |

Notes:
- Skill is **equality**, not a hierarchy (matches the spec table exactly: filter Intermediate hides Advanced-only). Document this in code.
- Match type equality means a `Co-ed` game is shown only for `Co-ed`/`Any` filters (filter = "the format I want to see"). Documented decision.
- Age overlap example: filter `25–34` vs game `18–24` → no overlap → hide; vs game `25–34`/missing/`Any` → show.
- Legacy/malformed age labels → treated as `Any` (pass).

---

### Task 1: Pure filter module + option helpers

**Files:**
- Modify: `src/lib/gamePreferenceOptions.ts`
- Create: `src/app/lib/gameFilters.ts`

- [ ] **Step 1: Add helpers to `src/lib/gamePreferenceOptions.ts`** (append below `MATCH_TYPE_OPTIONS`/types, before the duration section):

```ts
/** True when a preference value means "no constraint" (null/empty/"Any"). */
export function isAnyPreference(v: string | null | undefined): boolean {
  const s = (v ?? "").trim();
  return s === "" || s.toLowerCase() === "any";
}

/** Inclusive [minAge, maxAge] for each canonical AGE_RANGE_OPTIONS bucket. */
const AGE_BUCKET_RANGES: Record<string, [number, number]> = {
  "13–17": [13, 17],
  "18–24": [18, 24],
  "25–34": [25, 34],
  "35–44": [35, 44],
  "45+": [45, 200],
};

/** Legacy/malformed labels (old hyphen buckets) → canonical en-dash bucket. */
const AGE_ALIASES: Record<string, string> = {
  "18-25": "18–24",
  "26-35": "25–34",
  "36-45": "35–44",
  "46+": "45+",
  "13-17": "13–17",
  "18-24": "18–24",
  "25-34": "25–34",
  "35-44": "35–44",
};

/** Canonical bucket label, "Any", or null when unrecognised (caller treats null as pass). */
export function normalizeAgeRange(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  if (s === "" || s.toLowerCase() === "any") return "Any";
  if (AGE_BUCKET_RANGES[s]) return s;
  if (AGE_ALIASES[s]) return AGE_ALIASES[s];
  return null;
}

/** Two age buckets overlap if they share any age. Unknown buckets => inclusive pass. */
export function ageRangesOverlap(a: string, b: string): boolean {
  const ra = AGE_BUCKET_RANGES[normalizeAgeRange(a) ?? ""];
  const rb = AGE_BUCKET_RANGES[normalizeAgeRange(b) ?? ""];
  if (!ra || !rb) return true;
  return ra[0] <= rb[1] && rb[0] <= ra[1];
}
```

- [ ] **Step 2: Create `src/app/lib/gameFilters.ts`** with the full module:

```ts
/** Pure, client-side game-visibility matching for map filters (Approach A). */
import type { GameRow } from "../../lib/supabase";
import type { FiltersState } from "../components/FiltersModal";
import type { AthleteProfilePayload } from "../../lib/athleteProfile";
import {
  LEVEL_OPTIONS,
  MATCH_TYPE_OPTIONS,
  isAnyPreference,
  ageRangesOverlap,
  normalizeAgeRange,
} from "../../lib/gamePreferenceOptions";

export type ParsedRequirements = {
  skillLevel: string; // canonical LEVEL_OPTIONS value or "Any"
  ageRange: string; // canonical AGE_RANGE_OPTIONS value or "Any"
  matchType: string; // canonical MATCH_TYPE_OPTIONS value or "Any"
};

const LEVEL_SET = new Set<string>(LEVEL_OPTIONS as readonly string[]);
const MATCH_SET = new Set<string>(MATCH_TYPE_OPTIONS as readonly string[]);

/** Normalise a game's stored requirements jsonb into canonical labels. Unknown => "Any". */
export function parseRequirements(raw: GameRow["requirements"]): ParsedRequirements {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const rawSkill = typeof o.skillLevel === "string" ? o.skillLevel.trim() : "";
  const rawMatch = typeof o.matchType === "string" ? o.matchType.trim() : "";
  const rawAge = typeof o.ageRange === "string" ? o.ageRange.trim() : "";
  return {
    skillLevel: LEVEL_SET.has(rawSkill) ? rawSkill : "Any",
    matchType: MATCH_SET.has(rawMatch) ? rawMatch : "Any",
    ageRange: normalizeAgeRange(rawAge) ?? "Any",
  };
}

/**
 * Inclusive matching: a game shows unless its explicit requirement conflicts with
 * an active (non-"Any") filter. Sports use game.sport; skill/age/matchType use requirements.
 */
export function gameMatchesFilters(game: GameRow, filters: FiltersState): boolean {
  if (filters.sports.length > 0) {
    const allow = new Set(filters.sports.map((s) => s.toLowerCase()));
    if (!allow.has((game.sport ?? "").toLowerCase())) return false;
  }
  const req = parseRequirements(game.requirements);

  // Skill: equality (not hierarchy) — filter "Intermediate" hides "Advanced"-only games.
  if (!isAnyPreference(filters.skillLevel) && !isAnyPreference(req.skillLevel)) {
    if (req.skillLevel !== filters.skillLevel) return false;
  }
  // Age: inclusive bucket overlap.
  if (!isAnyPreference(filters.ageRange) && !isAnyPreference(req.ageRange)) {
    if (!ageRangesOverlap(filters.ageRange, req.ageRange)) return false;
  }
  // Match type: equality — a Co-ed game shows only for Co-ed/Any filters (filter = format I want).
  if (!isAnyPreference(filters.matchType) && !isAnyPreference(req.matchType)) {
    if (req.matchType !== filters.matchType) return false;
  }
  return true;
}

export function countMatchingGames(games: GameRow[], filters: FiltersState): number {
  let n = 0;
  for (const g of games) if (gameMatchesFilters(g, filters)) n++;
  return n;
}

/** SportSkillEntry.level (casual/intermediate/advanced/competitive) → filter LEVEL_OPTIONS label. */
export function mapSportSkillLevelToFilterLevel(
  level: "casual" | "intermediate" | "advanced" | "competitive" | null | undefined
): string | null {
  switch (level) {
    case "casual":
      return "Beginner";
    case "intermediate":
      return "Intermediate";
    case "advanced":
      return "Advanced";
    case "competitive":
      return "Competitive";
    default:
      return null;
  }
}

/** Seed skill/age/matchType filter defaults from profile prefs (explicit) or primary-sport skill. */
export function deriveDefaultFiltersFromProfile(
  profile: AthleteProfilePayload | null | undefined
): Partial<FiltersState> {
  if (!profile) return {};
  const out: Partial<FiltersState> = {};
  const prefs = profile.gameMatchPreferences;

  const explicitSkill = prefs?.skillLevel;
  if (explicitSkill && !isAnyPreference(explicitSkill)) {
    out.skillLevel = explicitSkill;
  } else {
    const skills = profile.sportsSkills ?? [];
    const primary = skills.find((s) => s.primary) ?? skills[0];
    const mapped = mapSportSkillLevelToFilterLevel(primary?.level);
    if (mapped) out.skillLevel = mapped;
  }
  if (prefs?.ageRange && !isAnyPreference(prefs.ageRange)) out.ageRange = prefs.ageRange;
  if (prefs?.matchType && !isAnyPreference(prefs.matchType)) out.matchType = prefs.matchType;
  return out;
}
```

- [ ] **Step 3: Typecheck** — `gameFilters.ts` references `FiltersState.matchType` and `AthleteProfilePayload.gameMatchPreferences`, which are added in Tasks 2 & 5. After completing Tasks 2 and 5, run from `Redesign FUN sports map/`:

Run: `npx tsc --noEmit`
Expected: no errors referencing `gameFilters.ts`.

> Note: this module compiles only once Tasks 2 & 5 add the new type fields. Build the types first if your toolchain fails fast; otherwise implement Task 2, 5, then re-typecheck.

---

### Task 2: Extend `FiltersState` + fix FiltersModal options + live preview

**Files:**
- Modify: `src/app/components/FiltersModal.tsx`

- [ ] **Step 1: Extend the type + defaults** (`FiltersModal.tsx:20-37`):

```ts
export type FiltersState = {
  sports: string[];
  gamesRadiusKm: number;
  venueRadiusKm: number;
  athletesRadiusKm: number;
  skillLevel: string; // "Any" default
  ageRange: string; // "Any" default
  matchType: string; // NEW — "Any" default; maps to create-game matchType
};

export const DEFAULT_FILTERS: FiltersState = {
  sports: [],
  gamesRadiusKm: 15,
  venueRadiusKm: 15,
  athletesRadiusKm: 10,
  skillLevel: "Any",
  ageRange: "Any",
  matchType: "Any",
};
```

- [ ] **Step 2: Import canonical options + preview prop.** Add import near the top:

```ts
import { LEVEL_OPTIONS, AGE_RANGE_OPTIONS, MATCH_TYPE_OPTIONS } from "../../lib/gamePreferenceOptions";
```

Extend `FiltersModalProps`:

```ts
type FiltersModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: FiltersState;
  onChange: (next: FiltersState) => void;
  onApply?: () => void;
  onClear?: () => void;
  /** Live preview computed by App from the current draft + fetched games. */
  previewGameCount?: number;
  /** Optional venue preview; omitted = games-only footer. */
  previewVenueCount?: number;
};
```

- [ ] **Step 3: Replace the hardcoded Advanced selects** (`FiltersModal.tsx:218-249`) with canonical-driven selects + add match type. The Skill select maps `LEVEL_OPTIONS`; Age maps `AGE_RANGE_OPTIONS` (en-dash, correct buckets); Match type prepends `"Any"` to `MATCH_TYPE_OPTIONS`:

```tsx
<AccordionContent className="space-y-4 pt-4 pb-4 px-1">
  <div className="grid grid-cols-2 gap-4">
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">Skill Level</Label>
      <Select value={value.skillLevel || "Any"} onValueChange={(v) => update({ skillLevel: v })}>
        <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Any" /></SelectTrigger>
        <SelectContent>
          {LEVEL_OPTIONS.map((opt) => (
            <SelectItem key={opt} value={opt}>{opt}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">Age Range</Label>
      <Select value={value.ageRange || "Any"} onValueChange={(v) => update({ ageRange: v })}>
        <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Any" /></SelectTrigger>
        <SelectContent>
          {AGE_RANGE_OPTIONS.map((opt) => (
            <SelectItem key={opt} value={opt}>{opt}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  </div>
  <div className="space-y-2">
    <Label className="text-xs text-muted-foreground">Match type</Label>
    <Select value={value.matchType || "Any"} onValueChange={(v) => update({ matchType: v })}>
      <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Any" /></SelectTrigger>
      <SelectContent>
        {["Any", ...MATCH_TYPE_OPTIONS].map((opt) => (
          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
</AccordionContent>
```

- [ ] **Step 4: Add the live-preview footer.** In `FiltersModal(...)` destructure the new props, and render a count line just above `<DialogFooter>` (inside the scroll container or between it and the footer):

```tsx
const { open, onOpenChange, value = DEFAULT_FILTERS, onChange, onApply, onClear,
        previewGameCount, previewVenueCount } = props;
```

```tsx
{previewGameCount != null && (
  <p className="px-1 pt-1 text-xs text-muted-foreground" aria-live="polite">
    <span className="font-medium text-foreground/90">{previewGameCount}</span> games
    {previewVenueCount != null && (
      <> · <span className="font-medium text-foreground/90">{previewVenueCount}</span> venues</>
    )} match
  </p>
)}
```

- [ ] **Step 5: Verify** — `npx tsc --noEmit` passes (after App wiring in Task 3 supplies the new props). Manually: open Filters → Advanced shows Beginner…Competitive, en-dash age buckets, and a Match type select.

> **Venue preview is deferred** (games-only ships now). `previewVenueCount` stays optional; wiring a live visible-venue count out of the fragile `MapboxMap` is a follow-up (see Task 10 notes). Do NOT modify `MapboxMap` for this.

---

### Task 3: Unify radius state + onApply/onClear + sportFocus auto-extend (App.tsx)

**Files:**
- Modify: `src/app/App.tsx`

This task removes the duplicate `gamesRadiusKm` (Bug 1) and makes the sportFocus 120 km auto-extend cooperate with user Apply.

- [ ] **Step 1: Replace the dual state** (`App.tsx:78`). Remove `const [gamesRadiusKm, setGamesRadiusKm] = useState(...)` and introduce a one-shot sport-extend override + derived radius. Place after `appliedFilters`/`filtersDraft` (`:93-95`):

```ts
// sportFocus may auto-extend the games radius to 120km when a searched sport has 0 nearby games.
// This is a one-shot override per sportFocus session; user Apply always wins.
const [sportExtendRadius, setSportExtendRadius] = useState<number | null>(null);
const sportExtendSessionRef = useRef<string | null>(null);
const effectiveGamesRadiusKm = sportExtendRadius ?? appliedFilters.gamesRadiusKm;
```

- [ ] **Step 2: Feed the hook the derived radius** (`App.tsx:117`):

```ts
gamesRadiusKm: effectiveGamesRadiusKm,
```

- [ ] **Step 3: Reset the override when the sport focus changes.** Add an effect near the other sportFocus effects:

```ts
useEffect(() => {
  // New sport-focus session (incl. clearing): drop any prior auto-extend & re-arm.
  setSportExtendRadius(null);
  sportExtendSessionRef.current = null;
}, [sportFocus?.sport]);
```

- [ ] **Step 4: Rewrite the auto-extend effect** (replace `App.tsx:455-462`) to use the derived radius + one-shot guard:

```ts
useEffect(() => {
  if (!sportFocus || !userCoords || nearbyLoading) return;
  if (sportExtendSessionRef.current === sportFocus.sport) return; // already resolved this session
  const matching = gamesMatchingSport(games, sportFocus.sport);
  if (matching.length === 0 && effectiveGamesRadiusKm < EXTENDED_GAMES_RADIUS_KM) {
    sportExtendSessionRef.current = sportFocus.sport;
    setSportExtendRadius(EXTENDED_GAMES_RADIUS_KM);
  }
}, [sportFocus, games, nearbyLoading, effectiveGamesRadiusKm, userCoords]);
```

- [ ] **Step 5: Update the camera/empty-toast effect** (`App.tsx:464-501`) — replace both reads of `gamesRadiusKm` with `effectiveGamesRadiusKm` (the `gamesRadiusKm >= EXTENDED…` guard at `:469` and the signature string at `:480`), and update the dependency array (`:501`) from `gamesRadiusKm` to `effectiveGamesRadiusKm`.

- [ ] **Step 6: Fix `clearMapSearch`** (`App.tsx:326`). Replace `setGamesRadiusKm(DEFAULT_FILTERS.gamesRadiusKm);` with:

```ts
setSportExtendRadius(null);
sportExtendSessionRef.current = null;
```

- [ ] **Step 7: Wire onApply + onClear on `<FiltersModal>`** (`App.tsx:787-798`). User Apply wins over auto-extend; Clear resets fetch radii too:

```tsx
<FiltersModal
  open={filtersOpen}
  onOpenChange={setFiltersOpen}
  value={filtersDraft}
  onChange={setFiltersDraft}
  previewGameCount={filtersPreviewCount}
  onApply={() => {
    setAppliedFilters(filtersDraft);
    setSportExtendRadius(null);
    if (sportFocus) sportExtendSessionRef.current = sportFocus.sport; // user overrode; don't re-extend
    persistAppliedFilters(filtersDraft); // from Task 6
    setFilterApplySync(true);
    filterApplyStartedAtRef.current = Date.now();
    setFiltersOpen(false);
  }}
  onClear={() => {
    setFiltersDraft(DEFAULT_FILTERS);
    setAppliedFilters(DEFAULT_FILTERS);
    setSportExtendRadius(null);
    sportExtendSessionRef.current = sportFocus?.sport ?? null;
    persistAppliedFilters(DEFAULT_FILTERS);
    setFilterApplySync(true);
    filterApplyStartedAtRef.current = Date.now();
  }}
/>
```

- [ ] **Step 8: Add the preview count** (computed from the live draft). Near `displayGames` add:

```ts
const filtersPreviewCount = useMemo(
  () => countMatchingGames(filterGamesVisibleOnMap(games, Date.now()), filtersDraft),
  [games, filtersDraft, mapMinuteEpoch]
);
```

Add imports at top of App.tsx:

```ts
import { gameMatchesFilters, countMatchingGames, deriveDefaultFiltersFromProfile } from "./lib/gameFilters";
```

- [ ] **Step 9: Verify** — `npx tsc --noEmit` clean. Manual: set Games radius 5 km → Apply → DevTools Network shows `get_games_nearby` body `radius_km: 5` and fewer pins. Search "Basketball" → set 10 km → Apply → stays 10 km (no bounce to 120) until Clear or new search.

---

### Task 4: Route `displayGames` through `gameMatchesFilters`

**Files:**
- Modify: `src/app/App.tsx`

- [ ] **Step 1: Replace the sport-only filter** (`App.tsx:503-511`):

```ts
const displayGames = useMemo(() => {
  let list = filterGamesVisibleOnMap(games, Date.now());
  // Precedence = intersection: TopUI search (sportFocus) AND applied filters must both pass.
  if (sportFocus) list = gamesMatchingSport(list, sportFocus.sport);
  list = list.filter((g) => gameMatchesFilters(g, appliedFilters)); // sport list + skill + age + matchType
  return list;
}, [games, sportFocus, appliedFilters, mapMinuteEpoch]);
```

- [ ] **Step 2: Verify** — `npx tsc --noEmit` clean. Manual: with a DB game tagged `Advanced`, set Skill=Intermediate → that pin disappears; games with no requirements stay. Set Match type=Women's → Men's-only games hide; Co-ed/Any stay.

---

### Task 5: Profile `gameMatchPreferences` (type + parse/merge + UI)

**Files:**
- Modify: `src/lib/athleteProfile.ts`
- Modify: `src/app/components/athlete-profile/ProfileEditSheet.tsx`

- [ ] **Step 1: Add the payload field** (`athleteProfile.ts`, inside `AthleteProfilePayload`, near `favoriteSport`):

```ts
/** Preferences that seed map filters & game-match eligibility. Same labels as gamePreferenceOptions. */
gameMatchPreferences?: {
  ageRange?: string | null; // AGE_RANGE_OPTIONS label
  matchType?: string | null; // MATCH_TYPE_OPTIONS label (user's participation)
  skillLevel?: string | null; // LEVEL_OPTIONS label; if unset, derived from sportsSkills
};
```

- [ ] **Step 2: Default it** in `emptyAthleteProfile()` — add `gameMatchPreferences: undefined,`.

- [ ] **Step 3: Parse it** in `parseAthleteProfile` (build before the `return`, add to the returned object):

```ts
const gmpRaw = o.gameMatchPreferences && typeof o.gameMatchPreferences === "object"
  ? (o.gameMatchPreferences as Record<string, unknown>) : null;
const gameMatchPreferences = gmpRaw
  ? {
      ageRange: asStr(gmpRaw.ageRange),
      matchType: asStr(gmpRaw.matchType),
      skillLevel: asStr(gmpRaw.skillLevel),
    }
  : undefined;
```

Add `gameMatchPreferences,` to the returned object.

- [ ] **Step 4: Merge it** in `mergeAthleteProfile` (add to the returned object):

```ts
gameMatchPreferences:
  patch.gameMatchPreferences !== undefined
    ? { ...base.gameMatchPreferences, ...patch.gameMatchPreferences }
    : base.gameMatchPreferences,
```

- [ ] **Step 5: Add the identity-tab UI** (`ProfileEditSheet.tsx`, inside `editTab === "identity"`, after the Manifesto block at `:480`). Import canonical options at top: `import { AGE_RANGE_OPTIONS, MATCH_TYPE_OPTIONS, LEVEL_OPTIONS } from "../../../lib/gamePreferenceOptions";`

```tsx
<div className="space-y-3 px-1 pt-2 border-t border-white/5">
  <div className="space-y-1">
    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Game matching</Label>
    <p className="text-[10px] text-slate-500 leading-relaxed">Powers your map filter defaults and matches you to games. Optional.</p>
  </div>
  <div className="grid grid-cols-2 gap-4">
    <div className="space-y-2">
      <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Age bracket</Label>
      <Select
        value={draft.gameMatchPreferences?.ageRange ?? "Any"}
        onValueChange={(v) => setDraft((d) => ({ ...d, gameMatchPreferences: { ...d.gameMatchPreferences, ageRange: v === "Any" ? null : v } }))}
      >
        <SelectTrigger className="h-12 rounded-2xl bg-white/[0.03] border-white/5 text-white text-[11px] font-bold"><SelectValue /></SelectTrigger>
        <SelectContent className="bg-[#0D1117] border-white/10 rounded-2xl">
          {AGE_RANGE_OPTIONS.map((o) => (<SelectItem key={o} value={o} className="text-[11px] font-bold">{o}</SelectItem>))}
        </SelectContent>
      </Select>
    </div>
    <div className="space-y-2">
      <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Match type</Label>
      <Select
        value={draft.gameMatchPreferences?.matchType ?? "Any"}
        onValueChange={(v) => setDraft((d) => ({ ...d, gameMatchPreferences: { ...d.gameMatchPreferences, matchType: v === "Any" ? null : v } }))}
      >
        <SelectTrigger className="h-12 rounded-2xl bg-white/[0.03] border-white/5 text-white text-[11px] font-bold"><SelectValue /></SelectTrigger>
        <SelectContent className="bg-[#0D1117] border-white/10 rounded-2xl">
          {["Any", ...MATCH_TYPE_OPTIONS].map((o) => (<SelectItem key={o} value={o} className="text-[11px] font-bold">{o}</SelectItem>))}
        </SelectContent>
      </Select>
    </div>
  </div>
</div>
```

(Skill default is optional — `deriveDefaultFiltersFromProfile` already falls back to `sportsSkills`; add a third Select for `skillLevel` with `["Any", ...LEVEL_OPTIONS]` only if desired.)

- [ ] **Step 6: Verify** — `npx tsc --noEmit` clean. Manual: open Profile edit → Identity → set Age bracket + Match type → Save → reopen → values persist (round-trips through `parseAthleteProfile`).

---

### Task 6: Seed filters from profile once + persist applied filters (App.tsx)

**Files:**
- Modify: `src/app/App.tsx`

- [ ] **Step 1: Add storage helpers** near the top of `App.tsx` (module scope):

```ts
const APPLIED_FILTERS_KEY = "fun_applied_f_v1";
const FILTERS_SEEDED_KEY = "fun_applied_filters_seeded_v1";

function readPersistedFilters(): FiltersState | null {
  try {
    const raw = localStorage.getItem(APPLIED_FILTERS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<FiltersState>;
    return { ...DEFAULT_FILTERS, ...p, sports: Array.isArray(p.sports) ? p.sports : [] };
  } catch {
    return null;
  }
}
function persistAppliedFilters(f: FiltersState) {
  try { localStorage.setItem(APPLIED_FILTERS_KEY, JSON.stringify(f)); } catch { /* ignore */ }
}
```

- [ ] **Step 2: Restore on mount** — change the initial state (`App.tsx:93-94`) so persisted filters win on reload:

```ts
const [appliedFilters, setAppliedFilters] = useState<FiltersState>(() => readPersistedFilters() ?? DEFAULT_FILTERS);
const [filtersDraft, setFiltersDraft] = useState<FiltersState>(() => readPersistedFilters() ?? DEFAULT_FILTERS);
```

- [ ] **Step 3: Seed-once effect** (after `athleteProfile` is in scope, `:153`). Only seeds fields still at default and only if never seeded and no persisted override exists:

```ts
const filtersSeededRef = useRef(false);
useEffect(() => {
  if (filtersSeededRef.current) return;
  if (localStorage.getItem(FILTERS_SEEDED_KEY)) return;
  if (localStorage.getItem(APPLIED_FILTERS_KEY)) { filtersSeededRef.current = true; return; }
  const seed = deriveDefaultFiltersFromProfile(athleteProfile);
  if (Object.keys(seed).length === 0) return; // wait until profile prefs load
  filtersSeededRef.current = true;
  localStorage.setItem(FILTERS_SEEDED_KEY, "1");
  setAppliedFilters((prev) => {
    const next = { ...prev };
    // only fill fields the user hasn't already set away from default
    if (next.skillLevel === "Any" && seed.skillLevel) next.skillLevel = seed.skillLevel;
    if (next.ageRange === "Any" && seed.ageRange) next.ageRange = seed.ageRange;
    if (next.matchType === "Any" && seed.matchType) next.matchType = seed.matchType;
    persistAppliedFilters(next);
    return next;
  });
  setFiltersDraft((prev) => ({
    ...prev,
    skillLevel: prev.skillLevel === "Any" && seed.skillLevel ? seed.skillLevel : prev.skillLevel,
    ageRange: prev.ageRange === "Any" && seed.ageRange ? seed.ageRange : prev.ageRange,
    matchType: prev.matchType === "Any" && seed.matchType ? seed.matchType : prev.matchType,
  }));
}, [athleteProfile]);
```

- [ ] **Step 4: Verify** — Manual: clear both localStorage keys, set profile age/match prefs, reload → Filters Advanced pre-fills once. Change a filter + Apply → reload → your Apply persists (not re-seeded). `npx tsc --noEmit` clean.

---

### Task 7: Active filter pill (TopUI + App wiring)

**Files:**
- Modify: `src/app/components/TopUI.tsx`
- Modify: `src/app/App.tsx`

- [ ] **Step 1: Add props to `TopNavigationProps`** (`TopUI.tsx:67`): `activeFilterSummary?: string | null;` and `onClearFilters?: () => void;`. Destructure them alongside `onOpenFilters` (`:137`).

- [ ] **Step 2: Render the pill** next to the Filter button (`TopUI.tsx:412-421`), shown only when a summary exists. Min 44px hit area:

```tsx
{activeFilterSummary && (
  <button
    type="button"
    onClick={onClearFilters}
    aria-label="Clear all filters"
    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-primary/40 bg-[#0A0F1C]/90 px-3 text-xs font-medium text-slate-100 shadow-[var(--shadow-control)] backdrop-blur-xl"
  >
    <span className="max-w-[40vw] truncate">{activeFilterSummary}</span>
    <X className="w-3.5 h-3.5 shrink-0 text-slate-400" />
  </button>
)}
```

(`X` is already imported in TopUI `:2`.)

- [ ] **Step 3: Compute the summary in App** and pass it. Near `displayGames`:

```ts
const activeFilterSummary = useMemo(() => {
  const f = appliedFilters;
  const parts: string[] = [];
  if (f.sports.length) parts.push(f.sports.join(", "));
  if (effectiveGamesRadiusKm !== DEFAULT_FILTERS.gamesRadiusKm) parts.push(`${effectiveGamesRadiusKm} km`);
  if (f.skillLevel && f.skillLevel !== "Any") parts.push(f.skillLevel);
  if (f.ageRange && f.ageRange !== "Any") parts.push(f.ageRange);
  if (f.matchType && f.matchType !== "Any") parts.push(f.matchType);
  return parts.length ? parts.join(" · ") : null;
}, [appliedFilters, effectiveGamesRadiusKm]);
```

Wire on `<TopNavigation>` (`App.tsx:657`):

```tsx
activeFilterSummary={activeFilterSummary}
onClearFilters={() => {
  setFiltersDraft(DEFAULT_FILTERS);
  setAppliedFilters(DEFAULT_FILTERS);
  setSportExtendRadius(null);
  sportExtendSessionRef.current = sportFocus?.sport ?? null;
  persistAppliedFilters(DEFAULT_FILTERS);
  setFilterApplySync(true);
  filterApplyStartedAtRef.current = Date.now();
}}
```

- [ ] **Step 4: Verify** — Manual: apply any non-default filter → pill appears with summary; tap × → all pins/radii reset to default; `npx tsc --noEmit` clean.

---

### Task 8: Empty-state banner when filters hide everything

**Files:**
- Modify: `src/app/App.tsx`

- [ ] **Step 1: Dismiss state keyed by filter signature** (re-shows when filters change):

```ts
const [emptyBannerDismissedSig, setEmptyBannerDismissedSig] = useState<string | null>(null);
const filtersSig = useMemo(
  () => JSON.stringify([appliedFilters, effectiveGamesRadiusKm]),
  [appliedFilters, effectiveGamesRadiusKm]
);
const showEmptyFiltersBanner =
  displayGames.length === 0 && games.length > 0 && emptyBannerDismissedSig !== filtersSig;
```

- [ ] **Step 2: Render the banner** inside the BottomCarousel wrapper (`App.tsx:714`, above `<BottomCarousel>`), with `pointer-events-auto`:

```tsx
{showEmptyFiltersBanner && (
  <div className="pointer-events-auto mx-3 mb-2 rounded-2xl border border-amber-400/30 bg-[#0A0F1C]/95 px-4 py-3 text-sm text-slate-100 shadow-[var(--shadow-control)] backdrop-blur-xl">
    <p className="mb-2">No games match your filters. Widen the radius or clear advanced filters.</p>
    <div className="flex gap-2">
      <button type="button" className="min-h-[36px] rounded-full border border-white/15 px-3 text-xs font-medium"
        onClick={() => {
          const next = { ...appliedFilters, gamesRadiusKm: 25 };
          setAppliedFilters(next); setFiltersDraft(next); setSportExtendRadius(null);
          persistAppliedFilters(next);
        }}>Widen to 25 km</button>
      <button type="button" className="min-h-[36px] rounded-full border border-white/15 px-3 text-xs font-medium"
        onClick={() => {
          const next = { ...appliedFilters, skillLevel: "Any", ageRange: "Any", matchType: "Any" };
          setAppliedFilters(next); setFiltersDraft(next); persistAppliedFilters(next);
        }}>Clear advanced</button>
      <button type="button" className="min-h-[36px] rounded-full px-3 text-xs text-slate-400"
        onClick={() => setEmptyBannerDismissedSig(filtersSig)}>Dismiss</button>
    </div>
  </div>
)}
```

- [ ] **Step 3: Verify** — Manual: tighten filters until 0 pins (with games present) → banner shows; "Widen to 25 km" / "Clear advanced" restore pins; Dismiss hides until filters change. `npx tsc --noEmit` clean.

---

### Task 9 (optional): Vitest unit tests for `gameFilters.ts`

Only do this if Vitest installs cleanly/quickly (iCloud-Desktop I/O is slow — see Task 10 notes). Otherwise rely on the Task 10 manual checklist.

**Files:**
- Create: `src/app/lib/gameFilters.test.ts`

- [ ] **Step 1: Add dev dep + script.** `npm i -D vitest`; add `"test": "vitest run"` to `package.json` scripts.

- [ ] **Step 2: Write the tests:**

```ts
import { describe, it, expect } from "vitest";
import { parseRequirements, gameMatchesFilters } from "./gameFilters";
import { DEFAULT_FILTERS, type FiltersState } from "../components/FiltersModal";
import type { GameRow } from "../../lib/supabase";

const game = (sport: string, req: Record<string, unknown> | null): GameRow =>
  ({ id: "x", sport, requirements: req } as unknown as GameRow);
const f = (p: Partial<FiltersState>): FiltersState => ({ ...DEFAULT_FILTERS, ...p });

describe("inclusive matching", () => {
  it("no requirements always shows", () => {
    expect(gameMatchesFilters(game("Soccer", null), f({ skillLevel: "Advanced", ageRange: "45+", matchType: "Women's" }))).toBe(true);
  });
  it("skill equality hides specific mismatch", () => {
    expect(gameMatchesFilters(game("Soccer", { skillLevel: "Advanced" }), f({ skillLevel: "Intermediate" }))).toBe(false);
    expect(gameMatchesFilters(game("Soccer", { skillLevel: "Intermediate" }), f({ skillLevel: "Intermediate" }))).toBe(true);
  });
  it("age overlap", () => {
    expect(gameMatchesFilters(game("Soccer", { ageRange: "18–24" }), f({ ageRange: "25–34" }))).toBe(false);
    expect(gameMatchesFilters(game("Soccer", { ageRange: "25–34" }), f({ ageRange: "25–34" }))).toBe(true);
  });
  it("match type equality, Co-ed only for Co-ed/Any", () => {
    expect(gameMatchesFilters(game("Soccer", { matchType: "Men's" }), f({ matchType: "Women's" }))).toBe(false);
    expect(gameMatchesFilters(game("Soccer", { matchType: "Co-ed" }), f({ matchType: "Any" }))).toBe(true);
  });
  it("legacy age label treated as pass via normalize", () => {
    expect(parseRequirements({ ageRange: "18-25" }).ageRange).toBe("18–24");
  });
  it("sports allow-list is case-insensitive", () => {
    expect(gameMatchesFilters(game("basketball", null), f({ sports: ["Basketball"] }))).toBe(true);
    expect(gameMatchesFilters(game("Soccer", null), f({ sports: ["Basketball"] }))).toBe(false);
  });
});
```

- [ ] **Step 3:** Run `npx vitest run` → all pass.

---

### Task 10: Verification, review, commit

**Files:** none (verification only)

- [ ] **Step 1: Typecheck** — from `Redesign FUN sports map/`: `npx tsc --noEmit` → zero errors (project's existing gate).
- [ ] **Step 2: Unit tests** (if Task 9 done) — `npx vitest run` → green.
- [ ] **Step 3: Manual checklist** (run `npm run dev`; use the `window.__FUN_MAP__` DEV handle + DevTools Network):
  - [ ] Games radius 5 km → Apply → `get_games_nearby` request body shows `radius_km: 5` → fewer pins.
  - [ ] Skill=Intermediate → Advanced-only games hide; no-requirement games stay.
  - [ ] Match type=Women's → Men's-only hide; Co-ed/Any stay.
  - [ ] Age=25–34 → 18–24-only games hide; overlapping/none stay.
  - [ ] Clear (modal + pill ×) restores all pins and default radii.
  - [ ] Profile age/match saved → fresh visit (cleared seed keys) pre-fills Advanced once; subsequent Apply persists.
  - [ ] Active pill shows summary + × clears.
  - [ ] **Regression:** search Basketball → open Filters, set 10 km, Apply → does NOT bounce to 120 km until Clear or new search.
  - [ ] Live preview footer count tracks the draft as you change selects.
  - [ ] Empty-state banner appears only when filters hide all games; actions recover.
  - [ ] `prefers-reduced-motion` respected (no added pulsing on pill/banner).
- [ ] **Step 4: Review** — run `/code-review` on the diff; address findings (esp. immutability of `appliedFilters`, effect dep arrays, en-dash correctness).
- [ ] **Step 5: Commit** (only when the user asks; branch off main if needed):

```bash
git add -A
git commit -m "fix: wire map filters to games radius and requirements matching"
```

---

## Self-review (author checklist — completed)

- **Spec coverage:** Bug 1 → Task 3; Bug 2 → Task 4; Bug 3 (en-dash/Competitive) → Tasks 1-2; Bug 4 (matchType) → Tasks 2,4,5. Single brain → Task 3/6. Pure utility → Task 1. Profile fields → Task 5. Seed-once + persist → Task 6. displayGames → Task 4. sportFocus auto-extend → Task 3. FiltersModal UX + preview → Task 2. Active pill → Task 7. Empty state → Task 8. RPC verify → Pre-flight (PASSED). Out-of-scope items excluded.
- **Type consistency:** `FiltersState.matchType` added in Task 2 and consumed in Tasks 1/3/4/7/8. `gameMatchPreferences` added in Task 5, consumed by `deriveDefaultFiltersFromProfile` (Task 1) + seed (Task 6). `effectiveGamesRadiusKm`/`sportExtendRadius`/`sportExtendSessionRef`/`persistAppliedFilters`/`filtersPreviewCount`/`activeFilterSummary` are each defined once and reused consistently.
- **Deferred:** venue count in live preview (games-only ships; `previewVenueCount` optional) — avoids touching the fragile `MapboxMap`.
