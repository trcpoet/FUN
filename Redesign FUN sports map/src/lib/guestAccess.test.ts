import { describe, it, expect } from "vitest";
import {
  isGuest,
  profileAuthPath,
  returnToForGame,
  returnToForNote,
  returnToForVenue,
  safeReturnTo,
  squadCountLabel,
} from "./guestAccess";

describe("isGuest", () => {
  it("is anyone without a user id", () => {
    expect(isGuest(null)).toBe(true);
    expect(isGuest(undefined)).toBe(true);
    expect(isGuest("")).toBe(true);
    expect(isGuest("2f1c…")).toBe(false);
  });
});

describe("safeReturnTo", () => {
  it("keeps in-app paths", () => {
    expect(safeReturnTo("/")).toBe("/");
    expect(safeReturnTo("/?focusGameId=abc")).toBe("/?focusGameId=abc");
    expect(safeReturnTo("/feed?tab=notifications")).toBe("/feed?tab=notifications");
    expect(safeReturnTo("  /profile  ")).toBe("/profile");
  });

  it("drops anything that could leave the app", () => {
    expect(safeReturnTo("//evil.example/steal")).toBeNull();
    expect(safeReturnTo("https://evil.example")).toBeNull();
    expect(safeReturnTo("javascript:alert(1)")).toBeNull();
    expect(safeReturnTo("/\\evil.example")).toBeNull();
    expect(safeReturnTo("/ok\nLocation: https://evil.example")).toBeNull();
    expect(safeReturnTo("feed")).toBeNull();
    expect(safeReturnTo(null)).toBeNull();
    expect(safeReturnTo(undefined)).toBeNull();
  });
});

describe("returnTo deep links", () => {
  it("match the focus params App already handles", () => {
    expect(returnToForGame("g1")).toBe("/?focusGameId=g1");
    expect(returnToForVenue("way/123")).toBe("/?focusVenueId=way%2F123");
    expect(returnToForNote("n1")).toBe("/?focusNoteId=n1");
  });

  it("survives a round trip through safeReturnTo", () => {
    expect(safeReturnTo(returnToForVenue("way/123"))).toBe("/?focusVenueId=way%2F123");
  });
});

describe("profileAuthPath", () => {
  it("points at the one auth surface", () => {
    expect(profileAuthPath()).toBe("/profile?auth=signin");
    expect(profileAuthPath("signup")).toBe("/profile?auth=signup");
  });
});

describe("squadCountLabel", () => {
  it("counts without naming", () => {
    expect(squadCountLabel(7, 10)).toBe("7 of 10 in");
  });
});
