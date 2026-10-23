import { describe, it, expect, afterEach } from "vitest";
import React, { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useNavLoading } from "./useNavLoading";

// React's act() needs this flag or every render logs a warning.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = React.act;

let root: Root | null = null;
let start: ReturnType<typeof useNavLoading>["start"] | null = null;

function Probe() {
  start = useNavLoading().start;
  return null;
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  start = null;
});

describe("useNavLoading", () => {
  /**
   * StrictMode runs mount → unmount → mount. The hook's "still mounted?" flag was
   * only ever written by the cleanup, so after the remount it read "unmounted"
   * forever and `go` was never called: the map's Feed button did nothing in dev.
   */
  it("still navigates after a StrictMode remount", async () => {
    root = createRoot(document.createElement("div"));
    act(() => root!.render(React.createElement(StrictMode, null, React.createElement(Probe))));
    let went = false;
    await act(async () => {
      await start!("feed", () => Promise.resolve(), () => {
        went = true;
      });
    });
    expect(went).toBe(true);
  });

  it("does not navigate once the control has really unmounted", async () => {
    root = createRoot(document.createElement("div"));
    act(() => root!.render(React.createElement(Probe)));
    let release!: () => void;
    let went = false;
    const pending = start!("feed", () => new Promise<void>((r) => (release = r)), () => {
      went = true;
    });
    act(() => root!.unmount());
    root = null;
    release();
    await pending;
    expect(went).toBe(false);
  });
});
