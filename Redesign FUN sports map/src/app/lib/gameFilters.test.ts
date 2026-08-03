import { describe, it, expect } from "vitest";
import {
  parseRequirements,
  gameMatchesFilters,
  countMatchingGames,
  gameVisibleToViewer,
  mapSportSkillLevelToFilterLevel,
  deriveDefaultFiltersFromProfile,
} from "./gameFilters";
// Type-only imports: these are erased at runtime, so they do NOT pull in the
// FiltersModal React component or the Supabase client / athleteProfile runtime.
import type { GameRow } from "../../lib/supabase";
import type { FiltersState } from "../components/FiltersModal";
import type { AthleteProfilePayload } from "../../lib/athleteProfile";

// --- fixtures -------------------------------------------------------------

// GameRow has many required fields; we only care about a handful for filtering.
// Casting a Partial keeps the fixtures minimal while satisfying strict TS.
function makeGame(o: Partial<GameRow>): GameRow {
  return o as GameRow;
}

const BASE_FILTERS: FiltersState = {
  sports: [],
  gamesRadiusKm: 15,
  venueRadiusKm: 15,
  athletesRadiusKm: 10,
  skillLevel: "Any",
  ageRange: "Any",
  matchType: "Any",
};

function makeFilters(o: Partial<FiltersState>): FiltersState {
  return { ...BASE_FILTERS, ...o };
}

// =========================================================================
// parseRequirements
// =========================================================================
describe("parseRequirements", () => {
  it("returns all-Any for null", () => {
    expect(parseRequirements(null)).toEqual({
      skillLevel: "Any",
      matchType: "Any",
      ageRange: "Any",
    });
  });

  it("returns all-Any for undefined", () => {
    expect(parseRequirements(undefined)).toEqual({
      skillLevel: "Any",
      matchType: "Any",
      ageRange: "Any",
    });
  });

  it("returns all-Any for a string (typeof is not 'object')", () => {
    // A malformed jsonb column stored as a bare string.
    const raw = "beginner" as unknown as GameRow["requirements"];
    expect(parseRequirements(raw)).toEqual({
      skillLevel: "Any",
      matchType: "Any",
      ageRange: "Any",
    });
  });

  it("returns all-Any for an array (object-typed but missing keys)", () => {
    // Arrays are typeof 'object', so they are accepted as the source object,
    // but none of the string keys resolve, so everything falls back to Any.
    const raw = ["Same gender", "Advanced"] as unknown as GameRow["requirements"];
    expect(parseRequirements(raw)).toEqual({
      skillLevel: "Any",
      matchType: "Any",
      ageRange: "Any",
    });
  });

  it("canonicalises valid skill / match / age values", () => {
    expect(
      parseRequirements({ skillLevel: "Intermediate", matchType: "Same gender", ageRange: "18–24" })
    ).toEqual({ skillLevel: "Intermediate", matchType: "Same gender", ageRange: "18–24" });
  });

  it("trims surrounding whitespace before matching canonical values", () => {
    expect(parseRequirements({ skillLevel: "  Advanced  ", matchType: "  Co-ed " })).toMatchObject({
      skillLevel: "Advanced",
      matchType: "Co-ed",
    });
  });

  it("maps unknown skill/match strings to Any", () => {
    expect(parseRequirements({ skillLevel: "Pro", matchType: "Mixed" })).toMatchObject({
      skillLevel: "Any",
      matchType: "Any",
    });
  });

  it("maps non-string values to Any", () => {
    const raw = { skillLevel: 3, matchType: true, ageRange: 25 } as unknown as GameRow["requirements"];
    expect(parseRequirements(raw)).toEqual({
      skillLevel: "Any",
      matchType: "Any",
      ageRange: "Any",
    });
  });

  it("normalises legacy hyphen age labels to canonical en-dash buckets", () => {
    expect(parseRequirements({ ageRange: "18-24" }).ageRange).toBe("18–24");
    expect(parseRequirements({ ageRange: "26-35" }).ageRange).toBe("25–34");
    expect(parseRequirements({ ageRange: "46+" }).ageRange).toBe("45+");
  });

  it("maps an unrecognised age bucket to Any", () => {
    expect(parseRequirements({ ageRange: "20-30" }).ageRange).toBe("Any");
  });
});

// =========================================================================
// gameMatchesFilters — sports
// =========================================================================
describe("gameMatchesFilters — sports", () => {
  it("passes any sport when the sports filter is empty", () => {
    expect(gameMatchesFilters(makeGame({ sport: "Soccer" }), makeFilters({ sports: [] }))).toBe(true);
  });

  it("matches sport case-insensitively", () => {
    expect(
      gameMatchesFilters(makeGame({ sport: "basketball" }), makeFilters({ sports: ["BASKETBALL"] }))
    ).toBe(true);
  });

  it("hides a game whose sport is not in the allow-list", () => {
    expect(
      gameMatchesFilters(makeGame({ sport: "Basketball" }), makeFilters({ sports: ["Soccer"] }))
    ).toBe(false);
  });

  it("treats a missing sport as empty string, so an active sport filter hides it", () => {
    // makeGame({}) leaves sport undefined; the code coalesces it to "".
    expect(gameMatchesFilters(makeGame({}), makeFilters({ sports: ["Soccer"] }))).toBe(false);
  });
});

// =========================================================================
// gameMatchesFilters — skill (equality, not hierarchy)
// =========================================================================
describe("gameMatchesFilters — skill", () => {
  it("passes when skill filter and requirement are equal", () => {
    const game = makeGame({ sport: "Soccer", requirements: { skillLevel: "Intermediate" } });
    expect(gameMatchesFilters(game, makeFilters({ skillLevel: "Intermediate" }))).toBe(true);
  });

  it("hides a higher-skill game (equality, NOT a hierarchy)", () => {
    // Filter Intermediate must hide an Advanced-only game.
    const game = makeGame({ sport: "Soccer", requirements: { skillLevel: "Advanced" } });
    expect(gameMatchesFilters(game, makeFilters({ skillLevel: "Intermediate" }))).toBe(false);
  });

  it("passes any skill when the filter is Any", () => {
    const game = makeGame({ sport: "Soccer", requirements: { skillLevel: "Advanced" } });
    expect(gameMatchesFilters(game, makeFilters({ skillLevel: "Any" }))).toBe(true);
  });

  it("passes a game with no skill requirement even under an active skill filter", () => {
    const game = makeGame({ sport: "Soccer", requirements: {} });
    expect(gameMatchesFilters(game, makeFilters({ skillLevel: "Advanced" }))).toBe(true);
  });

  it("passes a game with null requirements under an active skill filter", () => {
    const game = makeGame({ sport: "Soccer", requirements: null });
    expect(gameMatchesFilters(game, makeFilters({ skillLevel: "Advanced" }))).toBe(true);
  });
});

// =========================================================================
// gameMatchesFilters — age (inclusive bucket overlap)
// =========================================================================
describe("gameMatchesFilters — age", () => {
  it("passes when both age buckets are the same", () => {
    const game = makeGame({ sport: "Soccer", requirements: { ageRange: "25–34" } });
    expect(gameMatchesFilters(game, makeFilters({ ageRange: "25–34" }))).toBe(true);
  });

  it("hides a game whose age bucket does not overlap the filter", () => {
    const game = makeGame({ sport: "Soccer", requirements: { ageRange: "25–34" } });
    expect(gameMatchesFilters(game, makeFilters({ ageRange: "18–24" }))).toBe(false);
  });

  it("treats a legacy hyphen requirement as its canonical bucket for overlap", () => {
    // Requirement "18-24" normalises to "18–24", which overlaps the filter.
    const game = makeGame({ sport: "Soccer", requirements: { ageRange: "18-24" } });
    expect(gameMatchesFilters(game, makeFilters({ ageRange: "18–24" }))).toBe(true);
  });

  it("passes any age when the filter is Any", () => {
    const game = makeGame({ sport: "Soccer", requirements: { ageRange: "13–17" } });
    expect(gameMatchesFilters(game, makeFilters({ ageRange: "Any" }))).toBe(true);
  });

  it("passes a game with no age requirement under an active age filter", () => {
    const game = makeGame({ sport: "Soccer", requirements: {} });
    expect(gameMatchesFilters(game, makeFilters({ ageRange: "45+" }))).toBe(true);
  });
});

// =========================================================================
// gameMatchesFilters — match type (equality)
// =========================================================================
describe("gameMatchesFilters — match type", () => {
  it("passes when the match type equals the filter", () => {
    const game = makeGame({ sport: "Soccer", requirements: { matchType: "Co-ed" } });
    expect(gameMatchesFilters(game, makeFilters({ matchType: "Co-ed" }), "woman")).toBe(true);
  });

  it("hides a game whose match type differs from the filter", () => {
    const game = makeGame({ sport: "Soccer", requirements: { matchType: "Same gender" } });
    expect(gameMatchesFilters(game, makeFilters({ matchType: "Co-ed" }), "woman")).toBe(false);
  });

  it("passes any match type when the filter is Any", () => {
    const game = makeGame({ sport: "Soccer", requirements: { matchType: "Same gender" } });
    expect(gameMatchesFilters(game, makeFilters({ matchType: "Any" }), "woman")).toBe(true);
  });

  it("passes a game with no match-type requirement under an active filter", () => {
    const game = makeGame({ sport: "Soccer", requirements: {} });
    expect(gameMatchesFilters(game, makeFilters({ matchType: "Co-ed" }), "woman")).toBe(true);
  });

  // Retired options degrade to "Any" (= visible to everyone), which is exactly why
  // migration 20260801130000 rewrites those rows before this code ships.
  it("treats the retired Men's / Women's values as unconstrained", () => {
    for (const legacy of ["Men's", "Women's"]) {
      const game = makeGame({ sport: "Soccer", requirements: { matchType: legacy } });
      expect(parseRequirements(game.requirements).matchType).toBe("Any");
    }
  });

  // Defense in depth: the RPC already withholds these rows, but a viewer with no
  // gender must never render a gender-restricted game even if one slips through.
  it("hides same-gender games from a viewer with no gender on file", () => {
    const game = makeGame({ sport: "Soccer", requirements: { matchType: "Same gender" } });
    expect(gameMatchesFilters(game, makeFilters({ matchType: "Any" }), null)).toBe(false);
    expect(gameMatchesFilters(game, makeFilters({ matchType: "Same gender" }), null)).toBe(false);
  });

  it("shows same-gender games to a viewer who has a gender", () => {
    const game = makeGame({ sport: "Soccer", requirements: { matchType: "Same gender" } });
    expect(gameMatchesFilters(game, makeFilters({ matchType: "Same gender" }), "man")).toBe(true);
  });
});

// =========================================================================
// gameMatchesFilters — combined / all-pass
// =========================================================================
describe("gameMatchesFilters — combined", () => {
  it("passes a fully-Any game against fully-Any filters", () => {
    expect(gameMatchesFilters(makeGame({ sport: "Tennis" }), BASE_FILTERS)).toBe(true);
  });

  it("requires ALL active constraints to pass (one mismatch hides the game)", () => {
    const game = makeGame({
      sport: "Soccer",
      requirements: { skillLevel: "Intermediate", ageRange: "25–34", matchType: "Co-ed" },
    });
    // Sport, skill, match all agree; only the age bucket differs -> hidden.
    const filters = makeFilters({
      sports: ["Soccer"],
      skillLevel: "Intermediate",
      ageRange: "18–24",
      matchType: "Co-ed",
    });
    expect(gameMatchesFilters(game, filters)).toBe(false);
  });
});

// =========================================================================
// countMatchingGames
// =========================================================================
describe("countMatchingGames", () => {
  it("counts only games passing the filters", () => {
    const games = [
      makeGame({ sport: "Basketball" }),
      makeGame({ sport: "Soccer" }),
      makeGame({ sport: "basketball" }),
    ];
    expect(countMatchingGames(games, makeFilters({ sports: ["Basketball"] }))).toBe(2);
  });

  it("returns 0 for an empty list", () => {
    expect(countMatchingGames([], BASE_FILTERS)).toBe(0);
  });

  it("counts all games when filters are fully Any", () => {
    const games = [makeGame({ sport: "A" }), makeGame({ sport: "B" })];
    expect(countMatchingGames(games, BASE_FILTERS)).toBe(2);
  });
});

// =========================================================================
// gameVisibleToViewer
// =========================================================================
describe("gameVisibleToViewer", () => {
  const followed = new Set<string>(["host-1"]);

  it("shows public games to everyone", () => {
    const game = makeGame({ visibility: "public", created_by: "host-9" });
    expect(gameVisibleToViewer(game, "viewer-x", new Set())).toBe(true);
  });

  it("treats null visibility (legacy) as public", () => {
    const game = makeGame({ visibility: null, created_by: "host-9" });
    expect(gameVisibleToViewer(game, "viewer-x", new Set())).toBe(true);
  });

  it("treats missing visibility (undefined) as public", () => {
    const game = makeGame({ created_by: "host-9" });
    expect(gameVisibleToViewer(game, null, new Set())).toBe(true);
  });

  it("always shows the host their own friends_only game", () => {
    const game = makeGame({ visibility: "friends_only", created_by: "me" });
    expect(gameVisibleToViewer(game, "me", new Set())).toBe(true);
  });

  it("always shows the host their own invite_only game", () => {
    const game = makeGame({ visibility: "invite_only", created_by: "me" });
    expect(gameVisibleToViewer(game, "me", new Set())).toBe(true);
  });

  it("shows a friends_only game when the viewer follows the host", () => {
    const game = makeGame({ visibility: "friends_only", created_by: "host-1" });
    expect(gameVisibleToViewer(game, "viewer-x", followed)).toBe(true);
  });

  it("hides a friends_only game when the viewer does not follow the host", () => {
    const game = makeGame({ visibility: "friends_only", created_by: "host-2" });
    expect(gameVisibleToViewer(game, "viewer-x", followed)).toBe(false);
  });

  it("hides a friends_only game with a null host", () => {
    const game = makeGame({ visibility: "friends_only", created_by: null });
    expect(gameVisibleToViewer(game, "viewer-x", followed)).toBe(false);
  });

  it("shows a friends_only game to a signed-out viewer if the host is in followedIds", () => {
    // The friends branch checks only the set, independent of currentUserId.
    const game = makeGame({ visibility: "friends_only", created_by: "host-1" });
    expect(gameVisibleToViewer(game, null, followed)).toBe(true);
  });

  it("hides an invite_only game from a non-host viewer", () => {
    const game = makeGame({ visibility: "invite_only", created_by: "host-1" });
    expect(gameVisibleToViewer(game, "viewer-x", followed)).toBe(false);
  });

  it("hides an invite_only game from a signed-out viewer", () => {
    const game = makeGame({ visibility: "invite_only", created_by: "host-1" });
    expect(gameVisibleToViewer(game, null, new Set())).toBe(false);
  });
});

// =========================================================================
// mapSportSkillLevelToFilterLevel
// =========================================================================
describe("mapSportSkillLevelToFilterLevel", () => {
  it("maps each SportSkillEntry level to its filter label", () => {
    expect(mapSportSkillLevelToFilterLevel("casual")).toBe("Beginner");
    expect(mapSportSkillLevelToFilterLevel("intermediate")).toBe("Intermediate");
    expect(mapSportSkillLevelToFilterLevel("advanced")).toBe("Advanced");
    expect(mapSportSkillLevelToFilterLevel("competitive")).toBe("Competitive");
  });

  it("returns null for null / undefined", () => {
    expect(mapSportSkillLevelToFilterLevel(null)).toBeNull();
    expect(mapSportSkillLevelToFilterLevel(undefined)).toBeNull();
  });
});

// =========================================================================
// deriveDefaultFiltersFromProfile
// =========================================================================
describe("deriveDefaultFiltersFromProfile", () => {
  it("returns an empty object for null / undefined profile", () => {
    expect(deriveDefaultFiltersFromProfile(null)).toEqual({});
    expect(deriveDefaultFiltersFromProfile(undefined)).toEqual({});
  });

  it("uses an explicit skill preference when present and not Any", () => {
    const profile = {
      gameMatchPreferences: { skillLevel: "Advanced" },
    } as AthleteProfilePayload;
    expect(deriveDefaultFiltersFromProfile(profile)).toEqual({ skillLevel: "Advanced" });
  });

  it("falls back to the primary sport's skill when the explicit pref is Any", () => {
    const profile = {
      gameMatchPreferences: { skillLevel: "Any" },
      sportsSkills: [
        { sport: "soccer", level: "casual", primary: false },
        { sport: "hoops", level: "advanced", primary: true },
      ],
    } as AthleteProfilePayload;
    // Explicit "Any" is ignored; the primary-flagged skill (advanced) wins.
    expect(deriveDefaultFiltersFromProfile(profile)).toEqual({ skillLevel: "Advanced" });
  });

  it("derives skill from the first sport when no skill pref and no primary flag", () => {
    const profile = {
      sportsSkills: [
        { sport: "soccer", level: "competitive", primary: false },
        { sport: "hoops", level: "casual", primary: false },
      ],
    } as AthleteProfilePayload;
    expect(deriveDefaultFiltersFromProfile(profile)).toEqual({ skillLevel: "Competitive" });
  });

  it("omits skill when sportsSkills is empty and no explicit pref", () => {
    const profile = { sportsSkills: [] } as AthleteProfilePayload;
    expect(deriveDefaultFiltersFromProfile(profile)).toEqual({});
  });

  it("omits skill when the primary sport level is null (unmappable)", () => {
    const profile = {
      sportsSkills: [{ sport: "soccer", level: null, primary: true }],
    } as AthleteProfilePayload;
    expect(deriveDefaultFiltersFromProfile(profile)).toEqual({});
  });

  it("passes age and match-type preferences through WITHOUT normalising them", () => {
    const profile = {
      gameMatchPreferences: { ageRange: "18-24", matchType: "Co-ed" },
    } as AthleteProfilePayload;
    // Note: ageRange is NOT normalised here — the raw hyphen label passes through.
    expect(deriveDefaultFiltersFromProfile(profile)).toEqual({
      ageRange: "18-24",
      matchType: "Co-ed",
    });
  });

  it("omits age / match-type preferences that are Any", () => {
    const profile = {
      gameMatchPreferences: { ageRange: "Any", matchType: "Any", skillLevel: "Intermediate" },
    } as AthleteProfilePayload;
    expect(deriveDefaultFiltersFromProfile(profile)).toEqual({ skillLevel: "Intermediate" });
  });

  it("derives all three fields from explicit non-Any preferences", () => {
    const profile = {
      gameMatchPreferences: { skillLevel: "Intermediate", ageRange: "25–34", matchType: "Same gender" },
    } as AthleteProfilePayload;
    expect(deriveDefaultFiltersFromProfile(profile)).toEqual({
      skillLevel: "Intermediate",
      ageRange: "25–34",
      matchType: "Same gender",
    });
  });
});
