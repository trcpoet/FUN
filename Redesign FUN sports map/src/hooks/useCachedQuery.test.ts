import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { useCachedQuery, type CachedQuery } from "./useCachedQuery";
import { cachedAsync, cacheClear, cacheInvalidate } from "../lib/requestCache";

// React's act() needs this flag or every render logs a warning.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = React.act;

let container: HTMLDivElement;
let root: Root;
let frames: CachedQuery<string>[];

function Probe(props: { queryKey: string | null; fetcher: () => Promise<string> }) {
  frames.push(useCachedQuery(props.queryKey, props.fetcher, 10_000));
  return null;
}

async function render(queryKey: string | null, fetcher: () => Promise<string>) {
  await act(async () => {
    root.render(React.createElement(Probe, { queryKey, fetcher }));
  });
}

const latest = () => frames[frames.length - 1]!;

beforeEach(() => {
  cacheClear("");
  frames = [];
  container = document.createElement("div");
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
});

describe("useCachedQuery", () => {
  it("paints the cached copy on the very first frame, then refreshes behind it", async () => {
    await cachedAsync("k", 10_000, () => Promise.resolve("cached"));
    cacheInvalidate("k");
    let finish!: (v: string) => void;
    await render("k", () => new Promise((r) => (finish = r)));

    expect(frames[0]).toMatchObject({ data: "cached", loading: false, refreshing: true });
    await act(async () => finish("fresh"));
    expect(latest()).toMatchObject({ data: "fresh", loading: false, refreshing: false });
  });

  it("does not ask again while the cached copy is fresh", async () => {
    await cachedAsync("k", 10_000, () => Promise.resolve("cached"));
    const fetcher = vi.fn(() => Promise.resolve("network"));
    await render("k", fetcher);
    expect(fetcher).not.toHaveBeenCalled();
    expect(frames.every((f) => f.data === "cached" && !f.loading && !f.refreshing)).toBe(true);
  });

  it("shows loading only when there is nothing cached", async () => {
    await render("k", () => Promise.resolve("first"));
    expect(frames[0]).toMatchObject({ data: undefined, loading: true });
    expect(latest()).toMatchObject({ data: "first", loading: false });
  });

  it("keeps the rows on screen through a refetch", async () => {
    await render("k", () => Promise.resolve("v1"));
    let finish!: (v: string) => void;
    await render("k", () => new Promise((r) => (finish = r)));
    act(() => latest().refetch());
    expect(latest()).toMatchObject({ data: "v1", loading: false, refreshing: true });
    await act(async () => finish("v2"));
    expect(latest()).toMatchObject({ data: "v2", refreshing: false });
  });

  it("keeps the last copy and reports the error when a refresh fails", async () => {
    await render("k", () => Promise.resolve("good"));
    await render("k", () => Promise.reject(new Error("503")));
    await act(async () => latest().refetch());
    expect(latest().data).toBe("good");
    expect(latest().error?.message).toBe("503");
  });

  it("fetches nothing for a null key", async () => {
    const fetcher = vi.fn(() => Promise.resolve("x"));
    await render(null, fetcher);
    expect(fetcher).not.toHaveBeenCalled();
    expect(latest()).toMatchObject({ data: undefined, loading: false });
  });

  it("switches to the new key's cached copy in the same frame the key changes", async () => {
    await cachedAsync("a", 10_000, () => Promise.resolve("A"));
    await cachedAsync("b", 10_000, () => Promise.resolve("B"));
    await render("a", () => Promise.resolve("A"));
    const before = frames.length;
    await render("b", () => Promise.resolve("B"));
    // No frame for key "b" ever shows "A".
    expect(frames.slice(before).map((f) => f.data)).not.toContain("A");
    expect(latest().data).toBe("B");
  });

  it("edits the shared copy with mutate", async () => {
    await render("k", () => Promise.resolve("one"));
    act(() => latest().mutate((prev) => `${prev}+two`));
    expect(latest().data).toBe("one+two");
  });
});
