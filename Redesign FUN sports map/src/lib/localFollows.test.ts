import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFollowedIds, writeFollowedIds, isFollowing, toggleFollowing, FOLLOW_STORAGE_KEY } from "./localFollows";

beforeEach(() => {
  localStorage.clear();
});

describe("readFollowedIds", () => {
  it("returns an empty set when nothing is stored", () => {
    expect(readFollowedIds().size).toBe(0);
  });

  it("parses a stored string array", () => {
    localStorage.setItem(FOLLOW_STORAGE_KEY, JSON.stringify(["a", "b"]));
    const set = readFollowedIds();
    expect(set.has("a")).toBe(true);
    expect(set.has("b")).toBe(true);
    expect(set.size).toBe(2);
  });

  it("returns empty for malformed JSON", () => {
    localStorage.setItem(FOLLOW_STORAGE_KEY, "[broken");
    expect(readFollowedIds().size).toBe(0);
  });

  it("returns empty when stored value is not an array", () => {
    localStorage.setItem(FOLLOW_STORAGE_KEY, JSON.stringify({ a: 1 }));
    expect(readFollowedIds().size).toBe(0);
  });

  it("filters out non-string and blank entries", () => {
    localStorage.setItem(FOLLOW_STORAGE_KEY, JSON.stringify(["ok", 42, null, "", "  ", "good"]));
    const set = readFollowedIds();
    expect([...set].sort()).toEqual(["good", "ok"]);
  });
});

describe("writeFollowedIds / round-trip", () => {
  it("persists and reads back", () => {
    writeFollowedIds(new Set(["x", "y"]));
    expect([...readFollowedIds()].sort()).toEqual(["x", "y"]);
  });

  it("swallows quota / private-mode errors", () => {
    const original = localStorage.setItem.bind(localStorage);
    localStorage.setItem = () => {
      throw new DOMException("QuotaExceededError");
    };
    try {
      expect(() => writeFollowedIds(new Set(["z"]))).not.toThrow();
    } finally {
      localStorage.setItem = original;
    }
  });
});

describe("isFollowing", () => {
  it("reflects stored membership", () => {
    writeFollowedIds(new Set(["me"]));
    expect(isFollowing("me")).toBe(true);
    expect(isFollowing("other")).toBe(false);
  });
});

describe("toggleFollowing", () => {
  it("adds then removes, persisting each time", () => {
    const added = toggleFollowing("u1");
    expect(added.next).toBe(true);
    expect(added.followedIds.has("u1")).toBe(true);
    expect(isFollowing("u1")).toBe(true);

    const removed = toggleFollowing("u1");
    expect(removed.next).toBe(false);
    expect(removed.followedIds.has("u1")).toBe(false);
    expect(isFollowing("u1")).toBe(false);
  });
});
