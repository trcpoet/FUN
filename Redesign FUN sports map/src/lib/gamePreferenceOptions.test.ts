import { describe, it, expect } from "vitest";
import type { GameVisibility } from "./supabase";
import {
  LEVEL_OPTIONS,
  AGE_RANGE_OPTIONS,
  MATCH_TYPE_OPTIONS,
  VISIBILITY_OPTIONS,
  emptyGameRequirements,
  visibilityLabelToEnum,
  visibilityEnumToLabel,
  isAnyPreference,
  normalizeAgeRange,
  ageRangesOverlap,
  MIN_DURATION_MIN,
  MAX_DURATION_MIN,
  durationPresetsForSport,
  defaultDurationForSport,
  formatDurationLabel,
} from "./gamePreferenceOptions.ts";

// NOTE: This module is pure logic. It does NOT touch localStorage and never
// calls Date.now(), so no localStorage.clear() beforeEach and no fake timers
// are required here. The en-dash strings below are the literal U+2013 "–"
// character (the canonical bucket labels), deliberately distinct from the
// ASCII hyphen "-" used by the legacy aliases.

describe("option constant arrays", () => {
  it("expose the exact UI option lists", () => {
    expect(LEVEL_OPTIONS).toEqual(["Any", "Beginner", "Intermediate", "Advanced", "Competitive"]);
    expect(AGE_RANGE_OPTIONS).toEqual(["Any", "13–17", "18–24", "25–34", "35–44", "45+"]);
    expect(MATCH_TYPE_OPTIONS).toEqual(["Co-ed", "Same gender"]);
    expect(VISIBILITY_OPTIONS).toEqual(["Public (Map)", "Friends Only", "Invite Only"]);
  });
});

describe("emptyGameRequirements", () => {
  it("returns the neutral defaults", () => {
    expect(emptyGameRequirements()).toEqual({
      skillLevel: "Any",
      ageRange: "Any",
      matchType: "Co-ed",
      visibility: "Public (Map)",
      school: "",
    });
  });

  it("returns a fresh object each call (not a shared reference)", () => {
    const a = emptyGameRequirements();
    const b = emptyGameRequirements();
    expect(a).not.toBe(b);
  });
});

describe("visibilityLabelToEnum", () => {
  it("maps each known label to its DB enum", () => {
    expect(visibilityLabelToEnum("Friends Only")).toBe("friends_only");
    expect(visibilityLabelToEnum("Invite Only")).toBe("invite_only");
    expect(visibilityLabelToEnum("Public (Map)")).toBe("public");
  });

  it("trims surrounding whitespace before matching", () => {
    expect(visibilityLabelToEnum("  Friends Only  ")).toBe("friends_only");
  });

  it("falls back to public for empty, null, undefined, and unknown labels", () => {
    expect(visibilityLabelToEnum("")).toBe("public");
    expect(visibilityLabelToEnum(null)).toBe("public");
    expect(visibilityLabelToEnum(undefined)).toBe("public");
    expect(visibilityLabelToEnum("Something Else")).toBe("public");
  });
});

describe("visibilityEnumToLabel", () => {
  it("maps each known enum to its UI label", () => {
    expect(visibilityEnumToLabel("friends_only")).toBe("Friends Only");
    expect(visibilityEnumToLabel("invite_only")).toBe("Invite Only");
    expect(visibilityEnumToLabel("public")).toBe("Public (Map)");
  });

  it("falls back to the public label for null and undefined", () => {
    expect(visibilityEnumToLabel(null)).toBe("Public (Map)");
    expect(visibilityEnumToLabel(undefined)).toBe("Public (Map)");
  });

  it("falls back to the public label for an unrecognized enum value", () => {
    // Out-of-union value exercises the default branch.
    expect(visibilityEnumToLabel("bogus" as GameVisibility)).toBe("Public (Map)");
  });
});

describe("visibility round-trip", () => {
  it("label -> enum -> label is stable for all three canonical labels", () => {
    for (const label of VISIBILITY_OPTIONS) {
      expect(visibilityEnumToLabel(visibilityLabelToEnum(label))).toBe(label);
    }
  });

  it("enum -> label -> enum is stable for all three enum values", () => {
    const enums: GameVisibility[] = ["public", "friends_only", "invite_only"];
    for (const value of enums) {
      expect(visibilityLabelToEnum(visibilityEnumToLabel(value))).toBe(value);
    }
  });
});

describe("isAnyPreference", () => {
  it("treats empty, null, and undefined as 'any'", () => {
    expect(isAnyPreference("")).toBe(true);
    expect(isAnyPreference(null)).toBe(true);
    expect(isAnyPreference(undefined)).toBe(true);
  });

  it("treats the literal 'Any' case-insensitively and after trimming", () => {
    expect(isAnyPreference("Any")).toBe(true);
    expect(isAnyPreference("any")).toBe(true);
    expect(isAnyPreference("ANY")).toBe(true);
    expect(isAnyPreference("  Any  ")).toBe(true);
  });

  it("treats a concrete constraint as not-any", () => {
    expect(isAnyPreference("Beginner")).toBe(false);
    expect(isAnyPreference("18–24")).toBe(false);
    expect(isAnyPreference("anybody")).toBe(false);
  });
});

describe("normalizeAgeRange", () => {
  it("maps empty/null/undefined and 'any' variants to 'Any'", () => {
    expect(normalizeAgeRange("")).toBe("Any");
    expect(normalizeAgeRange(null)).toBe("Any");
    expect(normalizeAgeRange(undefined)).toBe("Any");
    expect(normalizeAgeRange("Any")).toBe("Any");
    expect(normalizeAgeRange("  any  ")).toBe("Any");
  });

  it("passes canonical en-dash buckets through unchanged", () => {
    expect(normalizeAgeRange("13–17")).toBe("13–17");
    expect(normalizeAgeRange("18–24")).toBe("18–24");
    expect(normalizeAgeRange("25–34")).toBe("25–34");
    expect(normalizeAgeRange("35–44")).toBe("35–44");
    expect(normalizeAgeRange("45+")).toBe("45+");
  });

  it("remaps legacy hyphen aliases onto canonical en-dash buckets", () => {
    // Old bucket boundaries collapse onto the current canonical buckets.
    expect(normalizeAgeRange("18-25")).toBe("18–24");
    expect(normalizeAgeRange("26-35")).toBe("25–34");
    expect(normalizeAgeRange("36-45")).toBe("35–44");
    expect(normalizeAgeRange("46+")).toBe("45+");
    // Hyphen variants that share the same numbers as canonical buckets.
    expect(normalizeAgeRange("13-17")).toBe("13–17");
    expect(normalizeAgeRange("18-24")).toBe("18–24");
    expect(normalizeAgeRange("25-34")).toBe("25–34");
    expect(normalizeAgeRange("35-44")).toBe("35–44");
  });

  it("trims before matching but does not otherwise reformat", () => {
    expect(normalizeAgeRange("  18–24  ")).toBe("18–24");
    expect(normalizeAgeRange("  18-25  ")).toBe("18–24");
  });

  it("returns null for unrecognized labels", () => {
    expect(normalizeAgeRange("99-100")).toBeNull();
    expect(normalizeAgeRange("teenager")).toBeNull();
    expect(normalizeAgeRange("18—24")).toBeNull(); // em-dash (U+2014), not the canonical en-dash
  });
});

describe("ageRangesOverlap", () => {
  it("returns true for a bucket overlapping itself (inclusive endpoints)", () => {
    expect(ageRangesOverlap("18–24", "18–24")).toBe(true);
    expect(ageRangesOverlap("45+", "45+")).toBe(true);
  });

  it("returns false for adjacent, non-overlapping canonical buckets", () => {
    // [18,24] and [25,34] touch but share no age.
    expect(ageRangesOverlap("18–24", "25–34")).toBe(false);
    expect(ageRangesOverlap("13–17", "18–24")).toBe(false);
    // 44 and 45 are adjacent, not overlapping.
    expect(ageRangesOverlap("35–44", "45+")).toBe(false);
  });

  it("returns true when one bucket fully spans the other", () => {
    // 45+ is [45,200]; picks up everything at or above 45.
    expect(ageRangesOverlap("45+", "45+")).toBe(true);
  });

  it("normalizes legacy aliases before comparing", () => {
    // "26-35" -> "25–34", disjoint from "18–24".
    expect(ageRangesOverlap("26-35", "18–24")).toBe(false);
    // "18-25" -> "18–24", overlaps itself.
    expect(ageRangesOverlap("18-25", "18–24")).toBe(true);
  });

  it("passes (returns true) when either bucket is unknown or 'Any'", () => {
    // "Any" normalizes to "Any", which is not a numeric bucket -> pass.
    expect(ageRangesOverlap("Any", "18–24")).toBe(true);
    expect(ageRangesOverlap("18–24", "Any")).toBe(true);
    // Unrecognized -> normalizeAgeRange null -> pass.
    expect(ageRangesOverlap("gibberish", "18–24")).toBe(true);
    expect(ageRangesOverlap("18–24", "nonsense")).toBe(true);
    expect(ageRangesOverlap("", "")).toBe(true);
  });
});

describe("duration bounds", () => {
  it("exposes the DB-aligned min/max minutes", () => {
    expect(MIN_DURATION_MIN).toBe(15);
    expect(MAX_DURATION_MIN).toBe(480);
  });
});

describe("durationPresetsForSport", () => {
  it("applies tuned overrides keyed on mapboxSuffix", () => {
    expect(durationPresetsForSport("Basketball")).toEqual([60, 90, 120]);
    expect(durationPresetsForSport("Soccer")).toEqual([60, 90, 120]);
    expect(durationPresetsForSport("Football")).toEqual([90, 120, 180]);
    expect(durationPresetsForSport("Baseball")).toEqual([120, 150, 180]);
    expect(durationPresetsForSport("Softball")).toEqual([120, 150, 180]);
    expect(durationPresetsForSport("Cricket")).toEqual([120, 150, 180]);
    expect(durationPresetsForSport("Running")).toEqual([30, 45, 60]);
    expect(durationPresetsForSport("Endurance")).toEqual([30, 45, 60]);
    expect(durationPresetsForSport("Speed")).toEqual([30, 45, 60]);
  });

  it("resolves the sport via aliases before applying the override", () => {
    // "hoops" is a Basketball alias; still hits the basketball override.
    expect(durationPresetsForSport("hoops")).toEqual([60, 90, 120]);
  });

  it("falls back to the category default when no tuned override matches", () => {
    // Tennis is category "court" -> [60, 90] (no per-sport override).
    expect(durationPresetsForSport("Tennis")).toEqual([60, 90]);
    // Yoga is category "fitness" -> [30, 45, 60].
    expect(durationPresetsForSport("Yoga")).toEqual([30, 45, 60]);
    // Chess is category "mind" -> [30, 60, 90].
    expect(durationPresetsForSport("Chess")).toEqual([30, 60, 90]);
  });

  it("shows the override diverging from the shared category default", () => {
    // Basketball and Tennis are both "court"; the basketball override differs.
    expect(durationPresetsForSport("Basketball")).not.toEqual(durationPresetsForSport("Tennis"));
    // Baseball and Softball are both "field"; the field default is [90,120,180]
    // but the override for these is [120,150,180].
    expect(durationPresetsForSport("Baseball")).not.toEqual([90, 120, 180]);
  });

  it("returns the generic [60,90,120] default for unknown/null/undefined sports", () => {
    expect(durationPresetsForSport(null)).toEqual([60, 90, 120]);
    expect(durationPresetsForSport(undefined)).toEqual([60, 90, 120]);
    expect(durationPresetsForSport("totally-not-a-sport")).toEqual([60, 90, 120]);
  });
});

describe("defaultDurationForSport", () => {
  it("returns the SECOND preset (index 1), not the first", () => {
    // [60,90,120] -> 90
    expect(defaultDurationForSport("Basketball")).toBe(90);
    // [90,120,180] -> 120
    expect(defaultDurationForSport("Football")).toBe(120);
    // [120,150,180] -> 150
    expect(defaultDurationForSport("Baseball")).toBe(150);
    // [30,45,60] -> 45
    expect(defaultDurationForSport("Running")).toBe(45);
    // [60,90] -> 90
    expect(defaultDurationForSport("Tennis")).toBe(90);
  });

  it("defaults to 90 for unknown/null/undefined sports (generic presets index 1)", () => {
    expect(defaultDurationForSport(null)).toBe(90);
    expect(defaultDurationForSport(undefined)).toBe(90);
    expect(defaultDurationForSport("totally-not-a-sport")).toBe(90);
  });
});

describe("formatDurationLabel", () => {
  it("renders sub-hour durations as 'N min'", () => {
    expect(formatDurationLabel(15)).toBe("15 min");
    expect(formatDurationLabel(30)).toBe("30 min");
    expect(formatDurationLabel(45)).toBe("45 min");
    expect(formatDurationLabel(59)).toBe("59 min");
    expect(formatDurationLabel(0)).toBe("0 min");
  });

  it("renders whole-hour durations as 'Nh'", () => {
    expect(formatDurationLabel(60)).toBe("1h");
    expect(formatDurationLabel(120)).toBe("2h");
    expect(formatDurationLabel(180)).toBe("3h");
    expect(formatDurationLabel(480)).toBe("8h");
  });

  it("renders hour-plus-minute durations as 'Nh Mm'", () => {
    expect(formatDurationLabel(75)).toBe("1h 15m");
    expect(formatDurationLabel(90)).toBe("1h 30m");
    expect(formatDurationLabel(150)).toBe("2h 30m");
  });
});
