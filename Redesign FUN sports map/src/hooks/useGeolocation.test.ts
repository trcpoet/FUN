import { describe, it, expect, beforeEach, afterEach } from "vitest";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { useApproxLocation, type ApproxLocation } from "./useGeolocation";

// React's act() needs this flag or every render logs a warning.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = React.act;

type Pending = {
  succeed: (lat: number, lng: number) => void;
  fail: () => void;
  options: PositionOptions | undefined;
};

/** A geolocation stub that holds each request until the test settles it. */
function stubGeolocation(): { last: () => Pending } {
  const calls: Pending[] = [];
  const geolocation = {
    getCurrentPosition(
      ok: PositionCallback,
      err: PositionErrorCallback | null | undefined,
      options?: PositionOptions
    ) {
      calls.push({
        succeed: (lat, lng) => ok({ coords: { latitude: lat, longitude: lng } } as GeolocationPosition),
        fail: () => err?.({ message: "User denied Geolocation" } as GeolocationPositionError),
        options,
      });
    },
  };
  Object.defineProperty(navigator, "geolocation", { value: geolocation, configurable: true });
  return { last: () => calls[calls.length - 1]! };
}

let container: HTMLDivElement;
let root: Root;
let seen: ApproxLocation[];

function Probe() {
  seen.push(useApproxLocation());
  return null;
}

function render() {
  act(() => root.render(React.createElement(Probe)));
}

const latest = () => seen[seen.length - 1]!;

beforeEach(() => {
  localStorage.clear();
  seen = [];
  container = document.createElement("div");
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
});

describe("useApproxLocation", () => {
  it("starts from the remembered position, so a page can query before any fix", () => {
    localStorage.setItem("fun_last_coords", JSON.stringify({ lat: 43.65, lng: -79.38 }));
    stubGeolocation();
    render();
    expect(seen[0]).toEqual({ coords: { lat: 43.65, lng: -79.38 }, locating: false, unavailable: false });
  });

  it("asks for a quick, cacheable fix rather than the map's precise one", () => {
    const geo = stubGeolocation();
    render();
    expect(geo.last().options).toMatchObject({ enableHighAccuracy: false });
    expect(geo.last().options?.maximumAge).toBeGreaterThan(0);
  });

  it("keeps the remembered object when the fix lands close by, so nothing re-fetches", () => {
    localStorage.setItem("fun_last_coords", JSON.stringify({ lat: 43.65, lng: -79.38 }));
    const geo = stubGeolocation();
    render();
    const before = latest().coords;
    act(() => geo.last().succeed(43.652, -79.381)); // ~250 m away
    expect(latest().coords).toBe(before);
  });

  it("moves to the fix when it is more than a kilometre from the remembered position", () => {
    localStorage.setItem("fun_last_coords", JSON.stringify({ lat: 43.65, lng: -79.38 }));
    const geo = stubGeolocation();
    render();
    act(() => geo.last().succeed(43.7, -79.38)); // ~5.5 km north
    expect(latest().coords).toEqual({ lat: 43.7, lng: -79.38 });
  });

  it("reports locating, not unavailable, while a first-ever fix is pending", () => {
    stubGeolocation();
    render();
    expect(latest()).toEqual({ coords: null, locating: true, unavailable: false });
  });

  it("reports unavailable only once the fix fails with nothing remembered", () => {
    const geo = stubGeolocation();
    render();
    act(() => geo.last().fail());
    expect(latest()).toEqual({ coords: null, locating: false, unavailable: true });
  });

  it("keeps showing the remembered position when the fix fails", () => {
    localStorage.setItem("fun_last_coords", JSON.stringify({ lat: 43.65, lng: -79.38 }));
    const geo = stubGeolocation();
    render();
    act(() => geo.last().fail());
    expect(latest()).toEqual({ coords: { lat: 43.65, lng: -79.38 }, locating: false, unavailable: false });
  });
});
