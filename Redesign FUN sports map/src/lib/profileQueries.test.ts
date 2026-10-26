import { describe, it, expect, vi, beforeEach } from "vitest";

const getPublicProfileById = vi.fn();
const getMyFollowState = vi.fn();
vi.mock("./api", () => ({
  getPublicProfileById: (...a: unknown[]) => getPublicProfileById(...a),
  getMyFollowState: (...a: unknown[]) => getMyFollowState(...a),
}));

import { prefetchPublicProfile, publicProfileQuery } from "./profileQueries";
import { cacheClear, cachePeek } from "./requestCache";

const row = { displayName: "Jordan", avatarUrl: null, athleteProfile: { primarySports: ["Basketball"] }, error: null };

beforeEach(() => {
  cacheClear("");
  getPublicProfileById.mockReset();
  getMyFollowState.mockReset();
});

describe("publicProfileQuery", () => {
  it("fetches the profile and your follow state together", async () => {
    let followAskedBeforeProfileAnswered = false;
    getMyFollowState.mockResolvedValue("accepted");
    getPublicProfileById.mockImplementation(async () => {
      await Promise.resolve();
      // Both requests are out before the profile answers: in parallel, not in turn.
      followAskedBeforeProfileAnswered = getMyFollowState.mock.calls.length === 1;
      return row;
    });
    await expect(publicProfileQuery("u1").fetch()).resolves.toMatchObject({ displayName: "Jordan", followState: "accepted" });
    expect(followAskedBeforeProfileAnswered).toBe(true);
  });

  it("throws for a profile that does not exist, so it is never cached as empty", async () => {
    getPublicProfileById.mockResolvedValue({ ...row, error: new Error("Profile not found") });
    getMyFollowState.mockResolvedValue("none");
    await expect(publicProfileQuery("missing").fetch()).rejects.toThrow("Profile not found");
  });
});

describe("prefetchPublicProfile", () => {
  it("warms the entry the profile page reads, once", async () => {
    getPublicProfileById.mockResolvedValue(row);
    getMyFollowState.mockResolvedValue("none");
    prefetchPublicProfile("u1");
    prefetchPublicProfile("u1");
    await new Promise((r) => setTimeout(r, 0));
    expect(getPublicProfileById).toHaveBeenCalledTimes(1);
    expect(cachePeek(publicProfileQuery("u1").key)).toMatchObject({ displayName: "Jordan" });
  });

  it("swallows a failure: the page will ask again", async () => {
    getPublicProfileById.mockRejectedValue(new Error("offline"));
    getMyFollowState.mockResolvedValue("none");
    expect(() => prefetchPublicProfile("u2")).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    expect(cachePeek(publicProfileQuery("u2").key)).toBeUndefined();
  });
});
