import { describe, it, expect } from "vitest";
import { rangeFillPercent } from "./RangeSlider";

describe("rangeFillPercent", () => {
  it("puts the fill where the value is", () => {
    expect(rangeFillPercent(15, 15, 240)).toBe(0);
    expect(rangeFillPercent(240, 15, 240)).toBe(100);
    expect(rangeFillPercent(90, 15, 240)).toBeCloseTo(33.33, 2);
  });

  it("clamps a value outside the range rather than overflowing the track", () => {
    // A prefill can arrive above the slider's reach (Create Game widens `max` for
    // exactly that case, but the guard has to hold if one ever slips past).
    expect(rangeFillPercent(500, 15, 240)).toBe(100);
    expect(rangeFillPercent(-20, 15, 240)).toBe(0);
  });

  it("does not divide by zero on a range with no width", () => {
    expect(rangeFillPercent(5, 5, 5)).toBe(100);
    expect(rangeFillPercent(9, 5, 4)).toBe(100);
  });

  it("survives a non-finite value", () => {
    expect(Number.isFinite(rangeFillPercent(Number.NaN, 0, 10))).toBe(false);
    expect(rangeFillPercent(Number.POSITIVE_INFINITY, 0, 10)).toBe(100);
  });
});
