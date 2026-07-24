import { describe, it, expect } from "vitest";
import { mergeSearchSectionOrder } from "./mergeSearchResults.ts";
import type { SportSearchHit } from "./sportSearch";
import type { ProfileSearchRow } from "./supabase";

// ---- fixture factories -----------------------------------------------------

function hit(overrides: Partial<SportSearchHit> = {}): SportSearchHit {
  return { sport: "Basketball", matchKind: "exact", score: 200, ...overrides };
}

function person(overrides: Partial<ProfileSearchRow> = {}): ProfileSearchRow {
  return {
    profile_id: "p1",
    display_name: "John Doe",
    avatar_url: null,
    handle: "@johndoe",
    city: null,
    favorite_sport: null,
    distance_km: null,
    rank_score: null,
    ...overrides,
  };
}

type Input = Parameters<typeof mergeSearchSectionOrder>[0];

/** Neutral baseline that falls through to the default ordering. */
function baseInput(overrides: Partial<Input> = {}): Input {
  return {
    query: "",
    sportHits: [],
    people: [],
    placesCount: 0,
    playersNearMe: false,
    ...overrides,
  };
}

// ---- playersNearMe short-circuit ------------------------------------------

describe("mergeSearchSectionOrder — playersNearMe", () => {
  it("returns people → sports → places when playersNearMe is true", () => {
    expect(mergeSearchSectionOrder(baseInput({ playersNearMe: true }))).toEqual([
      "people",
      "sports",
      "places",
    ]);
  });

  it("playersNearMe overrides an otherwise-strong exact sport match", () => {
    // query "basketball" + exact hit would normally push sports first,
    // but playersNearMe short-circuits before any of that is evaluated.
    const out = mergeSearchSectionOrder(
      baseInput({
        query: "basketball",
        sportHits: [hit({ sport: "Basketball", matchKind: "exact" })],
        placesCount: 0,
        playersNearMe: true,
      }),
    );
    expect(out).toEqual(["people", "sports", "places"]);
  });
});

// ---- empty sections --------------------------------------------------------

describe("mergeSearchSectionOrder — empty sections", () => {
  it("falls through to places → sports → people for an empty query and empty sections", () => {
    expect(mergeSearchSectionOrder(baseInput())).toEqual(["places", "sports", "people"]);
  });

  it("empty query does NOT strong-match a person with null name/handle (name/handle guard)", () => {
    // display_name/handle are null → the `name && ...` / `handle && ...` guards
    // short-circuit, so peopleStrong stays false even though pq === "".
    const out = mergeSearchSectionOrder(
      baseInput({
        query: "",
        people: [person({ display_name: null, handle: null })],
      }),
    );
    expect(out).toEqual(["places", "sports", "people"]);
  });
});

// ---- sportsExactName (strong exact sport) ----------------------------------

describe("mergeSearchSectionOrder — exact sport name", () => {
  it("exact sport-name match with no strong person → sports → places → people", () => {
    const out = mergeSearchSectionOrder(
      baseInput({
        query: "basketball",
        sportHits: [hit({ sport: "Basketball", matchKind: "exact" })],
        placesCount: 5, // high placesCount is irrelevant once exact-name fires
      }),
    );
    expect(out).toEqual(["sports", "places", "people"]);
  });

  it("normalizes query before comparing: 'Table-Tennis' matches sport 'Table Tennis'", () => {
    // normalizeSportQuery turns '-' into a space → "table tennis"; sport lower-cased
    // & whitespace-collapsed also "table tennis" → sportsExactName true.
    const out = mergeSearchSectionOrder(
      baseInput({
        query: "Table-Tennis",
        sportHits: [hit({ sport: "Table Tennis", matchKind: "prefix", score: 10 })],
      }),
    );
    expect(out).toEqual(["sports", "places", "people"]);
  });

  it("exact-name check is independent of matchKind (name equality alone triggers it)", () => {
    // matchKind "contains" is NOT strong, but the sport label equals the query,
    // so sportsExactName is true and sports still lead.
    const out = mergeSearchSectionOrder(
      baseInput({
        query: "basketball",
        sportHits: [hit({ sport: "Basketball", matchKind: "contains", score: 1 })],
      }),
    );
    expect(out).toEqual(["sports", "places", "people"]);
  });
});

// ---- peopleStrong (strong person) ------------------------------------------

describe("mergeSearchSectionOrder — strong person", () => {
  it("display_name exact match (trimmed + case-insensitive) → people → places → sports", () => {
    const out = mergeSearchSectionOrder(
      baseInput({
        query: "john doe",
        people: [person({ display_name: "  John Doe  ", handle: "@somethingelse" })],
      }),
    );
    expect(out).toEqual(["people", "places", "sports"]);
  });

  it("handle match (query without @, stored handle with @, case-insensitive)", () => {
    const out = mergeSearchSectionOrder(
      baseInput({
        query: "johnny",
        people: [person({ display_name: "Unrelated Name", handle: "@Johnny" })],
      }),
    );
    expect(out).toEqual(["people", "places", "sports"]);
  });

  it("handle match strips a leading @ from the query too", () => {
    const out = mergeSearchSectionOrder(
      baseInput({
        query: "@johnny",
        people: [person({ display_name: "Unrelated Name", handle: "johnny" })],
      }),
    );
    expect(out).toEqual(["people", "places", "sports"]);
  });
});

// ---- strong sport vs strong person -----------------------------------------

describe("mergeSearchSectionOrder — strong sport vs strong person", () => {
  it("when BOTH exact-sport-name and strong-person match, neither leads → default order", () => {
    // sportsExactName && !peopleStrong -> false; peopleStrong && !sportsExactName -> false;
    // sportsStrong && !peopleStrong -> false; places>=3 && no hits -> false → default.
    const out = mergeSearchSectionOrder(
      baseInput({
        query: "basketball",
        sportHits: [hit({ sport: "Basketball", matchKind: "exact" })],
        people: [person({ display_name: "Basketball", handle: "@x" })],
      }),
    );
    expect(out).toEqual(["places", "sports", "people"]);
  });

  it("strong person beats a merely-strong sport when there is no exact sport name", () => {
    // alias hit is sportsStrong but not sportsExactName; peopleStrong wins.
    const out = mergeSearchSectionOrder(
      baseInput({
        query: "hoops",
        sportHits: [hit({ sport: "Basketball", matchKind: "alias", score: 300 })],
        people: [person({ display_name: "hoops", handle: "@x" })],
        placesCount: 0,
      }),
    );
    expect(out).toEqual(["people", "places", "sports"]);
  });
});

// ---- sportsStrong + placesCount thresholds ---------------------------------

describe("mergeSearchSectionOrder — sportsStrong & placesCount thresholds", () => {
  it("alias hit is strong; with placesCount 0 → sports → places → people", () => {
    const out = mergeSearchSectionOrder(
      baseInput({
        query: "hoops",
        sportHits: [hit({ sport: "Basketball", matchKind: "alias", score: 5 })],
        placesCount: 0,
      }),
    );
    expect(out).toEqual(["sports", "places", "people"]);
  });

  it("strong sport still leads at the placesCount === 1 boundary (<= 1)", () => {
    const out = mergeSearchSectionOrder(
      baseInput({
        query: "hoops",
        sportHits: [hit({ sport: "Basketball", matchKind: "alias", score: 5 })],
        placesCount: 1,
      }),
    );
    expect(out).toEqual(["sports", "places", "people"]);
  });

  it("strong sport no longer leads once placesCount is 2 (> 1) → default order", () => {
    const out = mergeSearchSectionOrder(
      baseInput({
        query: "hoops",
        sportHits: [hit({ sport: "Basketball", matchKind: "alias", score: 5 })],
        placesCount: 2,
      }),
    );
    expect(out).toEqual(["places", "sports", "people"]);
  });

  it("prefix hit with score === 140 counts as strong → sports lead", () => {
    const out = mergeSearchSectionOrder(
      baseInput({
        query: "bask",
        sportHits: [hit({ sport: "Basketball", matchKind: "prefix", score: 140 })],
        placesCount: 0,
      }),
    );
    expect(out).toEqual(["sports", "places", "people"]);
  });

  it("prefix hit with score 139 is NOT strong → default order", () => {
    const out = mergeSearchSectionOrder(
      baseInput({
        query: "bask",
        sportHits: [hit({ sport: "Basketball", matchKind: "prefix", score: 139 })],
        placesCount: 0,
      }),
    );
    expect(out).toEqual(["places", "sports", "people"]);
  });

  it("matchKind 'contains' is never strong (even with a huge score) → default order", () => {
    const out = mergeSearchSectionOrder(
      baseInput({
        query: "ball",
        sportHits: [hit({ sport: "Basketball", matchKind: "contains", score: 999 })],
        placesCount: 0,
      }),
    );
    expect(out).toEqual(["places", "sports", "people"]);
  });
});

// ---- places-heavy path (placesCount >= 3 && no sport hits) -----------------

describe("mergeSearchSectionOrder — places-heavy path", () => {
  it("placesCount 3 with no sport hits → places → people → sports", () => {
    const out = mergeSearchSectionOrder(
      baseInput({ query: "downtown", placesCount: 3, sportHits: [] }),
    );
    expect(out).toEqual(["places", "people", "sports"]);
  });

  it("placesCount 2 with no sport hits stays at the default (< 3 boundary)", () => {
    const out = mergeSearchSectionOrder(
      baseInput({ query: "downtown", placesCount: 2, sportHits: [] }),
    );
    expect(out).toEqual(["places", "sports", "people"]);
  });

  it("high placesCount but a (weak) sport hit present → places-heavy path is skipped", () => {
    // sportHits.length !== 0 disqualifies the places→people→sports branch,
    // and the weak "contains" hit is not strong, so we land on the default.
    const out = mergeSearchSectionOrder(
      baseInput({
        query: "ball",
        placesCount: 5,
        sportHits: [hit({ sport: "Basketball", matchKind: "contains", score: 1 })],
      }),
    );
    expect(out).toEqual(["places", "sports", "people"]);
  });
});
