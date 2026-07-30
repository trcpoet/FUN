import { describe, it, expect } from "vitest";

import { resolveVenueSportFilter, venueIntentToSportFilter } from "./venueSportIntent";

describe("venueIntentToSportFilter", () => {
  it("maps 'all sports' (null) to an empty filter", () => {
    expect(venueIntentToSportFilter(null)).toEqual([]);
  });

  it("wraps a single intent", () => {
    expect(venueIntentToSportFilter("Basketball")).toEqual(["Basketball"]);
  });
});

describe("resolveVenueSportFilter", () => {
  it("returns an empty filter when neither source constrains anything", () => {
    expect(resolveVenueSportFilter(null, [])).toEqual([]);
  });

  it("falls back to the onboarding intent when no Filters-modal sports are picked", () => {
    expect(resolveVenueSportFilter("Basketball", [])).toEqual(["Basketball"]);
  });

  it("uses the Filters-modal sports when the intent is 'all sports'", () => {
    expect(resolveVenueSportFilter(null, ["Soccer", "Tennis"])).toEqual(["Soccer", "Tennis"]);
  });

  it("lets explicit Filters-modal picks override the persisted intent", () => {
    expect(resolveVenueSportFilter("Basketball", ["Soccer"])).toEqual(["Soccer"]);
  });

  it("overrides rather than intersecting, so a disjoint pick never collapses to 'all sports'", () => {
    // An intersection would be [] here, which this API reads as "no filter" — i.e. every venue.
    const filter = resolveVenueSportFilter("Basketball", ["Tennis"]);
    expect(filter).not.toEqual([]);
    expect(filter).toEqual(["Tennis"]);
  });
});
