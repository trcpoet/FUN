import { describe, it, expect, beforeEach } from "vitest";
import {
  getTotalUnreadCount,
  getUnreadCount,
  incrementUnread,
  clearUnread,
  badgeText,
  threadKey,
} from "./unreadCounts";

const STORAGE_KEY = "fun_unread_counts_v1";

beforeEach(() => {
  localStorage.clear();
});

describe("threadKey", () => {
  it("namespaces by kind", () => {
    expect(threadKey("game", "abc")).toBe("game:abc");
    expect(threadKey("dm", "xyz")).toBe("dm:xyz");
    expect(threadKey("note", "1")).toBe("note:1");
  });
});

describe("getUnreadCount / safeParse resilience", () => {
  it("returns 0 when nothing is stored", () => {
    expect(getUnreadCount("game:1")).toBe(0);
  });

  it("returns 0 for malformed JSON (not valid)", () => {
    localStorage.setItem(STORAGE_KEY, "{not json");
    expect(getUnreadCount("game:1")).toBe(0);
    expect(getTotalUnreadCount()).toBe(0);
  });

  it("returns 0 when the stored value is a non-object (e.g. a JSON number)", () => {
    localStorage.setItem(STORAGE_KEY, "42");
    expect(getUnreadCount("game:1")).toBe(0);
    expect(getTotalUnreadCount()).toBe(0);
  });

  it("floors and clamps a stored fractional/negative count", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ "game:1": { count: 3.9, updatedAt: 1 }, "game:2": { count: -5, updatedAt: 1 } }),
    );
    expect(getUnreadCount("game:1")).toBe(3);
    expect(getUnreadCount("game:2")).toBe(0);
  });

  it("treats non-finite stored counts as 0", () => {
    // JSON can't hold NaN/Infinity, but a corrupt object could arrive as a string.
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ "game:1": { count: "oops", updatedAt: 1 } }));
    expect(getUnreadCount("game:1")).toBe(0);
  });
});

describe("incrementUnread", () => {
  it("increments from zero and persists", () => {
    expect(incrementUnread("game:1")).toBe(1);
    expect(incrementUnread("game:1")).toBe(2);
    expect(getUnreadCount("game:1")).toBe(2);
  });

  it("adds an explicit positive delta", () => {
    expect(incrementUnread("dm:1", 5)).toBe(5);
  });

  it("ignores negative deltas (clamped to 0 added)", () => {
    incrementUnread("game:1", 3);
    expect(incrementUnread("game:1", -10)).toBe(3);
  });

  it("floors fractional deltas", () => {
    expect(incrementUnread("game:1", 2.9)).toBe(2);
  });
});

describe("clearUnread", () => {
  it("resets a key's count to 0", () => {
    incrementUnread("game:1", 4);
    clearUnread("game:1");
    expect(getUnreadCount("game:1")).toBe(0);
  });

  it("is a no-op for an unknown key", () => {
    expect(() => clearUnread("nope:1")).not.toThrow();
    expect(getUnreadCount("nope:1")).toBe(0);
  });
});

describe("getTotalUnreadCount", () => {
  it("sums clamped counts across keys", () => {
    incrementUnread("game:1", 2);
    incrementUnread("dm:1", 3);
    clearUnread("game:1"); // 0
    incrementUnread("note:1", 1);
    expect(getTotalUnreadCount()).toBe(4);
  });
});

describe("badgeText", () => {
  it("returns null for zero or negative", () => {
    expect(badgeText(0)).toBeNull();
    expect(badgeText(-1)).toBeNull();
  });
  it("returns the number as a string up to 9", () => {
    expect(badgeText(1)).toBe("1");
    expect(badgeText(9)).toBe("9");
  });
  it("caps at 9+ above 9", () => {
    expect(badgeText(10)).toBe("9+");
    expect(badgeText(999)).toBe("9+");
  });
});
