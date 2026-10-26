import { describe, it, expect, afterEach } from "vitest";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { GameActionBar, type GameActionBarProps } from "./GameActionBar";
import type { GameViewerRole } from "../../lib/gameViewerRole";
import type { GameRow } from "../../../lib/supabase";

// React's act() needs this flag or every render logs a warning.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = React.act;

const game = { id: "g1", title: "Run", sport: "Basketball", spots_needed: 10, spots_remaining: 6 } as GameRow;

const visitor: GameViewerRole = {
  isHost: false,
  isJoined: false,
  isSubstitute: false,
  isLive: false,
  isEnded: false,
  canJoin: true,
  canLeave: false,
  canChat: false,
  canStart: false,
  canEnd: false,
  canDelete: false,
  canArchive: false,
};
const player: GameViewerRole = { ...visitor, isJoined: true, canJoin: false, canLeave: true, canChat: true };

let root: Root | null = null;
let container: HTMLDivElement;

function render(props: Partial<GameActionBarProps>) {
  act(() => root!.render(React.createElement(GameActionBar, { game, role: visitor, density: "full", ...props })));
}

/** A request the test settles by hand. */
function pending<T>() {
  let settle!: (v: T) => void;
  const promise = new Promise<T>((r) => (settle = r));
  return { promise, settle };
}

const button = (text: RegExp) =>
  [...container.querySelectorAll("button")].find((b) => text.test(b.textContent ?? "")) as HTMLButtonElement | undefined;
const text = () => container.textContent ?? "";

afterEach(() => {
  act(() => root?.unmount());
  root = null;
});

function mount() {
  container = document.createElement("div");
  root = createRoot(container);
}

describe("GameActionBar — Join", () => {
  it("says Joining… and cannot be pressed twice while the request is out", async () => {
    mount();
    const join = pending<boolean>();
    let calls = 0;
    render({ onJoin: () => (calls++, join.promise) });
    act(() => button(/I'm In/)!.click());
    expect(button(/Joining…/)?.disabled).toBe(true);
    act(() => button(/Joining…/)!.click());
    expect(calls).toBe(1);
    await act(async () => join.settle(true));
  });

  it("holds 'You're In' after a successful join until the role catches up", async () => {
    mount();
    const join = pending<boolean>();
    render({ onJoin: () => join.promise });
    act(() => button(/I'm In/)!.click());
    await act(async () => join.settle(true));
    // The caller's refetch has not landed: the role still says canJoin.
    expect(button(/I'm In/)).toBeUndefined();
    expect(text()).toContain("You're In");
    // It lands.
    render({ role: player, onJoin: () => join.promise, onLeave: () => Promise.resolve(null) });
    expect(button(/I'm Out/)).toBeDefined();
  });

  it("gives the button back when the join fails", async () => {
    mount();
    const join = pending<boolean>();
    render({ onJoin: () => join.promise });
    act(() => button(/I'm In/)!.click());
    await act(async () => join.settle(false));
    expect(button(/I'm In/)?.disabled).toBe(false);
  });
});

describe("GameActionBar — Leave", () => {
  it("says Leaving…, then stops offering Leave until the role catches up", async () => {
    mount();
    const leave = pending<Error | null>();
    render({ role: player, onLeave: () => leave.promise });
    act(() => button(/I'm Out/)!.click());
    expect(button(/Leaving…/)?.disabled).toBe(true);
    await act(async () => leave.settle(null));
    expect(button(/I'm Out|Leaving…/)).toBeUndefined();
    // The refetch lands: Join is offered again.
    render({ role: visitor, onLeave: () => leave.promise, onJoin: () => Promise.resolve(true) });
    expect(button(/I'm In/)).toBeDefined();
  });

  it("keeps Leave when leaving fails", async () => {
    mount();
    render({ role: player, onLeave: () => Promise.resolve(new Error("nope")) });
    await act(async () => button(/I'm Out/)!.click());
    expect(button(/I'm Out/)?.disabled).toBe(false);
  });
});
