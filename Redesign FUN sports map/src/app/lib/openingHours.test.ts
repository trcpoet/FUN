import { describe, it, expect } from "vitest";
import { isOpenNow, formatOpeningHours } from "./openingHours";

/** Local-time date helper. 2026-08-03 is a Monday. */
function at(day: "Mo" | "Tu" | "We" | "Th" | "Fr" | "Sa" | "Su", hhmm: string): Date {
  const offsets = { Mo: 3, Tu: 4, We: 5, Th: 6, Fr: 7, Sa: 8, Su: 9 } as const;
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(2026, 7, offsets[day], h, m, 0, 0);
}

describe("isOpenNow — supported grammar", () => {
  it("treats 24/7 as always open", () => {
    expect(isOpenNow("24/7", at("Su", "03:00"))).toBe(true);
    expect(isOpenNow("24/7", at("We", "14:00"))).toBe(true);
  });

  it("handles a weekday range", () => {
    const spec = "Mo-Fr 08:00-20:00";
    expect(isOpenNow(spec, at("Mo", "08:00"))).toBe(true);
    expect(isOpenNow(spec, at("We", "12:00"))).toBe(true);
    expect(isOpenNow(spec, at("Fr", "19:59"))).toBe(true);
    expect(isOpenNow(spec, at("Mo", "07:59"))).toBe(false);
    expect(isOpenNow(spec, at("Fr", "20:00"))).toBe(false);
    // Days the spec never mentions are closed.
    expect(isOpenNow(spec, at("Sa", "12:00"))).toBe(false);
  });

  it("handles a comma-separated day list", () => {
    const spec = "Mo,We,Fr 09:00-17:00";
    expect(isOpenNow(spec, at("We", "10:00"))).toBe(true);
    expect(isOpenNow(spec, at("Tu", "10:00"))).toBe(false);
  });

  it("handles multiple semicolon-joined rules", () => {
    const spec = "Mo-Fr 08:00-20:00; Sa 09:00-17:00";
    expect(isOpenNow(spec, at("Sa", "10:00"))).toBe(true);
    expect(isOpenNow(spec, at("Sa", "18:00"))).toBe(false);
    expect(isOpenNow(spec, at("Su", "10:00"))).toBe(false);
    expect(isOpenNow(spec, at("Th", "10:00"))).toBe(true);
  });

  it("handles a split day (lunch break)", () => {
    const spec = "Mo-Fr 08:00-12:00,13:00-17:00";
    expect(isOpenNow(spec, at("Tu", "11:00"))).toBe(true);
    expect(isOpenNow(spec, at("Tu", "12:30"))).toBe(false);
    expect(isOpenNow(spec, at("Tu", "14:00"))).toBe(true);
  });

  it("handles an interval running past midnight", () => {
    const spec = "Mo-Su 22:00-02:00";
    expect(isOpenNow(spec, at("Tu", "23:00"))).toBe(true);
    // 01:00 Wednesday is inside Tuesday's window.
    expect(isOpenNow(spec, at("We", "01:00"))).toBe(true);
    expect(isOpenNow(spec, at("We", "03:00"))).toBe(false);
  });

  it("honours an explicit off rule that overrides an earlier range", () => {
    const spec = "Mo-Su 08:00-20:00; We off";
    expect(isOpenNow(spec, at("Tu", "10:00"))).toBe(true);
    expect(isOpenNow(spec, at("We", "10:00"))).toBe(false);
  });

  it("treats a later rule as overriding an earlier one for the same day", () => {
    const spec = "Mo-Su 08:00-20:00; Su 10:00-14:00";
    expect(isOpenNow(spec, at("Su", "09:00"))).toBe(false);
    expect(isOpenNow(spec, at("Su", "11:00"))).toBe(true);
  });

  it("accepts a bare time range as meaning every day", () => {
    expect(isOpenNow("08:00-20:00", at("Su", "10:00"))).toBe(true);
    expect(isOpenNow("08:00-20:00", at("Su", "21:00"))).toBe(false);
  });

  it("accepts 24:00 as an end-of-day bound", () => {
    expect(isOpenNow("Mo-Su 06:00-24:00", at("Th", "23:30"))).toBe(true);
    expect(isOpenNow("Mo-Su 00:00-24:00", at("Th", "04:00"))).toBe(true);
  });
});

describe("isOpenNow — refuses to guess", () => {
  const unsupported = [
    "Mo-Fr sunrise-sunset",
    "Apr-Oct 09:00-18:00",
    "Mo-Fr 08:00-20:00; PH off",
    'Mo-Fr 08:00-20:00 "ring the bell"',
    "week 1-53 Mo 09:00-17:00",
    "Mo-Fr",
    "Mo-Fr 8-20",
    "Mo-Fr 08:00-08:00",
    "Mo-Fr 25:00-26:00",
    "Xx-Yy 09:00-17:00",
    "open",
    "gibberish",
  ];

  it.each(unsupported)("returns null for %s", (spec) => {
    expect(isOpenNow(spec, at("Mo", "10:00"))).toBeNull();
  });

  it("returns null for blank or missing input", () => {
    expect(isOpenNow(null, at("Mo", "10:00"))).toBeNull();
    expect(isOpenNow("", at("Mo", "10:00"))).toBeNull();
    expect(isOpenNow("   ", at("Mo", "10:00"))).toBeNull();
  });
});

describe("formatOpeningHours", () => {
  it("names the always-open case", () => {
    expect(formatOpeningHours("24/7")).toBe("Open 24h");
    expect(formatOpeningHours("Mo-Su 00:00-24:00")).toBe("Open 24h");
  });

  it("collapses a consecutive day run", () => {
    expect(formatOpeningHours("Mo-Fr 08:00-20:00")).toBe("Mon–Fri 8am–8pm");
  });

  it("keeps distinct groups separate", () => {
    expect(formatOpeningHours("Mo-Fr 08:00-20:00; Sa 09:00-17:00")).toBe(
      "Mon–Fri 8am–8pm, Sat 9am–5pm",
    );
  });

  it("renders minutes when they are not on the hour", () => {
    expect(formatOpeningHours("Sa 09:30-17:45")).toBe("Sat 9:30am–5:45pm");
  });

  it("uses 12pm and 12am correctly", () => {
    expect(formatOpeningHours("Sa 12:00-24:00")).toBe("Sat 12pm–12am");
  });

  it("renders a single day without a range dash", () => {
    expect(formatOpeningHours("We 09:00-17:00")).toBe("Wed 9am–5pm");
  });

  it("returns null for anything it cannot parse", () => {
    expect(formatOpeningHours("Mo-Fr sunrise-sunset")).toBeNull();
    expect(formatOpeningHours(null)).toBeNull();
  });
});
