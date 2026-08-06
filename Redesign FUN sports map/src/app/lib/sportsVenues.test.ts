import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * These tests pin down the difference between "there are no venues here" and
 * "we could not find out" — a distinction the venue pipeline used to collapse into
 * a bare `null`. Conflating them is how a soccer pitch could sit on screen with no
 * icon and no error: the DB read failed, the caller read that as "empty area", and
 * nothing anywhere said otherwise.
 */

const BBOX = { minLat: 32.72, maxLat: 32.74, minLng: -97.13, maxLng: -97.1 };

/** One venue row shaped like PostgREST returns it (Doug Russell Park's soccer pitch). */
const SOCCER_PITCH_ROW = {
  id: "way/461237079",
  lat: 32.7273042,
  lng: -97.1172948,
  name: null,
  sport: "soccer",
  leisure: "pitch",
  osm_type: "way",
  osm_id: 461237079,
};

/** Minimal PostgREST query-builder double: every filter returns `this`, awaiting resolves. */
function makeSupabaseStub(result: { data: unknown[] | null; error: unknown }) {
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "gte", "lte", "limit", "order", "abortSignal", "eq", "in"]) {
    builder[m] = vi.fn(() => builder);
  }
  builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return { from: vi.fn(() => builder) };
}

async function loadModule(supabaseStub: unknown) {
  vi.resetModules();
  vi.doMock("../../lib/supabase", () => ({ supabase: supabaseStub }));
  return import("./sportsVenues");
}

beforeEach(() => {
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.doUnmock("../../lib/supabase");
  vi.unstubAllGlobals();
});

describe("fetchSportsVenuesFromDb outcomes", () => {
  it("reports 'ok' with the rows it found", async () => {
    const { fetchSportsVenuesFromDb } = await loadModule(
      makeSupabaseStub({ data: [SOCCER_PITCH_ROW], error: null })
    );
    const out = await fetchSportsVenuesFromDb(BBOX);
    expect(out.status).toBe("ok");
    if (out.status !== "ok") return;
    expect(out.geojson.features).toHaveLength(1);
    expect(out.geojson.features[0]!.properties.id).toBe("way/461237079");
  });

  it("reports 'empty' — not 'unavailable' — when the area genuinely has no venues", async () => {
    const { fetchSportsVenuesFromDb } = await loadModule(makeSupabaseStub({ data: [], error: null }));
    expect((await fetchSportsVenuesFromDb(BBOX)).status).toBe("empty");
  });

  it("reports 'empty' when the sport filter removed every row", async () => {
    // Rows existed; the filter emptied them. That is not a broken database.
    const { fetchSportsVenuesFromDb } = await loadModule(
      makeSupabaseStub({ data: [SOCCER_PITCH_ROW], error: null })
    );
    const out = await fetchSportsVenuesFromDb(BBOX, { sportFilter: ["Tennis"] });
    expect(out.status).toBe("empty");
  });

  it("reports 'unavailable' with the error when PostgREST rejects the query", async () => {
    const { fetchSportsVenuesFromDb } = await loadModule(
      makeSupabaseStub({ data: null, error: { code: "42703", message: 'column "nope" does not exist' } })
    );
    const out = await fetchSportsVenuesFromDb(BBOX);
    expect(out.status).toBe("unavailable");
    if (out.status !== "unavailable") return;
    expect(out.error).toMatch(/does not exist/);
  });

  it("keeps a venue whose sport matches the filter", async () => {
    const { fetchSportsVenuesFromDb } = await loadModule(
      makeSupabaseStub({ data: [SOCCER_PITCH_ROW], error: null })
    );
    const out = await fetchSportsVenuesFromDb(BBOX, { sportFilter: ["Soccer"] });
    expect(out.status).toBe("ok");
  });
});

describe("fetchSportsVenues fallback policy", () => {
  it("does NOT hit the network when the DB says the area is simply empty", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { fetchSportsVenues } = await loadModule(makeSupabaseStub({ data: [], error: null }));

    const res = await fetchSportsVenues(BBOX);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(res.geojson.features).toHaveLength(0);
    expect(res.source).toBe("db");
  });

  it("falls back to the network only when the DB is actually unavailable", async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({ type: "FeatureCollection", features: [] }),
    }));
    vi.stubGlobal("fetch", fetchSpy);
    const { fetchSportsVenues } = await loadModule(
      makeSupabaseStub({ data: null, error: { code: "08006", message: "connection failure" } })
    );

    await fetchSportsVenues(BBOX);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("venue cache", () => {
  it("never caches an empty result, so one bad response cannot poison a bbox", async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({ type: "FeatureCollection", features: [] }),
    }));
    vi.stubGlobal("fetch", fetchSpy);
    const { fetchSportsVenuesFromOverpass } = await loadModule(makeSupabaseStub({ data: [], error: null }));

    await fetchSportsVenuesFromOverpass(BBOX);
    await fetchSportsVenuesFromOverpass(BBOX);

    // Second call must go out again rather than serve a cached empty collection.
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(sessionStorage.getItem("fun.sportsVenues.cache.v2")).toBeNull();
  });

  it("does cache a non-empty result", async () => {
    const feature = {
      type: "Feature",
      geometry: { type: "Point", coordinates: [-97.1172948, 32.7273042] },
      properties: { id: "way/461237079", sport: "soccer", leisure: "pitch" },
    };
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({ type: "FeatureCollection", features: [feature] }),
    }));
    vi.stubGlobal("fetch", fetchSpy);
    const { fetchSportsVenuesFromOverpass } = await loadModule(makeSupabaseStub({ data: [], error: null }));

    await fetchSportsVenuesFromOverpass(BBOX);
    const second = await fetchSportsVenuesFromOverpass(BBOX);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(second.source).toBe("cache");
  });
});

describe("missing-table skip latch", () => {
  it("expires instead of disabling DB reads for the whole session", async () => {
    const stub = makeSupabaseStub({
      data: null,
      error: { code: "PGRST205", message: "Could not find the table 'public.osm_sports_venues'" },
    });
    const { fetchSportsVenuesFromDb } = await loadModule(stub);

    await fetchSportsVenuesFromDb(BBOX);
    const callsAfterFirst = stub.from.mock.calls.length;

    // Immediately after: skipped (no new query).
    await fetchSportsVenuesFromDb(BBOX);
    expect(stub.from.mock.calls.length).toBe(callsAfterFirst);

    // After the cooldown: retried.
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 5 * 60_000);
    await fetchSportsVenuesFromDb(BBOX);
    vi.useRealTimers();
    expect(stub.from.mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });
});

/**
 * The longitude span of a fixed distance depends on latitude. This used to be computed with a
 * hardcoded cos(40°), so every request made anywhere else was mis-sized — harmlessly wide near
 * the equator, but dangerously narrow toward the poles, where venues inside the radius were
 * simply never fetched.
 */
describe("bboxFromCenterRadius", () => {
  const KM_PER_DEG_LAT = 111;

  /** Half-width of the box in km at the given latitude, i.e. what the caller asked for. */
  function lngHalfWidthKm(
    box: { minLng: number; maxLng: number },
    lat: number
  ): number {
    const degrees = (box.maxLng - box.minLng) / 2;
    return degrees * KM_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
  }

  it("covers the requested radius at the latitude it was asked about", async () => {
    const { bboxFromCenterRadius } = await loadModule(makeSupabaseStub({ data: [], error: null }));
    for (const lat of [0, 32.7, 40, 51.5, 60]) {
      const box = bboxFromCenterRadius(lat, -97.1, 10);
      expect(lngHalfWidthKm(box, lat)).toBeCloseTo(10, 6);
      expect((box.maxLat - box.minLat) / 2).toBeCloseTo(10 / KM_PER_DEG_LAT, 9);
    }
  });

  it("no longer under-fetches at high latitude (the actual bug)", async () => {
    const { bboxFromCenterRadius } = await loadModule(makeSupabaseStub({ data: [], error: null }));
    // The old constant produced this span regardless of where you were.
    const oldHalfSpanDeg = 10 / (KM_PER_DEG_LAT * Math.cos((40 * Math.PI) / 180));
    const box = bboxFromCenterRadius(60, 0, 10);
    const halfSpanDeg = (box.maxLng - box.minLng) / 2;
    // At 60° the true span is much wider than the 40° constant allowed for.
    expect(halfSpanDeg).toBeGreaterThan(oldHalfSpanDeg * 1.3);
  });

  it("still matches the old behaviour at the latitude that was hardcoded", async () => {
    const { bboxFromCenterRadius } = await loadModule(makeSupabaseStub({ data: [], error: null }));
    const oldHalfSpanDeg = 10 / (KM_PER_DEG_LAT * Math.cos((40 * Math.PI) / 180));
    const box = bboxFromCenterRadius(40, 0, 10);
    expect((box.maxLng - box.minLng) / 2).toBeCloseTo(oldHalfSpanDeg, 9);
  });

  it("treats north and south symmetrically", async () => {
    const { bboxFromCenterRadius } = await loadModule(makeSupabaseStub({ data: [], error: null }));
    const north = bboxFromCenterRadius(45, 10, 25);
    const south = bboxFromCenterRadius(-45, 10, 25);
    expect(north.maxLng - north.minLng).toBeCloseTo(south.maxLng - south.minLng, 9);
  });

  it("stays finite near the pole instead of dividing by ~zero", async () => {
    const { bboxFromCenterRadius } = await loadModule(makeSupabaseStub({ data: [], error: null }));
    const box = bboxFromCenterRadius(89.9, 0, 50);
    expect(Number.isFinite(box.minLng)).toBe(true);
    expect(Number.isFinite(box.maxLng)).toBe(true);
    expect(box.minLng).toBeGreaterThanOrEqual(-180);
    expect(box.maxLng).toBeLessThanOrEqual(180);
    expect(box.maxLat).toBeLessThanOrEqual(90);
  });
});
