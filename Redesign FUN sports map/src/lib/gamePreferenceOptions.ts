/** Options for optional "who should join" fields on create-game (not map filters). */

import type { GameVisibility } from "./supabase";

export const LEVEL_OPTIONS = ["Any", "Beginner", "Intermediate", "Advanced", "Competitive"] as const;
export const AGE_RANGE_OPTIONS = ["Any", "13–17", "18–24", "25–34", "35–44", "45+"] as const;
export const MATCH_TYPE_OPTIONS = ["Co-ed", "Men's", "Women's"] as const;
export const VISIBILITY_OPTIONS = ["Public (Map)", "Friends Only", "Invite Only"] as const;

export type VisibilityLabel = (typeof VISIBILITY_OPTIONS)[number];

export type GameRequirementsPayload = {
  skillLevel: string;
  ageRange: string;
  matchType: string;
  visibility: string;
  school: string;
};

export function emptyGameRequirements(): GameRequirementsPayload {
  return {
    skillLevel: "Any",
    ageRange: "Any",
    matchType: "Co-ed",
    visibility: "Public (Map)",
    school: "",
  };
}

/** Map the human-readable label used in the UI to the DB enum value. */
export function visibilityLabelToEnum(label: string | null | undefined): GameVisibility {
  switch ((label ?? "").trim()) {
    case "Friends Only":
      return "friends_only";
    case "Invite Only":
      return "invite_only";
    case "Public (Map)":
    default:
      return "public";
  }
}

export function visibilityEnumToLabel(value: GameVisibility | null | undefined): VisibilityLabel {
  switch (value) {
    case "friends_only":
      return "Friends Only";
    case "invite_only":
      return "Invite Only";
    case "public":
    default:
      return "Public (Map)";
  }
}

/** True when a preference value means "no constraint" (null/empty/"Any"). */
export function isAnyPreference(v: string | null | undefined): boolean {
  const s = (v ?? "").trim();
  return s === "" || s.toLowerCase() === "any";
}

/** Inclusive [minAge, maxAge] for each canonical AGE_RANGE_OPTIONS bucket (en-dash labels). */
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

/** Allowed game durations (minutes). Used by sliders + the DB check_constraint. */
export const MIN_DURATION_MIN = 15;
export const MAX_DURATION_MIN = 480;

/** Sport-aware preset chips for the create-game Duration field. */
export function durationPresetsForSport(sport: string | null | undefined): number[] {
  const s = (sport ?? "").trim().toLowerCase();
  if (s === "basketball" || s === "soccer") return [60, 90, 120];
  if (s === "football" || s === "american football") return [90, 120, 180];
  if (s === "volleyball" || s === "tennis" || s === "table tennis" || s === "badminton") return [60, 90];
  if (s === "running" || s === "jogging" || s === "track") return [30, 45, 60];
  if (s === "baseball" || s === "softball" || s === "cricket") return [120, 150, 180];
  if (s === "hockey" || s === "ice hockey" || s === "field hockey") return [60, 90, 120];
  if (s === "yoga" || s === "pilates" || s === "stretching") return [30, 45, 60];
  if (s === "cycling" || s === "climbing" || s === "hiking") return [60, 90, 120];
  return [60, 90, 120];
}

/** Recommended default duration for a sport (matches first preset). */
export function defaultDurationForSport(sport: string | null | undefined): number {
  return durationPresetsForSport(sport)[1] ?? 90;
}

/** Compact "1h 30m" / "2h" / "45 min" format for the chip + slider readout. */
export function formatDurationLabel(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
