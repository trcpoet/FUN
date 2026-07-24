import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { formatRelativeShort, isWithinHours } from "./formatRelative.ts";

// Fixed "now" so Date.now() is deterministic across all assertions.
const NOW = new Date("2026-07-23T12:00:00Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

// Helper: build an ISO string offset (in ms) from the mocked NOW.
function isoAgo(ms: number): string {
  return new Date(NOW.getTime() - ms).toISOString();
}

const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("formatRelativeShort", () => {
  describe("null-ish / blank inputs -> null", () => {
    it("returns null for null", () => {
      expect(formatRelativeShort(null)).toBeNull();
    });
    it("returns null for undefined", () => {
      expect(formatRelativeShort(undefined)).toBeNull();
    });
    it("returns null for empty string", () => {
      expect(formatRelativeShort("")).toBeNull();
    });
    it("returns null for whitespace-only string", () => {
      expect(formatRelativeShort("   ")).toBeNull();
    });
  });

  it("returns null for an invalid / unparseable ISO string", () => {
    expect(formatRelativeShort("nonsense")).toBeNull();
    expect(formatRelativeShort("not-a-date")).toBeNull();
  });

  describe('"just now" threshold (sec < 45)', () => {
    it("returns 'just now' for 0 seconds ago", () => {
      expect(formatRelativeShort(isoAgo(0))).toBe("just now");
    });
    it("returns 'just now' for 30 seconds ago", () => {
      expect(formatRelativeShort(isoAgo(30 * SEC))).toBe("just now");
    });
    it("returns 'just now' at 44 seconds (still < 45)", () => {
      expect(formatRelativeShort(isoAgo(44 * SEC))).toBe("just now");
    });
    it("crosses to minutes at exactly 45 seconds -> '0m ago'", () => {
      // sec = round(45) = 45, not < 45; min = floor(45/60) = 0
      expect(formatRelativeShort(isoAgo(45 * SEC))).toBe("0m ago");
    });
  });

  describe("minutes bucket (min < 60)", () => {
    it("returns '1m ago' at 60 seconds", () => {
      expect(formatRelativeShort(isoAgo(60 * SEC))).toBe("1m ago");
    });
    it("returns '59m ago' just under the hour", () => {
      expect(formatRelativeShort(isoAgo(59 * MIN))).toBe("59m ago");
    });
    it("crosses to hours at exactly 60 minutes -> '1h ago'", () => {
      expect(formatRelativeShort(isoAgo(60 * MIN))).toBe("1h ago");
    });
  });

  describe("hours bucket (hr < 48)", () => {
    it("returns '1h ago' at one hour", () => {
      expect(formatRelativeShort(isoAgo(1 * HOUR))).toBe("1h ago");
    });
    it("returns '47h ago' just under two days", () => {
      expect(formatRelativeShort(isoAgo(47 * HOUR))).toBe("47h ago");
    });
    it("crosses to days at exactly 48 hours -> '2d ago'", () => {
      // hr = 48, not < 48; days = floor(48/24) = 2
      expect(formatRelativeShort(isoAgo(48 * HOUR))).toBe("2d ago");
    });
  });

  describe("days bucket (days < 30)", () => {
    it("returns '2d ago' at two days", () => {
      expect(formatRelativeShort(isoAgo(2 * DAY))).toBe("2d ago");
    });
    it("returns '29d ago' just under the 30-day cutoff", () => {
      expect(formatRelativeShort(isoAgo(29 * DAY))).toBe("29d ago");
    });
  });

  describe("date fallback (days >= 30 -> toLocaleDateString)", () => {
    it("falls back to a localized month/day string at exactly 30 days", () => {
      const iso = isoAgo(30 * DAY);
      const expected = new Date(iso).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
      const result = formatRelativeShort(iso);
      expect(result).toBe(expected);
      // Sanity: it is NOT one of the relative buckets.
      expect(result).not.toMatch(/ago$/);
      expect(result).not.toBe("just now");
    });

    it("falls back for a far-past timestamp (100 days ago)", () => {
      const iso = isoAgo(100 * DAY);
      const expected = new Date(iso).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
      expect(formatRelativeShort(iso)).toBe(expected);
    });
  });

  describe("future timestamps (negative delta)", () => {
    it("returns 'just now' for a timestamp slightly in the future", () => {
      // sec = round(-30) = -30, which is < 45
      expect(formatRelativeShort(isoAgo(-30 * SEC))).toBe("just now");
    });
    it("returns 'just now' for a timestamp far in the future", () => {
      // sec very negative, still < 45 -> first branch wins
      expect(formatRelativeShort(isoAgo(-10 * DAY))).toBe("just now");
    });
  });
});

describe("isWithinHours", () => {
  describe("null-ish / blank inputs -> false", () => {
    it("returns false for null", () => {
      expect(isWithinHours(null, 24)).toBe(false);
    });
    it("returns false for undefined", () => {
      expect(isWithinHours(undefined, 24)).toBe(false);
    });
    it("returns false for empty string", () => {
      expect(isWithinHours("", 24)).toBe(false);
    });
    it("returns false for whitespace-only string", () => {
      expect(isWithinHours("   ", 24)).toBe(false);
    });
  });

  it("returns false for an invalid / unparseable ISO string", () => {
    expect(isWithinHours("nonsense", 24)).toBe(false);
  });

  it("returns true when the timestamp is comfortably within the window", () => {
    expect(isWithinHours(isoAgo(12 * HOUR), 24)).toBe(true);
  });

  it("returns true just inside the window boundary", () => {
    expect(isWithinHours(isoAgo(24 * HOUR - SEC), 24)).toBe(true);
  });

  it("returns false exactly at the boundary (diff is not strictly < window)", () => {
    // Date.now() - d = 24h, and 24h < 24h is false.
    expect(isWithinHours(isoAgo(24 * HOUR), 24)).toBe(false);
  });

  it("returns false when the timestamp is older than the window", () => {
    expect(isWithinHours(isoAgo(48 * HOUR), 24)).toBe(false);
  });

  it("returns true for a future timestamp (negative delta < positive window)", () => {
    expect(isWithinHours(isoAgo(-1 * HOUR), 24)).toBe(true);
  });

  describe("hours = 0 window", () => {
    it("returns false for 'now' (diff 0, not < 0)", () => {
      expect(isWithinHours(isoAgo(0), 0)).toBe(false);
    });
    it("returns false for any past timestamp", () => {
      expect(isWithinHours(isoAgo(1 * MIN), 0)).toBe(false);
    });
    it("returns true only for a future timestamp (negative diff)", () => {
      expect(isWithinHours(isoAgo(-1 * MIN), 0)).toBe(true);
    });
  });
});
