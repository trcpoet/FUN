import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { cachedAsync, cacheClear, cacheInvalidate, cacheIsFresh, cachePeek, cacheSet } from "./requestCache";

/** A request the test resolves or rejects by hand. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  cacheClear("");
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-22T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("requestCache", () => {
  it("shares one in-flight request between callers", async () => {
    const fn = vi.fn(() => Promise.resolve(1));
    const [a, b] = await Promise.all([cachedAsync("k", 1000, fn), cachedAsync("k", 1000, fn)]);
    expect([a, b]).toEqual([1, 1]);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("answers from cache inside the TTL and asks again after it", async () => {
    const fn = vi.fn(() => Promise.resolve("v"));
    await cachedAsync("k", 1000, fn);
    await cachedAsync("k", 1000, fn);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1001);
    expect(cacheIsFresh("k")).toBe(false);
    await cachedAsync("k", 1000, fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("keeps the old value readable while a refresh is in flight", async () => {
    await cachedAsync("k", 1000, () => Promise.resolve("old"));
    vi.advanceTimersByTime(1001);
    const next = deferred<string>();
    const p = cachedAsync("k", 1000, () => next.promise);
    expect(cachePeek("k")).toBe("old");
    next.resolve("new");
    await p;
    expect(cachePeek("k")).toBe("new");
  });

  it("keeps the old value when a refresh fails, and retries on the next read", async () => {
    await cachedAsync("k", 1000, () => Promise.resolve("old"));
    vi.advanceTimersByTime(1001);
    await expect(cachedAsync("k", 1000, () => Promise.reject(new Error("503")))).rejects.toThrow("503");
    expect(cachePeek("k")).toBe("old");
    expect(cacheIsFresh("k")).toBe(false);
    const fn = vi.fn(() => Promise.resolve("recovered"));
    await cachedAsync("k", 1000, fn);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("never caches a first request that fails", async () => {
    await expect(cachedAsync("k", 1000, () => Promise.reject(new Error("x")))).rejects.toThrow();
    expect(cachePeek("k")).toBeUndefined();
  });

  it("invalidates by prefix without forgetting the values", async () => {
    await cachedAsync("feed:a", 60_000, () => Promise.resolve(1));
    await cachedAsync("feed:b", 60_000, () => Promise.resolve(2));
    await cachedAsync("other", 60_000, () => Promise.resolve(3));
    cacheInvalidate("feed:");
    expect(cacheIsFresh("feed:a")).toBe(false);
    expect(cacheIsFresh("feed:b")).toBe(false);
    expect(cacheIsFresh("other")).toBe(true);
    expect(cachePeek("feed:a")).toBe(1);
  });

  it("edits a cached value in place", async () => {
    await cachedAsync("k", 60_000, () => Promise.resolve([1]));
    cacheSet<number[]>("k", (prev = []) => [0, ...prev]);
    expect(cachePeek("k")).toEqual([0, 1]);
    expect(cacheIsFresh("k")).toBe(true);
  });
});
