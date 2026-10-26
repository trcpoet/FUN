import { describe, it, expect, vi } from "vitest";
import { chunkUrlFrom, failedAssetUrls, isChunkLoadError, recoverFromStaleChunk, RELOAD_GUARD_MS } from "./staleChunk";

const CHROME = new TypeError(
  "Failed to fetch dynamically imported module: https://fun-trcpoet.vercel.app/assets/Feed-CKneZhq8.js"
);

function deps(over: Partial<Parameters<typeof recoverFromStaleChunk>[1]> = {}) {
  const store = new Map<string, string>();
  return {
    now: () => 1_000_000,
    online: () => true,
    storage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
    reload: vi.fn(),
    refetch: vi.fn(() => Promise.resolve()),
    failedAssets: () => [] as string[],
    ...over,
  };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("isChunkLoadError", () => {
  it("recognises each engine's wording", () => {
    expect(isChunkLoadError(CHROME)).toBe(true);
    expect(isChunkLoadError(new TypeError("error loading dynamically imported module: https://x/a.js"))).toBe(true);
    expect(isChunkLoadError(new TypeError("Importing a module script failed."))).toBe(true);
    expect(isChunkLoadError(new Error("Unable to preload CSS for /assets/x-12345678.css"))).toBe(true);
  });
  it("leaves ordinary errors alone", () => {
    expect(isChunkLoadError(new Error("Cannot read properties of undefined"))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });
});

describe("chunkUrlFrom", () => {
  it("finds the file when the message names it", () => {
    expect(chunkUrlFrom(CHROME)).toBe("https://fun-trcpoet.vercel.app/assets/Feed-CKneZhq8.js");
    expect(chunkUrlFrom(new TypeError("Importing a module script failed."))).toBeNull();
  });
});

describe("recoverFromStaleChunk", () => {
  it("re-requests the failed file past the cache, then reloads", async () => {
    const d = deps();
    expect(recoverFromStaleChunk(CHROME, d)).toBe(true);
    await flush();
    expect(d.refetch).toHaveBeenCalledWith("https://fun-trcpoet.vercel.app/assets/Feed-CKneZhq8.js");
    expect(d.reload).toHaveBeenCalledTimes(1);
  });

  it("reloads once, not in a loop", async () => {
    let t = 1_000_000;
    const d = deps({ now: () => t });
    expect(recoverFromStaleChunk(CHROME, d)).toBe(true);
    t += RELOAD_GUARD_MS - 1;
    expect(recoverFromStaleChunk(CHROME, d)).toBe(false);
    t += 2;
    expect(recoverFromStaleChunk(CHROME, d)).toBe(true);
  });

  it("does not reload while offline", () => {
    const d = deps({ online: () => false });
    expect(recoverFromStaleChunk(CHROME, d)).toBe(false);
    expect(d.reload).not.toHaveBeenCalled();
  });

  it("does not reload without storage to guard against a loop", () => {
    const d = deps({ storage: null });
    expect(recoverFromStaleChunk(CHROME, d)).toBe(false);
  });

  it("still reloads when the re-request fails", async () => {
    const d = deps({ refetch: vi.fn(() => Promise.reject(new Error("offline"))) });
    expect(recoverFromStaleChunk(CHROME, d)).toBe(true);
    await flush();
    expect(d.reload).toHaveBeenCalledTimes(1);
  });
});

describe("failedAssetUrls", () => {
  const at = (path: string) => `https://fun-trcpoet.vercel.app${path}`;
  it("lists every hashed file that failed, by responseStatus", () => {
    expect(
      failedAssetUrls([
        { name: at("/assets/ForgotPassword-B_IAuBst.js"), responseStatus: 404 },
        { name: at("/assets/AuthShell-DHvEKEI3.js"), responseStatus: 404 },
        { name: at("/assets/App-No41bbLz.js"), responseStatus: 200 },
      ])
    ).toEqual([at("/assets/ForgotPassword-B_IAuBst.js"), at("/assets/AuthShell-DHvEKEI3.js")]);
  });

  it("guesses nothing where the engine reports no status", () => {
    expect(failedAssetUrls([{ name: at("/assets/cjs-helpers-CqkleIqs.js") }])).toEqual([]);
  });

  it("ignores everything that is not one of the app's hashed files", () => {
    expect(
      failedAssetUrls([
        { name: "https://api.mapbox.com/styles/x.json", responseStatus: 404 },
        { name: at("/favicon.svg"), responseStatus: 404 },
        { name: "not a url", responseStatus: 404 },
      ])
    ).toEqual([]);
  });
});

describe("recoverFromStaleChunk heals the failed file's dependencies too", () => {
  it("re-requests the named file and every other failed file, once each", async () => {
    const refetch = vi.fn((_url: string) => Promise.resolve());
    const d = deps({
      refetch,
      failedAssets: () => [
        "https://fun-trcpoet.vercel.app/assets/Feed-CKneZhq8.js",
        "https://fun-trcpoet.vercel.app/assets/AuthShell-DHvEKEI3.js",
      ],
    });
    expect(recoverFromStaleChunk(CHROME, d)).toBe(true);
    await flush();
    expect(refetch.mock.calls.map((c) => c[0])).toEqual([
      "https://fun-trcpoet.vercel.app/assets/Feed-CKneZhq8.js",
      "https://fun-trcpoet.vercel.app/assets/AuthShell-DHvEKEI3.js",
    ]);
    expect(d.reload).toHaveBeenCalledTimes(1);
  });
});

describe("recoverFromStaleChunk on Safari, whose message names no file", () => {
  it("re-requests the files that failed, then reloads", async () => {
    const d = deps({ failedAssets: () => ["https://x/assets/a-12345678.js", "https://x/assets/b-12345678.css"] });
    expect(recoverFromStaleChunk(new TypeError("Importing a module script failed."), d)).toBe(true);
    await flush();
    expect(d.refetch).toHaveBeenCalledTimes(2);
    expect(d.reload).toHaveBeenCalledTimes(1);
  });
});
