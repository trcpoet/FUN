import { describe, it, expect } from "vitest";
import { Globe, Lock, Users } from "lucide-react";
import { noteVisibilityLabel, noteVisibilityIcon, noteCreatedLabel } from "./noteVisibility";

describe("noteVisibilityLabel — stored vocabulary", () => {
  it("maps the three values the CHECK constraint allows", () => {
    expect(noteVisibilityLabel("public")).toBe("Public");
    expect(noteVisibilityLabel("friends")).toBe("Friends");
    expect(noteVisibilityLabel("private")).toBe("Private");
  });
});

describe("noteVisibilityLabel — legacy aliases", () => {
  it("reads the pre-constraint `_only` spellings", () => {
    // Only UnifiedFeedCards handled these before, so the same note could read
    // "Friends" in the feed and "Public" on the map.
    expect(noteVisibilityLabel("friends_only")).toBe("Friends");
    expect(noteVisibilityLabel("invite_only")).toBe("Private");
  });
});

describe("noteVisibilityLabel — absent or unknown", () => {
  it("defaults to Public rather than throwing", () => {
    expect(noteVisibilityLabel(null)).toBe("Public");
    expect(noteVisibilityLabel(undefined)).toBe("Public");
    expect(noteVisibilityLabel("")).toBe("Public");
    expect(noteVisibilityLabel("something-new")).toBe("Public");
  });
});

describe("noteVisibilityIcon", () => {
  it("pairs each icon with its label", () => {
    expect(noteVisibilityIcon("public")).toBe(Globe);
    expect(noteVisibilityIcon("friends")).toBe(Users);
    expect(noteVisibilityIcon("private")).toBe(Lock);
  });

  it("follows the label through the legacy aliases", () => {
    expect(noteVisibilityIcon("friends_only")).toBe(Users);
    expect(noteVisibilityIcon("invite_only")).toBe(Lock);
  });

  it("never contradicts the label for unknown input", () => {
    expect(noteVisibilityIcon("nonsense")).toBe(Globe);
    expect(noteVisibilityLabel("nonsense")).toBe("Public");
  });
});

describe("noteCreatedLabel", () => {
  it("renders a suffixed relative time", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    expect(noteCreatedLabel(twoHoursAgo)).toBe("about 2 hours ago");
  });

  it("falls back to Recently instead of an empty string", () => {
    // These labels sit in a "<place> · <time>" run — an empty half leaves "Somewhere · ".
    expect(noteCreatedLabel(null)).toBe("Recently");
    expect(noteCreatedLabel(undefined)).toBe("Recently");
    expect(noteCreatedLabel("")).toBe("Recently");
    expect(noteCreatedLabel("not-a-date")).toBe("Recently");
  });
});
