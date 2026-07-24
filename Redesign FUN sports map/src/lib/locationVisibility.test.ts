import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readLocationVisibility, writeLocationVisibility } from "./locationVisibility";

const STORAGE_KEY = "fun_location_visibility_v1";

beforeEach(() => {
  localStorage.clear();
});

describe("readLocationVisibility", () => {
  it("defaults to ghost when nothing is stored", () => {
    expect(readLocationVisibility()).toBe("ghost");
  });

  it("returns each valid stored mode", () => {
    for (const mode of ["ghost", "close_friends", "public"] as const) {
      localStorage.setItem(STORAGE_KEY, mode);
      expect(readLocationVisibility()).toBe(mode);
    }
  });

  it("falls back to ghost for an unrecognized stored value", () => {
    localStorage.setItem(STORAGE_KEY, "everyone");
    expect(readLocationVisibility()).toBe("ghost");
  });

  it("falls back to ghost when localStorage.getItem throws", () => {
    const original = localStorage.getItem.bind(localStorage);
    localStorage.getItem = () => {
      throw new DOMException("SecurityError");
    };
    try {
      expect(readLocationVisibility()).toBe("ghost");
    } finally {
      localStorage.getItem = original;
    }
  });
});

describe("writeLocationVisibility", () => {
  it("persists a mode that reads back", () => {
    writeLocationVisibility("public");
    expect(readLocationVisibility()).toBe("public");
  });

  it("swallows write errors (private mode)", () => {
    const original = localStorage.setItem.bind(localStorage);
    localStorage.setItem = () => {
      throw new DOMException("QuotaExceededError");
    };
    try {
      expect(() => writeLocationVisibility("close_friends")).not.toThrow();
    } finally {
      localStorage.setItem = original;
    }
  });
});
