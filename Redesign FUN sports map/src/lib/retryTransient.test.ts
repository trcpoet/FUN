import { describe, it, expect } from "vitest";
import { retryTransient, type SupabaseLikeResult } from "./retryTransient";

/** Deterministic: no real timers, no jitter. */
const opts = { sleep: async () => {}, random: () => 0.5 };

function scripted<T>(...results: SupabaseLikeResult<T>[]) {
  let i = 0;
  const calls: number[] = [];
  const run = async () => {
    calls.push(i);
    return results[Math.min(i++, results.length - 1)]!;
  };
  return { run, count: () => i, calls };
}

const ok = (data: unknown) => ({ data, error: null }) as SupabaseLikeResult<unknown>;
const unavailable = () =>
  ({ data: null, error: { status: 503, message: "Service Unavailable" } }) as SupabaseLikeResult<unknown>;
const denied = () =>
  ({ data: null, error: { code: "42501", message: "permission denied for function get_games_nearby" } }) as SupabaseLikeResult<unknown>;

describe("retryTransient", () => {
  it("does not retry a call that succeeded", async () => {
    const s = scripted(ok([1, 2]));
    const res = await retryTransient(s.run, opts);
    expect(s.count()).toBe(1);
    expect(res.data).toEqual([1, 2]);
  });

  it("retries a 503 and returns the recovered data", async () => {
    const s = scripted(unavailable(), ok(["a game"]));
    const res = await retryTransient(s.run, opts);
    expect(s.count()).toBe(2);
    expect(res.error).toBeNull();
    expect(res.data).toEqual(["a game"]);
  });

  it("gives up after the configured number of retries", async () => {
    const s = scripted(unavailable());
    const res = await retryTransient(s.run, { ...opts, retries: 2 });
    expect(s.count()).toBe(3); // first attempt + 2 retries
    expect(res.error).not.toBeNull();
  });

  it("never retries a final answer — permission denied is not a blip", async () => {
    const s = scripted(denied());
    const res = await retryTransient(s.run, opts);
    expect(s.count()).toBe(1);
    expect(res.error).not.toBeNull();
  });

  it("treats an empty result as a real answer, not something to retry", async () => {
    const s = scripted(ok([]));
    await retryTransient(s.run, opts);
    expect(s.count()).toBe(1);
  });

  it("stops immediately when the caller has moved on", async () => {
    const s = scripted(unavailable());
    const res = await retryTransient(s.run, { ...opts, shouldContinue: () => false });
    expect(s.count()).toBe(1); // no retry after the first failure
    expect(res.error).not.toBeNull();
  });

  it("backs off for longer on each successive attempt", async () => {
    const waits: number[] = [];
    const s = scripted(unavailable());
    await retryTransient(s.run, {
      ...opts,
      retries: 3,
      baseDelayMs: 400,
      sleep: async (ms) => {
        waits.push(ms);
      },
      random: () => 1, // full jitter at its ceiling, so the doubling is visible
    });
    expect(waits).toEqual([400, 800, 1600]);
  });

  it("spreads retries across clients so a recovering server isn't hit in lockstep", async () => {
    const a: number[] = [];
    const b: number[] = [];
    const mk = (out: number[], r: number) =>
      retryTransient(scripted(unavailable()).run, {
        retries: 1,
        baseDelayMs: 400,
        random: () => r,
        sleep: async (ms) => {
          out.push(ms);
        },
      });
    await Promise.all([mk(a, 0.1), mk(b, 0.9)]);
    expect(a[0]).not.toEqual(b[0]);
  });
});
