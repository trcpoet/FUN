import { describe, it, expect } from "vitest";
import {
  findSportSearchResults,
  findSportMatch,
  gameMatchesSport,
  gamesMatchingSport,
  countGamesForSport,
  closestGame,
} from "./sportSearch";
import type { GameRow } from "./supabase";

/**
 * All expected scores / matchKinds below are traced against the REAL
 * implementation in ./sportSearch.ts and the REAL catalog data in
 * ./sportsCatalog.ts (via ./sports.ts). singularize() and withinOneEdit()
 * are NOT exported, so they are exercised only indirectly through
 * findSportSearchResults() — see the notes returned by this task.
 */

// Minimal GameRow factory — only `sport` and `distance_km` are read by the
// module, but we supply every required (non-optional) field for strict typing.
function mkGame(sport: string, distance_km: number, id = `g-${Math.random()}`): GameRow {
  return {
    id,
    title: "test game",
    sport,
    spots_needed: 4,
    starts_at: null,
    created_by: null,
    created_at: "2026-07-23T00:00:00Z",
    distance_km,
    lat: 0,
    lng: 0,
  };
}

describe("findSportSearchResults — empty / too-short input", () => {
  it("returns [] for an empty string", () => {
    expect(findSportSearchResults("")).toEqual([]);
  });

  it("returns [] for a single character (normalized length < 2)", () => {
    expect(findSportSearchResults("a")).toEqual([]);
  });

  it("returns [] when only whitespace/punctuation survives normalization", () => {
    expect(findSportSearchResults("   ")).toEqual([]);
  });
});

describe("findSportSearchResults — exact matches", () => {
  it("whole-string exact match scores 200 with matchKind 'exact'", () => {
    const results = findSportSearchResults("basketball");
    expect(results[0]).toEqual({ sport: "Basketball", matchKind: "exact", score: 200 });
  });

  it("token-boundary exact match (sport appears as a whole token) scores 190", () => {
    const results = findSportSearchResults("pickup soccer game");
    expect(results[0]).toEqual({ sport: "Soccer", matchKind: "exact", score: 190 });
  });

  it("compact (spaces-removed) exact match scores 195 — 'pickle ball' -> Pickleball", () => {
    const results = findSportSearchResults("pickle ball");
    expect(results[0]).toEqual({ sport: "Pickleball", matchKind: "exact", score: 195 });
  });
});

describe("findSportSearchResults — alias matches", () => {
  it("whole-query alias 'bball' -> Basketball scores 120", () => {
    const results = findSportSearchResults("bball");
    expect(results[0]).toEqual({ sport: "Basketball", matchKind: "alias", score: 120 });
  });

  it("multi-word whole-query alias 'ping pong' -> Table Tennis scores 120", () => {
    const results = findSportSearchResults("ping pong");
    expect(results[0]).toEqual({ sport: "Table Tennis", matchKind: "alias", score: 120 });
  });

  // singularize() indirect coverage: token is pluralized, its SINGULAR form is
  // an alias, so it matches via the a2 (singularized-alias) branch at score 116.
  it("singularize 'ies'->'y': 'footies' -> 'footy' alias -> Soccer scores 116", () => {
    const results = findSportSearchResults("footies");
    expect(results[0]).toEqual({ sport: "Soccer", matchKind: "alias", score: 116 });
  });

  it("singularize 'es' strip: 'boxes' -> 'box' alias -> Boxing scores 116", () => {
    const results = findSportSearchResults("boxes");
    expect(results[0]).toEqual({ sport: "Boxing", matchKind: "alias", score: 116 });
  });

  it("singularize trailing 's' (not 'ss'): 'pools' -> 'pool' alias -> Swimming scores 116", () => {
    const results = findSportSearchResults("pools");
    expect(results[0]).toEqual({ sport: "Swimming", matchKind: "alias", score: 116 });
  });
});

describe("findSportSearchResults — prefix matches", () => {
  it("raw starts with full sport label ('golfing' -> Golf) scores 150", () => {
    const results = findSportSearchResults("golfing");
    expect(results[0]).toEqual({ sport: "Golf", matchKind: "prefix", score: 150 });
  });

  it("token is a prefix of the sport label ('basket' -> Basketball) scores 140", () => {
    const results = findSportSearchResults("basket");
    expect(results[0]).toEqual({ sport: "Basketball", matchKind: "prefix", score: 140 });
  });
});

describe("findSportSearchResults — contains match", () => {
  it("sport label contains the query but no prefix/exact ('occer' -> Soccer) scores 110", () => {
    const results = findSportSearchResults("occer");
    expect(results[0]).toEqual({ sport: "Soccer", matchKind: "contains", score: 110 });
  });
});

describe("findSportSearchResults — typo / withinOneEdit coverage", () => {
  it("insertion typo 'tennnis' -> Tennis scores 70 ('typos'); Table Tennis part-match scores 65", () => {
    const results = findSportSearchResults("tennnis");
    expect(results[0]).toEqual({ sport: "Tennis", matchKind: "typos", score: 70 });
    // Multi-word part typo path: matches the "tennis" word inside "table tennis".
    const tableTennis = results.find((r) => r.sport === "Table Tennis");
    expect(tableTennis).toEqual({ sport: "Table Tennis", matchKind: "typos", score: 65 });
    // Ranking: higher score first.
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it("substitution typo 'soccor' -> Soccer scores 70 ('typos')", () => {
    const results = findSportSearchResults("soccor");
    expect(results[0]).toEqual({ sport: "Soccer", matchKind: "typos", score: 70 });
  });

  it("deletion typo 'tenis' -> Tennis scores 70 ('typos')", () => {
    const results = findSportSearchResults("tenis");
    expect(results[0]).toEqual({ sport: "Tennis", matchKind: "typos", score: 70 });
  });

  it("transposition is NOT within one edit (standard Levenshtein): 'tennsi' does not match Tennis", () => {
    // withinOneEdit counts an adjacent swap as 2 edits, so no Tennis 'typos' hit.
    const results = findSportSearchResults("tennsi");
    expect(results.some((r) => r.sport === "Tennis")).toBe(false);
  });
});

describe("findSportSearchResults — no match & ranking/limits", () => {
  it("returns [] for gibberish with no alias/prefix/contains/typo match", () => {
    expect(findSportSearchResults("zzzzz")).toEqual([]);
  });

  it("respects the default maxResults of 6 and ranks equal-score matches in catalog order", () => {
    const results = findSportSearchResults("ball");
    expect(results).toHaveLength(6);
    // Every 'ball'-containing sport matches via 'contains' at 110.
    expect(results.every((r) => r.score === 110 && r.matchKind === "contains")).toBe(true);
    // Basketball is first in catalog order among "ball" sports; stable sort keeps it first.
    expect(results[0].sport).toBe("Basketball");
  });

  it("honors an explicit maxResults argument", () => {
    expect(findSportSearchResults("ball", 3)).toHaveLength(3);
    expect(findSportSearchResults("ball", 1)).toHaveLength(1);
  });

  it("returns hits sorted by descending score", () => {
    const results = findSportSearchResults("tennnis");
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });
});

describe("findSportMatch", () => {
  it("returns the top sport label for an exact query", () => {
    expect(findSportMatch("basketball")).toBe("Basketball");
  });

  it("returns the top sport label for an alias query", () => {
    expect(findSportMatch("bball")).toBe("Basketball");
  });

  it("returns null when there is no match", () => {
    expect(findSportMatch("zzzzz")).toBeNull();
  });

  it("returns null for a too-short query", () => {
    expect(findSportMatch("a")).toBeNull();
  });
});

describe("gameMatchesSport", () => {
  it("matches case- and whitespace-insensitively", () => {
    expect(gameMatchesSport("  Basketball ", "basketball")).toBe(true);
    expect(gameMatchesSport("SOCCER", "soccer")).toBe(true);
    expect(gameMatchesSport("Soccer  ", "  soccer")).toBe(true);
  });

  it("returns false for different sports", () => {
    expect(gameMatchesSport("Tennis", "Soccer")).toBe(false);
  });
});

describe("gamesMatchingSport / countGamesForSport", () => {
  const games: GameRow[] = [
    mkGame("Basketball", 1, "a"),
    mkGame("basketball ", 2, "b"),
    mkGame("Tennis", 3, "c"),
    mkGame("SOCCER", 4, "d"),
  ];

  it("filters games whose sport matches (case/whitespace-insensitive)", () => {
    const matched = gamesMatchingSport(games, "basketball");
    expect(matched.map((g) => g.id)).toEqual(["a", "b"]);
  });

  it("returns [] when nothing matches", () => {
    expect(gamesMatchingSport(games, "Cricket")).toEqual([]);
  });

  it("countGamesForSport returns the count of matching games", () => {
    expect(countGamesForSport(games, "soccer")).toBe(1);
    expect(countGamesForSport(games, "basketball")).toBe(2);
    expect(countGamesForSport(games, "Cricket")).toBe(0);
  });
});

describe("closestGame", () => {
  it("returns null for an empty list", () => {
    expect(closestGame([])).toBeNull();
  });

  it("returns the only game when there is one", () => {
    const only = mkGame("Tennis", 9, "solo");
    expect(closestGame([only])).toBe(only);
  });

  it("returns the game with the smallest distance_km", () => {
    const near = mkGame("Soccer", 2, "near");
    const games = [mkGame("Basketball", 5, "far"), near, mkGame("Tennis", 8, "farther")];
    expect(closestGame(games)).toBe(near);
  });

  it("keeps the first game on a distance tie (<= comparison in reduce)", () => {
    const first = mkGame("Soccer", 3, "first");
    const second = mkGame("Tennis", 3, "second");
    expect(closestGame([first, second])).toBe(first);
  });

  it("treats a distance of 0 as the closest", () => {
    const zero = mkGame("Golf", 0, "zero");
    expect(closestGame([mkGame("Tennis", 4, "x"), zero])).toBe(zero);
  });
});
