import { describe, it, expect } from "vitest";
import { sameItems, sameMapOfArrays, sameStringSet } from "./stableItems";

describe("sameItems", () => {
  it("is true for the same array", () => {
    const a = [{ id: "1" }];
    expect(sameItems(a, a)).toBe(true);
  });

  it("is true for a fresh array holding the same objects — the filter-every-minute case", () => {
    const g1 = { id: "1" };
    const g2 = { id: "2" };
    expect(sameItems([g1, g2], [g1, g2])).toBe(true);
  });

  it("is false when a row object was replaced, even with the same id", () => {
    expect(sameItems([{ id: "1" }], [{ id: "1" }])).toBe(false);
  });

  it("is false on length or order changes", () => {
    const g1 = { id: "1" };
    const g2 = { id: "2" };
    expect(sameItems([g1], [g1, g2])).toBe(false);
    expect(sameItems([g1, g2], [g2, g1])).toBe(false);
  });

  it("treats two empty arrays as equal", () => {
    expect(sameItems([], [])).toBe(true);
  });
});

describe("sameStringSet", () => {
  it("compares by membership, not identity", () => {
    expect(sameStringSet(new Set(["a", "b"]), new Set(["b", "a"]))).toBe(true);
    expect(sameStringSet(new Set(["a"]), new Set(["a", "b"]))).toBe(false);
    expect(sameStringSet(new Set(["a"]), new Set(["b"]))).toBe(false);
    expect(sameStringSet(new Set(), new Set())).toBe(true);
  });
});

describe("sameMapOfArrays", () => {
  it("is true when the same games sit under the same venue ids", () => {
    const g = { id: "1" };
    expect(sameMapOfArrays(new Map([["v1", [g]]]), new Map([["v1", [g]]]))).toBe(true);
  });

  it("is false when a venue gains, loses or swaps a game", () => {
    const g1 = { id: "1" };
    const g2 = { id: "2" };
    expect(sameMapOfArrays(new Map([["v1", [g1]]]), new Map([["v1", [g1, g2]]]))).toBe(false);
    expect(sameMapOfArrays(new Map([["v1", [g1]]]), new Map([["v2", [g1]]]))).toBe(false);
    expect(sameMapOfArrays(new Map([["v1", [g1]]]), new Map([["v1", [g2]]]))).toBe(false);
  });
});
