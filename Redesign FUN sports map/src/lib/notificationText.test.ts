import { describe, it, expect } from "vitest";
import { notificationHref, notificationLabel } from "./notificationText";

describe("notificationLabel", () => {
  it("names every type the database writes", () => {
    expect(notificationLabel({ type: "new_follower" })).toBe("Someone new is following you.");
    expect(notificationLabel({ type: "game_nearby", payload: { sport: "Tennis" } })).toBe("New game nearby: Tennis");
    expect(notificationLabel({ type: "game_nearby", payload: { sport: "  " } })).toBe("New game nearby: Pickup");
    expect(notificationLabel({ type: "badge_earned", payload: { badge_slug: "first_game" } })).toBe(
      "Badge earned: first_game"
    );
  });

  it("falls back for a type it does not know", () => {
    expect(notificationLabel({ type: "something_new" })).toBe("New notification");
  });
});

describe("notificationHref", () => {
  it("opens the game or note on the map", () => {
    expect(notificationHref({ type: "game_invite", payload: { game_id: "g 1" } })).toBe("/?focusGameId=g%201");
    expect(notificationHref({ type: "note_new_activity", payload: { note_id: "n1" } })).toBe("/?focusNoteId=n1");
  });

  it("opens the follower's profile", () => {
    expect(notificationHref({ type: "new_follower", payload: { follower_id: "u1" } })).toBe("/athlete/u1");
  });

  it("sends a badge to your own profile, where badges are listed", () => {
    expect(notificationHref({ type: "badge_earned", payload: { badge_slug: "x" } })).toBe("/profile");
  });

  it("falls back to whoever caused it", () => {
    expect(notificationHref({ type: "something_new", payload: { actor_id: "u2" } })).toBe("/athlete/u2");
  });

  it("has nowhere to go when the payload names nothing", () => {
    expect(notificationHref({ type: "game_nearby", payload: {} })).toBeNull();
    expect(notificationHref({ type: "game_completed", payload: {} })).toBeNull();
    expect(notificationHref({ type: "something_new" })).toBeNull();
  });
});
