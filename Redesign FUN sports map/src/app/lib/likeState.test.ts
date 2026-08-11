import { describe, it, expect } from "vitest";
import {
  likeStateFrom,
  beginToggle,
  revertToggle,
  settleToggle,
  syncFromServer,
} from "./likeState";

describe("likeStateFrom", () => {
  it("reads a server row that carries both fields", () => {
    expect(likeStateFrom({ like_count: 3, liked_by_me: true })).toEqual({
      count: 3,
      liked: true,
      pending: null,
    });
  });

  it("treats absent fields as zero/unliked rather than NaN", () => {
    // Rows from the legacy read path have neither field. Before the
    // `get_notes_nearby` widening this was the *only* case.
    expect(likeStateFrom({})).toEqual({ count: 0, liked: false, pending: null });
    expect(likeStateFrom({ like_count: null, liked_by_me: null })).toEqual({
      count: 0,
      liked: false,
      pending: null,
    });
  });

  it("clamps a negative count to zero", () => {
    expect(likeStateFrom({ like_count: -2 }).count).toBe(0);
  });
});

describe("beginToggle", () => {
  it("likes optimistically and remembers the pre-toggle values", () => {
    const before = likeStateFrom({ like_count: 4, liked_by_me: false });
    expect(beginToggle(before)).toEqual({
      count: 5,
      liked: true,
      pending: { count: 4, liked: false },
    });
  });

  it("unlikes optimistically", () => {
    const before = likeStateFrom({ like_count: 4, liked_by_me: true });
    expect(beginToggle(before)).toEqual({
      count: 3,
      liked: false,
      pending: { count: 4, liked: true },
    });
  });

  it("never shows a negative count when the server count is behind", () => {
    const before = likeStateFrom({ like_count: 0, liked_by_me: true });
    expect(beginToggle(before).count).toBe(0);
  });

  it("keeps the original base when toggled again before settling", () => {
    // The button disables while in flight, but a re-render must not be able to
    // move the rollback target off the true pre-toggle values.
    const twice = beginToggle(beginToggle(likeStateFrom({ like_count: 4 })));
    expect(twice.pending).toEqual({ count: 4, liked: false });
  });
});

describe("revertToggle", () => {
  it("restores the exact pre-toggle values on failure", () => {
    const before = likeStateFrom({ like_count: 4, liked_by_me: false });
    expect(revertToggle(beginToggle(before))).toEqual(before);
  });

  it("restores a clamped count without inventing a like", () => {
    // count 0 + liked true is only reachable when the read path is stale, but
    // naive +1/-1 rollback arithmetic turns it into 1 — a like nobody made.
    const before = likeStateFrom({ like_count: 0, liked_by_me: true });
    expect(revertToggle(beginToggle(before))).toEqual(before);
  });

  it("is a no-op when nothing is in flight", () => {
    const idle = likeStateFrom({ like_count: 2, liked_by_me: true });
    expect(revertToggle(idle)).toEqual(idle);
  });
});

describe("settleToggle", () => {
  it("keeps the optimistic values when the server agrees", () => {
    const after = settleToggle(beginToggle(likeStateFrom({ like_count: 4 })), true);
    expect(after).toEqual({ count: 5, liked: true, pending: null });
  });

  it("derives from the pre-toggle values when the server disagrees", () => {
    // Server says "not liked" after we optimistically liked: the answer is the
    // base count, not base + 1 - 1 applied to the already-incremented value.
    const after = settleToggle(beginToggle(likeStateFrom({ like_count: 4 })), false);
    expect(after).toEqual({ count: 4, liked: false, pending: null });
  });

  it("adds a like the client did not predict", () => {
    const before = likeStateFrom({ like_count: 4, liked_by_me: true });
    expect(settleToggle(beginToggle(before), true)).toEqual({
      count: 4,
      liked: true,
      pending: null,
    });
  });

  it("never settles to a negative count", () => {
    const before = likeStateFrom({ like_count: 0, liked_by_me: false });
    expect(settleToggle(beginToggle(before), false).count).toBe(0);
  });

  it("accepts a server verdict with no toggle in flight", () => {
    const idle = likeStateFrom({ like_count: 2, liked_by_me: false });
    expect(settleToggle(idle, true)).toEqual({ count: 3, liked: true, pending: null });
  });
});

describe("syncFromServer", () => {
  it("adopts fresh server values when idle", () => {
    const idle = likeStateFrom({ like_count: 1, liked_by_me: false });
    expect(syncFromServer(idle, { like_count: 9, liked_by_me: true })).toEqual({
      count: 9,
      liked: true,
      pending: null,
    });
  });

  it("ignores a refetch that lands mid-toggle", () => {
    // The feed re-renders on an unrelated poll; without this guard the stale
    // pre-toggle row would visibly un-press the heart the user just tapped.
    const inFlight = beginToggle(likeStateFrom({ like_count: 4, liked_by_me: false }));
    expect(syncFromServer(inFlight, { like_count: 4, liked_by_me: false })).toEqual(inFlight);
  });
});
