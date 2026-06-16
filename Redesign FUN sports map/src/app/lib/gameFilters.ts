/** Pure, client-side game-visibility matching for map filters (Approach A: "filter trust"). */
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
 * Inclusive matching: a game shows unless its explicit requirement conflicts with an
 * active (non-"Any") filter. Sports use game.sport; skill/age/matchType use requirements.
 * Games with missing/"Any"/unknown requirements always pass.
 */
export function gameMatchesFilters(game: GameRow, filters: FiltersState): boolean {
  // Sports: explicit allow-list (game.sport is always present). Empty list = all sports.
  if (filters.sports.length > 0) {
    const allow = new Set(filters.sports.map((s) => s.toLowerCase()));
    if (!allow.has((game.sport ?? "").toLowerCase())) return false;
  }

  const req = parseRequirements(game.requirements);

  // Skill: equality (not a hierarchy) — filter "Intermediate" hides "Advanced"-only games.
  if (!isAnyPreference(filters.skillLevel) && !isAnyPreference(req.skillLevel)) {
    if (req.skillLevel !== filters.skillLevel) return false;
  }
  // Age: inclusive bucket overlap.
  if (!isAnyPreference(filters.ageRange) && !isAnyPreference(req.ageRange)) {
    if (!ageRangesOverlap(filters.ageRange, req.ageRange)) return false;
  }
  // Match type: equality — a Co-ed game shows only for Co-ed/Any filters (filter = "format I want").
  if (!isAnyPreference(filters.matchType) && !isAnyPreference(req.matchType)) {
    if (req.matchType !== filters.matchType) return false;
  }
  return true;
}

/** Count games passing the filters (used for the live preview footer). */
export function countMatchingGames(games: GameRow[], filters: FiltersState): number {
  let n = 0;
  for (const g of games) if (gameMatchesFilters(g, filters)) n++;
  return n;
}

/**
 * Map visibility (System C) — who may SEE a game pin. Mirrors the server's
 * `is_eligible_to_join_game` for display purposes:
 *   - `public` (or missing/legacy) → shown to everyone.
 *   - host → always sees their own game.
 *   - `friends_only` → shown if the viewer follows the host. The client only
 *     knows its own-direction follows (`followedIds`); the server enforces the
 *     full either-direction-follow / approved-invite rule when actually joining.
 *   - `invite_only` → not publicly discoverable; only the host sees it on the
 *     map (approved invites aren't known client-side; the redeem-link flow
 *     handles access separately).
 * Inclusive by default: a null/unknown visibility is treated as `public` so
 * legacy games are never hidden.
 */
export function gameVisibleToViewer(
  game: GameRow,
  currentUserId: string | null,
  followedIds: Set<string>
): boolean {
  const vis = game.visibility ?? "public";
  if (vis === "public") return true;
  const host = game.created_by ?? null;
  if (host && currentUserId && host === currentUserId) return true;
  if (vis === "friends_only") return !!host && followedIds.has(host);
  // invite_only: host-only on the map.
  return false;
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
