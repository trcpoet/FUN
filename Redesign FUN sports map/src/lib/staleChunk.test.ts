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

describe("failedAssetUrls (engines that do not name the file)", () => {
  const at = (path: string) => `https://fun-trcpoet.vercel.app${path}`;
  it("trusts responseStatus where the engine reports it", () => {
    expect(
      failedAssetUrls([
        { name: at("/assets/Feed-CKneZhq8.js"), decodedBodySize: 79, responseStatus: 404 },
        { name: at("/assets/App-No41bbLz.js"), decodedBodySize: 130_000, responseStatus: 200 },
        { name: at("/assets/tiny-12345678.js"), decodedBodySize: 111, responseStatus: 200 },
      ])
    ).toEqual([at("/assets/Feed-CKneZhq8.js")]);
  });

  it("falls back to body size where it does not", () => {
    expect(
      failedAssetUrls([
        { name: at("/assets/Feed-CKneZhq8.js"), decodedBodySize: 79 },
        { name: at("/assets/App-No41bbLz.js"), decodedBodySize: 130_000 },
      ])
    ).toEqual([at("/assets/Feed-CKneZhq8.js")]);
  });

  it("ignores everything that is not one of the app's hashed files", () => {
    expect(
      failedAssetUrls([
        { name: "https://api.mapbox.com/styles/x.json", decodedBodySize: 10, responseStatus: 404 },
        { name: at("/favicon.svg"), decodedBodySize: 10, responseStatus: 404 },
        { name: "not a url", decodedBodySize: 10 },
      ])
    ).toEqual([]);
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
