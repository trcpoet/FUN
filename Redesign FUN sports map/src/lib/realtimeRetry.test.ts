import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the supabase client so subscribeWithRetry sees a non-null client and we
// can observe removeChannel. The channel itself is supplied by the test's build
// callback, so we don't need channel() here.
const removeChannel = vi.fn();
vi.mock("./supabase", () => ({
  supabase: { removeChannel: (...args: unknown[]) => removeChannel(...args) },
}));

import { subscribeWithRetry } from "./realtimeRetry";

type Status = "SUBSCRIBED" | "CHANNEL_ERROR" | "TIMED_OUT" | "CLOSED";

/** A build() that records each channel it produces and the status callback it received. */
function makeHarness() {
  const built: Array<{ cb: (s: Status) => void }> = [];
  const build = () => {
    const record: { cb: (s: Status) => void } = { cb: () => {} };
    const channel = {
      subscribe(cb: (s: Status) => void) {
        record.cb = cb;
        built.push(record);
        return channel;
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return channel as any;
  };
  const last = () => built[built.length - 1];
  return { built, build, last };
}

beforeEach(() => {
  vi.useFakeTimers();
  removeChannel.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("subscribeWithRetry", () => {
  it("subscribes exactly once on start", () => {
    const { built, build } = makeHarness();
    const unsub = subscribeWithRetry(build);
    expect(built.length).toBe(1);
    unsub();
  });

  it("reconnects with 1s → 2s → 4s exponential backoff on repeated errors", () => {
    const { built, last, build } = makeHarness();
    const unsub = subscribeWithRetry(build);

    last().cb("CHANNEL_ERROR"); // schedules reconnect in 1000ms
    vi.advanceTimersByTime(999);
    expect(built.length).toBe(1); // not yet
    vi.advanceTimersByTime(1);
    expect(built.length).toBe(2); // reconnected

    last().cb("TIMED_OUT"); // next delay 2000ms
    vi.advanceTimersByTime(1999);
    expect(built.length).toBe(2);
    vi.advanceTimersByTime(1);
    expect(built.length).toBe(3);

    last().cb("CLOSED"); // next delay 4000ms
    vi.advanceTimersByTime(3999);
    expect(built.length).toBe(3);
    vi.advanceTimersByTime(1);
    expect(built.length).toBe(4);

    unsub();
  });

  it("resets the backoff after a successful SUBSCRIBED", () => {
    const { built, last, build } = makeHarness();
    const unsub = subscribeWithRetry(build);

    last().cb("CHANNEL_ERROR");
    vi.advanceTimersByTime(1000); // reconnect #2 (attempt was advanced)
    expect(built.length).toBe(2);

    last().cb("SUBSCRIBED"); // resets attempt → 0
    last().cb("CHANNEL_ERROR"); // so the next delay is 1000ms again, not 2000ms
    vi.advanceTimersByTime(999);
    expect(built.length).toBe(2);
    vi.advanceTimersByTime(1);
    expect(built.length).toBe(3);

    unsub();
  });

  it("caps the backoff at 30s", () => {
    const { last, built, build } = makeHarness();
    const unsub = subscribeWithRetry(build);

    // Drive enough consecutive failures to push the delay past the 30s cap
    // (1,2,4,8,16 then capped). Advance fully each round to fire the reconnect.
    for (let i = 0; i < 6; i++) {
      last().cb("CHANNEL_ERROR");
      vi.advanceTimersByTime(30_000);
    }
    const countBefore = built.length;

    // The next scheduled reconnect must be exactly at the 30s cap.
    last().cb("CHANNEL_ERROR");
    vi.advanceTimersByTime(29_999);
    expect(built.length).toBe(countBefore);
    vi.advanceTimersByTime(1);
    expect(built.length).toBe(countBefore + 1);

    unsub();
  });

  it("stops reconnecting and removes the channel after unsubscribe", () => {
    const { built, last, build } = makeHarness();
    const unsub = subscribeWithRetry(build);
    unsub();

    expect(removeChannel).toHaveBeenCalledTimes(1);

    // A late status callback from the dead channel must not trigger a rebuild.
    last().cb("CHANNEL_ERROR");
    vi.advanceTimersByTime(60_000);
    expect(built.length).toBe(1);
  });

  it("ignores status callbacks from a channel it has already replaced", () => {
    const { built, build } = makeHarness();
    const unsub = subscribeWithRetry(build);
    const first = built[0];

    first.cb("CHANNEL_ERROR");
    vi.advanceTimersByTime(1000); // now on channel #2
    expect(built.length).toBe(2);

    // Stale callback from the first (removed) channel — must be a no-op.
    first.cb("CHANNEL_ERROR");
    vi.advanceTimersByTime(60_000);
    expect(built.length).toBe(2);

    unsub();
  });

  it("re-kicks immediately when the tab comes back online while unhealthy", () => {
    const { built, last, build } = makeHarness();
    const unsub = subscribeWithRetry(build);

    last().cb("CHANNEL_ERROR"); // unhealthy, reconnect pending at 1000ms
    window.dispatchEvent(new Event("online")); // should reconnect now, not wait
    expect(built.length).toBe(2);

    unsub();
  });

  it("does not churn on online events while healthy", () => {
    const { built, last, build } = makeHarness();
    const unsub = subscribeWithRetry(build);

    last().cb("SUBSCRIBED"); // healthy
    window.dispatchEvent(new Event("online"));
    window.dispatchEvent(new Event("online"));
    expect(built.length).toBe(1); // no needless reconnect

    unsub();
  });
});
