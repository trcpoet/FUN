import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { createRoot, type Root } from "react-dom/client";

// Count Directions requests without touching the network. `importOriginal` keeps
// formatDirectionsSummary real, since the hook derives its summary from it.
const fetchDirectionsMock = vi.fn();
vi.mock("../lib/directions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/directions")>();
  return {
    ...actual,
    fetchDirections: (...args: unknown[]) => fetchDirectionsMock(...args),
  };
});

import { useRouteDirections, coordKey, parseCoordKey } from "./useRouteDirections";

// React's act() needs this flag or every render logs a warning.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = React.act;

/**
 * A resolved route. A *fresh object every call*, exactly like JSON.parse gives you —
 * that non-identity is what made setResult re-arm the old effect and spin.
 */
const route = () => ({
  data: {
    durationSec: 600,
    distanceM: 800,
    geometry: { type: "LineString" as const, coordinates: [] },
  },
  error: null,
});

/**
 * Past this many requests we stall instead of resolving. A runaway hook would
 * otherwise spin the microtask queue forever and *hang* the suite; stalling lets
 * the assertion below fail with a readable count instead.
 */
const RUNAWAY_CAP = 25;

type ProbeProps = { lat: number; lng: number; enabled?: boolean };

/**
 * Allocates brand-new `{ lat, lng }` objects on every render — the exact thing
 * GameEventPopup did at the top of its body. The hook must not care.
 */
function Probe({ lat, lng, enabled = true }: ProbeProps) {
  useRouteDirections({
    from: { lat: 40.7, lng: -74.0 },
    to: { lat, lng },
    enabled,
  });
  return null;
}

const el = (props: ProbeProps) => React.createElement(Probe, props);

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  fetchDirectionsMock.mockReset();
  fetchDirectionsMock.mockImplementation(() => {
    if (fetchDirectionsMock.mock.calls.length > RUNAWAY_CAP) {
      return new Promise(() => {}); // never settles — breaks a refetch loop
    }
    return Promise.resolve(route());
  });
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

describe("coordKey", () => {
  it("quantizes to 5 decimals so sub-metre jitter is the same key", () => {
    expect(coordKey({ lat: 40.7128123, lng: -74.0060456 })).toBe("40.71281,-74.00605");
    expect(coordKey({ lat: 40.7128124, lng: -74.0060455 })).toBe("40.71281,-74.00605");
  });

  it("rejects missing and non-finite coords", () => {
    expect(coordKey(null)).toBeNull();
    expect(coordKey(undefined)).toBeNull();
    expect(coordKey({ lat: Number.NaN, lng: 1 })).toBeNull();
    expect(coordKey({ lat: 1, lng: Number.POSITIVE_INFINITY })).toBeNull();
  });

  it("round-trips back to coords", () => {
    const key = coordKey({ lat: 40.7128, lng: -74.006 })!;
    expect(parseCoordKey(key)).toEqual({ lat: 40.7128, lng: -74.006 });
  });
});

describe("useRouteDirections", () => {
  it("fires exactly one request across repeated renders with the same coords", async () => {
    await act(async () => {
      root.render(el({ lat: 40.75, lng: -73.98 }));
    });
    expect(fetchDirectionsMock).toHaveBeenCalledTimes(1);

    // Re-render six times with identical coords but brand-new objects each time.
    for (let i = 0; i < 6; i += 1) {
      await act(async () => {
        root.render(el({ lat: 40.75, lng: -73.98 }));
      });
    }

    expect(fetchDirectionsMock).toHaveBeenCalledTimes(1);
  });

  it("does not re-arm itself when the request resolves", async () => {
    // The regression: setResult() stored a new object identity, which changed the
    // effect's `to`/`from` deps, which refired the effect, which fetched again…
    await act(async () => {
      root.render(el({ lat: 40.75, lng: -73.98 }));
    });
    // Give any queued refetch several microtask turns to show itself.
    for (let i = 0; i < 5; i += 1) {
      await act(async () => {
        await Promise.resolve();
      });
    }

    expect(fetchDirectionsMock).toHaveBeenCalledTimes(1);
  });

  it("refetches when the destination really moves", async () => {
    await act(async () => {
      root.render(el({ lat: 40.75, lng: -73.98 }));
    });
    expect(fetchDirectionsMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.render(el({ lat: 41.88, lng: -87.62 }));
    });

    expect(fetchDirectionsMock).toHaveBeenCalledTimes(2);
    expect(fetchDirectionsMock.mock.calls[1][0]).toMatchObject({
      to: { lat: 41.88, lng: -87.62 },
      profile: "walking",
    });
  });

  it("ignores movement finer than the 5-decimal key", async () => {
    await act(async () => {
      root.render(el({ lat: 40.75, lng: -73.98 }));
    });
    await act(async () => {
      root.render(el({ lat: 40.750000004, lng: -73.980000004 }));
    });

    expect(fetchDirectionsMock).toHaveBeenCalledTimes(1);
  });

  it("skips the request entirely while disabled, then fires once when enabled", async () => {
    await act(async () => {
      root.render(el({ lat: 40.75, lng: -73.98, enabled: false }));
    });
    expect(fetchDirectionsMock).not.toHaveBeenCalled();

    await act(async () => {
      root.render(el({ lat: 40.75, lng: -73.98, enabled: true }));
    });
    expect(fetchDirectionsMock).toHaveBeenCalledTimes(1);
  });

  it("does not set state after unmounting mid-flight", async () => {
    let settle: (v: unknown) => void = () => {};
    fetchDirectionsMock.mockImplementationOnce(
      () => new Promise((resolve) => {
        settle = resolve;
      })
    );
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    await act(async () => {
      root.render(el({ lat: 40.75, lng: -73.98 }));
    });
    await act(async () => {
      root.unmount();
    });

    // Resolve the request the unmounted component started.
    await act(async () => {
      settle(route());
    });

    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
    // afterEach unmounts again; a second unmount on the same root is a no-op.
    root = createRoot(document.createElement("div"));
  });
});
