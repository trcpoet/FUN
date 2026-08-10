import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchDirections,
  directionsCooldownMsLeft,
  DirectionsError,
  RATE_LIMIT_FALLBACK_SEC,
} from "./directions";

const fetchMock = vi.fn();

/** Minimal stand-in for Response — only the four members fetchDirections touches. */
function reply(status: number, body: unknown, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => headers[k] ?? null },
    json: async () => body,
  };
}

const ROUTE = {
  durationSec: 600,
  distanceM: 800,
  geometry: { type: "LineString", coordinates: [] },
};

const ARGS = { from: { lat: 40.7, lng: -74.0 }, to: { lat: 40.75, lng: -73.98 } };

// The 429 cooldown is module-level, so every test starts well past any window a
// previous one armed rather than reaching for a test-only reset hatch.
let clock = new Date("2026-01-01T00:00:00Z").getTime();

beforeEach(() => {
  vi.useFakeTimers();
  clock += 10 * 60_000;
  vi.setSystemTime(clock);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("fetchDirections", () => {
  it("returns the route on 200", async () => {
    fetchMock.mockResolvedValue(reply(200, ROUTE));

    const { data, error } = await fetchDirections(ARGS);

    expect(error).toBeNull();
    expect(data).toEqual(ROUTE);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/directions");
    expect(JSON.parse(init.body)).toEqual(ARGS);
  });

  it("reports a non-429 failure with its status", async () => {
    fetchMock.mockResolvedValue(reply(500, {}));

    const { data, error } = await fetchDirections(ARGS);

    expect(data).toBeNull();
    expect(error).toBeInstanceOf(DirectionsError);
    expect((error as DirectionsError).status).toBe(500);
    expect((error as DirectionsError).rateLimited).toBe(false);
    expect(error?.message).toBe("Directions failed (500)");
    // A server error must not gate later requests.
    expect(directionsCooldownMsLeft()).toBe(0);
  });

  it("surfaces Retry-After on 429", async () => {
    fetchMock.mockResolvedValue(reply(429, {}, { "Retry-After": "30" }));

    const { data, error } = await fetchDirections(ARGS);

    expect(data).toBeNull();
    expect(error).toBeInstanceOf(DirectionsError);
    expect((error as DirectionsError).status).toBe(429);
    expect((error as DirectionsError).retryAfterSec).toBe(30);
    expect((error as DirectionsError).rateLimited).toBe(true);
    expect(error?.message).toMatch(/rate limited/i);
  });

  it("stops hitting the network while the 429 window is open", async () => {
    fetchMock.mockResolvedValue(reply(429, {}, { "Retry-After": "30" }));
    await fetchDirections(ARGS);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Three more attempts during the cooldown: still one network call.
    const second = await fetchDirections(ARGS);
    await fetchDirections(ARGS);
    await fetchDirections(ARGS);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second.data).toBeNull();
    expect((second.error as DirectionsError).rateLimited).toBe(true);
    expect(directionsCooldownMsLeft()).toBe(30_000);
  });

  it("lets requests through again once Retry-After elapses", async () => {
    fetchMock.mockResolvedValue(reply(429, {}, { "Retry-After": "30" }));
    await fetchDirections(ARGS);

    vi.setSystemTime(clock + 29_000);
    await fetchDirections(ARGS);
    expect(fetchMock).toHaveBeenCalledTimes(1); // still gated

    vi.setSystemTime(clock + 30_001);
    expect(directionsCooldownMsLeft()).toBe(0);
    fetchMock.mockResolvedValue(reply(200, ROUTE));
    const { data } = await fetchDirections(ARGS);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(data).toEqual(ROUTE);
  });

  it("falls back to a default window when 429 carries no Retry-After", async () => {
    fetchMock.mockResolvedValue(reply(429, {}));

    const { error } = await fetchDirections(ARGS);

    expect((error as DirectionsError).retryAfterSec).toBe(RATE_LIMIT_FALLBACK_SEC);
    expect(directionsCooldownMsLeft()).toBe(RATE_LIMIT_FALLBACK_SEC * 1000);
  });

  it("keeps the { data, error } shape when the network throws", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    const { data, error } = await fetchDirections(ARGS);

    expect(data).toBeNull();
    expect(error).toBeInstanceOf(Error);
    expect(error?.message).toBe("Failed to fetch");
    expect(directionsCooldownMsLeft()).toBe(0);
  });
});
