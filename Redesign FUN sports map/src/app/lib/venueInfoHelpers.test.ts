import { describe, it, expect } from "vitest";
import {
  nextEnrichKey,
  osmHref,
  telHref,
  formatFee,
  formatWheelchair,
  formatCovered,
  formatCapacity,
  formatCount,
  formatAmenity,
  formatAddress,
  formatGoogleRating,
} from "./venueInfoHelpers";

// Regression guard for the bug that left the venue hero image pulsing forever:
// the enrichment effect used to depend on a flag it set itself, so the resulting
// re-render tore the effect down and its cleanup cancelled the in-flight fetch.
// The fix drives the fetch from a key that only the open-details event writes,
// so these transitions are the whole contract the effect relies on.
describe("nextEnrichKey", () => {
  it("arms enrichment when details opens", () => {
    expect(nextEnrichKey(null, "way/123", "open-details")).toBe("way/123");
  });

  it("returns the identical key when the same venue reopens, so the effect does not re-run", () => {
    const key = nextEnrichKey(null, "way/123", "open-details");
    expect(nextEnrichKey(key, "way/123", "open-details")).toBe(key);
  });

  it("clears the key when the selected venue changes", () => {
    expect(nextEnrichKey("way/123", "way/456", "venue-changed")).toBeNull();
  });

  it("re-arms for the new venue after a venue change", () => {
    const cleared = nextEnrichKey("way/123", "way/456", "venue-changed");
    expect(nextEnrichKey(cleared, "way/456", "open-details")).toBe("way/456");
  });

  it("switches keys when details opens for a different venue without a reset", () => {
    expect(nextEnrichKey("way/123", "way/456", "open-details")).toBe("way/456");
  });

  it("leaves the key untouched when there is no venue id", () => {
    expect(nextEnrichKey("way/123", null, "open-details")).toBe("way/123");
    expect(nextEnrichKey(null, null, "open-details")).toBeNull();
  });
});

describe("osmHref", () => {
  it("builds the OSM page URL from the venue id", () => {
    expect(osmHref("way/12345")).toBe("https://www.openstreetmap.org/way/12345");
    expect(osmHref("node/9")).toBe("https://www.openstreetmap.org/node/9");
  });

  it("rejects anything that is not an OSM element id", () => {
    expect(osmHref("12345")).toBeNull();
    expect(osmHref("way/abc")).toBeNull();
    expect(osmHref("")).toBeNull();
    expect(osmHref(null)).toBeNull();
  });
});

describe("telHref", () => {
  it("keeps + and digits", () => {
    expect(telHref("+1 (817) 555-0100")).toBe("tel:+18175550100");
  });

  it("rejects values with too few digits to dial", () => {
    expect(telHref("call us")).toBeNull();
    expect(telHref("123")).toBeNull();
  });
});

describe("OSM value formatters", () => {
  it("inverts fee so fee=no reads as Free", () => {
    expect(formatFee("no")).toBe("Free");
    expect(formatFee("yes")).toBe("Paid");
    expect(formatFee(null)).toBeNull();
  });

  it("maps wheelchair values, including the negative case", () => {
    expect(formatWheelchair("designated")).toBe("Wheelchair accessible");
    expect(formatWheelchair("limited")).toBe("Partly accessible");
    expect(formatWheelchair("no")).toBe("Not wheelchair accessible");
    expect(formatWheelchair("weird")).toBeNull();
  });

  it("maps covered", () => {
    expect(formatCovered("yes")).toBe("Covered");
    expect(formatCovered("no")).toBe("Outdoor");
  });

  it("formats capacity and rejects junk", () => {
    expect(formatCapacity("500")).toBe("Seats 500");
    expect(formatCapacity("0")).toBeNull();
    expect(formatCapacity("lots")).toBeNull();
  });

  it("pluralises counts", () => {
    expect(formatCount("1", "hoop")).toBe("1 hoop");
    expect(formatCount("4", "hoop")).toBe("4 hoops");
    expect(formatCount("8", "lane")).toBe("8 lanes");
    expect(formatCount("0", "hoop")).toBeNull();
  });

  // A missing tag means unmapped, not absent — so a "no" must never render as a fact.
  it("drops negative amenity values instead of asserting absence", () => {
    expect(formatAmenity("yes", "Toilets")).toBe("Toilets");
    expect(formatAmenity("no", "Toilets")).toBeNull();
    expect(formatAmenity(undefined, "Toilets")).toBeNull();
  });

  it("joins address fragments and tolerates partial data", () => {
    expect(
      formatAddress({ housenumber: "100", street: "Main St", city: "Arlington", state: "TX", postcode: "76010" })
    ).toBe("100 Main St, Arlington, TX, 76010");
    expect(formatAddress({ city: "Arlington" })).toBe("Arlington");
    expect(formatAddress({})).toBeNull();
    expect(formatAddress(null)).toBeNull();
  });

  it("formats the Google aggregate", () => {
    expect(formatGoogleRating(4.25, 128)).toBe("4.3 (128)");
    expect(formatGoogleRating(4, 0)).toBe("4.0");
    expect(formatGoogleRating(null, 12)).toBeNull();
  });
});
