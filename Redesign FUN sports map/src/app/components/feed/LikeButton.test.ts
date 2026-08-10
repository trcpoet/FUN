import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { createRoot, type Root } from "react-dom/client";

import { LikeButton } from "./LikeButton";

// React's act() needs this flag or every render logs a warning.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = React.act;

type Props = React.ComponentProps<typeof LikeButton>;

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
});

const button = () => container.querySelector("button") as HTMLButtonElement;
const pressed = () => button().getAttribute("aria-pressed") === "true";
const count = () => button().textContent?.trim() ?? "";

async function render(props: Partial<Props> & Pick<Props, "toggle">) {
  await act(async () => {
    root.render(
      React.createElement(LikeButton, {
        rowId: "note-1",
        label: "note",
        variant: "chip",
        ...props,
      } as Props),
    );
  });
}

async function click() {
  await act(async () => {
    button().click();
  });
}

/** A promise the test resolves by hand, to assert on the in-flight state. */
function deferred<T>() {
  let resolve!: (v: T) => void;
    const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("LikeButton — server truth on mount", () => {
  it("renders pressed for a row the viewer already liked", async () => {
    // The regression this whole change exists for: the note card used to
    // hardcode `liked = false` because no read path returned `liked_by_me`.
    await render({ likeCount: 4, likedByMe: true, toggle: vi.fn() });
    expect(pressed()).toBe(true);
    expect(count()).toBe("4");
  });

  it("renders unpressed when the read path reports nothing", async () => {
    await render({ toggle: vi.fn() });
    expect(pressed()).toBe(false);
    expect(count()).toBe("0");
  });
});

describe("LikeButton — toggling", () => {
  it("unlikes a row that is already liked", async () => {
    // Previously the first tap on a note you'd liked sent a *like*, which the
    // server turned into a delete, and the count went the wrong way.
    const toggle = vi.fn().mockResolvedValue({ liked: false, error: null });
    await render({ likeCount: 4, likedByMe: true, toggle });
    await click();
    expect(toggle).toHaveBeenCalledTimes(1);
    expect(pressed()).toBe(false);
    expect(count()).toBe("3");
  });

  it("likes a row that is not liked yet", async () => {
    const toggle = vi.fn().mockResolvedValue({ liked: true, error: null });
    await render({ likeCount: 4, likedByMe: false, toggle });
    await click();
    expect(pressed()).toBe(true);
    expect(count()).toBe("5");
  });

  it("shows the optimistic state before the write lands", async () => {
    const d = deferred<{ liked: boolean; error: Error | null }>();
    await render({ likeCount: 4, likedByMe: false, toggle: () => d.promise });
    await click();
    expect(pressed()).toBe(true);
    expect(count()).toBe("5");
    expect(button().disabled).toBe(true);
    await act(async () => {
      d.resolve({ liked: true, error: null });
    });
    expect(button().disabled).toBe(false);
  });

  it("rolls back and reports when the write fails", async () => {
    const onError = vi.fn();
    const toggle = vi.fn().mockResolvedValue({ liked: false, error: new Error("nope") });
    await render({ likeCount: 4, likedByMe: true, toggle, onError });
    await click();
    expect(pressed()).toBe(true);
    expect(count()).toBe("4");
    expect(onError).toHaveBeenCalledWith("nope");
  });

  it("defers to the server when it disagrees with the guess", async () => {
    // e.g. the row was liked on another device between read and write.
    const toggle = vi.fn().mockResolvedValue({ liked: true, error: null });
    await render({ likeCount: 4, likedByMe: true, toggle });
    await click();
    expect(pressed()).toBe(true);
    expect(count()).toBe("4");
  });
});

describe("LikeButton — re-renders", () => {
  it("ignores a stale row that arrives mid-toggle", async () => {
    const d = deferred<{ liked: boolean; error: Error | null }>();
    const toggle = () => d.promise;
    await render({ likeCount: 4, likedByMe: false, toggle });
    await click();
    // The feed polls and re-renders with the row as it was before the write.
    await render({ likeCount: 4, likedByMe: false, toggle });
    expect(pressed()).toBe(true);
    expect(count()).toBe("5");
    await act(async () => {
      d.resolve({ liked: true, error: null });
    });
    expect(count()).toBe("5");
  });

  it("adopts fresh values once idle", async () => {
    const toggle = vi.fn();
    await render({ likeCount: 4, likedByMe: false, toggle });
    await render({ likeCount: 9, likedByMe: true, toggle });
    expect(pressed()).toBe(true);
    expect(count()).toBe("9");
  });

  it("does not carry a like across a row change", async () => {
    // Lists recycle this button as the feed re-orders.
    const toggle = vi.fn();
    await render({ rowId: "note-1", likeCount: 4, likedByMe: true, toggle });
    await render({ rowId: "note-2", likeCount: 0, likedByMe: false, toggle });
    expect(pressed()).toBe(false);
    expect(count()).toBe("0");
  });
});
