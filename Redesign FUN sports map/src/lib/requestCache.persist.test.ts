import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

type Cache = typeof import("./requestCache");

/** A page load: module state (the in-memory store) starts empty, localStorage does not. */
async function coldStart(): Promise<Cache> {
  vi.resetModules();
  const cache = await import("./requestCache");
  cache.persistUnder("p:");
  return cache;
}

/** The write happens when the browser is idle. */
const idle = () => new Promise((r) => setTimeout(r, 30));

const stored = (key: string) => localStorage.getItem(`fun.rq.v1:${key}`);

/** The build's entry script name, which is how the cache tells builds apart. */
let entry = "/assets/index-AAAAAAAA.js";

beforeEach(() => {
  localStorage.clear();
  entry = "/assets/index-AAAAAAAA.js";
  // Stubbed rather than inserted: a real <script> tag makes happy-dom try to load it.
  const real = document.querySelector.bind(document);
  vi.spyOn(document, "querySelector").mockImplementation(((selector: string) =>
    selector.includes("/assets/index-") ? ({ getAttribute: () => entry } as unknown as Element) : real(selector)) as typeof document.querySelector);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("requestCache persistence", () => {
  it("paints a stored value on the next start, as stale so it revalidates", async () => {
    let cache = await coldStart();
    await cache.cachedAsync("p:feed", 60_000, () => Promise.resolve({ posts: [1, 2] }));
    await idle();
    expect(stored("p:feed")).not.toBeNull();

    cache = await coldStart();
    expect(cache.cachePeek("p:feed")).toEqual({ posts: [1, 2] });
    expect(cache.cacheIsFresh("p:feed")).toBe(false);
    const fetcher = vi.fn(() => Promise.resolve({ posts: [3] }));
    await expect(cache.cachedAsync("p:feed", 60_000, fetcher)).resolves.toEqual({ posts: [3] });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("keeps showing the stored value if the first refresh fails", async () => {
    let cache = await coldStart();
    await cache.cachedAsync("p:feed", 60_000, () => Promise.resolve("old"));
    await idle();
    cache = await coldStart();
    await expect(cache.cachedAsync("p:feed", 60_000, () => Promise.reject(new Error("503")))).rejects.toThrow();
    expect(cache.cachePeek("p:feed")).toBe("old");
  });

  it("only stores keys an owner opted in", async () => {
    const cache = await coldStart();
    await cache.cachedAsync("other:feed", 60_000, () => Promise.resolve("x"));
    await idle();
    expect(stored("other:feed")).toBeNull();
  });

  it("discards what another build stored", async () => {
    let cache = await coldStart();
    await cache.cachedAsync("p:feed", 60_000, () => Promise.resolve("from build A"));
    await idle();
    entry = "/assets/index-BBBBBBBB.js"; // a deploy
    cache = await coldStart();
    expect(cache.cachePeek("p:feed")).toBeUndefined();
    expect(stored("p:feed")).toBeNull();
  });

  it("discards what is older than twelve hours", async () => {
    localStorage.setItem(
      "fun.rq.v1:p:feed",
      JSON.stringify({ b: "/assets/index-AAAAAAAA.js", t: Date.now() - 13 * 3600_000, v: "yesterday" })
    );
    const cache = await coldStart();
    expect(cache.cachePeek("p:feed")).toBeUndefined();
  });

  it("forgets stored values on clear, as sign-out does", async () => {
    const cache = await coldStart();
    await cache.cachedAsync("p:feed", 60_000, () => Promise.resolve("mine"));
    await idle();
    cache.cacheClear("p:");
    expect(stored("p:feed")).toBeNull();
    expect((await coldStart()).cachePeek("p:feed")).toBeUndefined();
  });

  it("stores an in-place edit, such as marking an alert read", async () => {
    let cache = await coldStart();
    await cache.cachedAsync("p:alerts", 60_000, () => Promise.resolve([{ id: 1, read: false }]));
    await idle();
    cache.cacheSet<{ id: number; read: boolean }[]>("p:alerts", (prev = []) => prev.map((n) => ({ ...n, read: true })));
    await idle();
    cache = await coldStart();
    expect(cache.cachePeek("p:alerts")).toEqual([{ id: 1, read: true }]);
  });

  it("does not store a value too large to parse quickly on the next start", async () => {
    const cache = await coldStart();
    await cache.cachedAsync("p:huge", 60_000, () => Promise.resolve("x".repeat(300 * 1024)));
    await idle();
    expect(stored("p:huge")).toBeNull();
  });

  it("survives corrupt storage", async () => {
    localStorage.setItem("fun.rq.v1:p:feed", "{not json");
    const cache = await coldStart();
    expect(cache.cachePeek("p:feed")).toBeUndefined();
    expect(stored("p:feed")).toBeNull();
  });

  it("prunes other builds' and expired entries", async () => {
    localStorage.setItem("fun.rq.v1:p:a", JSON.stringify({ b: "/assets/index-OLD00000.js", t: Date.now(), v: 1 }));
    localStorage.setItem("fun.rq.v1:p:b", JSON.stringify({ b: "/assets/index-AAAAAAAA.js", t: Date.now(), v: 2 }));
    localStorage.setItem("unrelated", "kept");
    const cache = await coldStart();
    cache.pruneStoredCache();
    expect(stored("p:a")).toBeNull();
    expect(stored("p:b")).not.toBeNull();
    expect(localStorage.getItem("unrelated")).toBe("kept");
  });
});
