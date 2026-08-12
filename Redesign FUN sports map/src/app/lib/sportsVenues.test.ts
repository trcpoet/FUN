import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { bboxFromCenterRadius, tilesForBbox } from "../../../server/lib/venueTiles";
import { VENUE_IMPORT_VERSION } from "../../../server/lib/osmVenueQuery";

/**
 * These tests pin down the difference between "there are no venues here", "we have never
 * looked here" and "we could not find out" — three states the venue pipeline used to
 * collapse into one empty collection.
 *
 * That collapse was the bug. A city nobody had imported (Los Angeles, London) and a fetch
 * that had failed outright both arrived at the map looking like a quiet neighbourhood, so
 * the map said "no sports venues here" and nothing retried, logged, or disagreed.
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

type TableResult = { data: unknown[] | null; error: unknown };

/**
 * PostgREST query-builder double, per table: every filter returns `this`, awaiting resolves.
 * Table-aware because a zero-row venue read now asks `venue_coverage` whether anyone has
 * ever imported the area — the two answers have to be independently controllable.
 */
function makeSupabaseStub(
  byTable: Record<string, TableResult>,
  /** `rpcMissing` simulates a deployment that has not applied the proximity migration yet. */
  opts?: { rpcMissing?: boolean }
) {
  const from = vi.fn((table: string) => {
    const result = byTable[table] ?? { data: [], error: null };
    const builder: Record<string, unknown> = {};
    for (const m of ["select", "gte", "lte", "limit", "order", "abortSignal", "eq", "in", "or"]) {
      builder[m] = vi.fn(() => builder);
    }
    builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
    return builder;
  });

  // The venue read prefers `get_venues_in_bbox`, which serves the same rows as the table.
  // Params are declared so assertions can read back the function name and arguments.
  const rpc = vi.fn((_fn: string, _args?: Record<string, unknown>) => {
    const result: TableResult = opts?.rpcMissing
      ? { data: null, error: { code: "PGRST202", message: "Could not find the function" } }
      : (byTable.osm_sports_venues ?? { data: [], error: null });
    const builder: Record<string, unknown> = { abortSignal: vi.fn(() => builder) };
    builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
    return builder;
  });

  return { from, rpc };
}

/** Venue rows present, coverage irrelevant. */
const withVenues = (rows: unknown[]) => ({ osm_sports_venues: { data: rows, error: null } });

/** No venue rows, and no coverage record — i.e. nobody has imported this area. */
const uncachedArea = () => ({
  osm_sports_venues: { data: [], error: null },
  venue_coverage: { data: [], error: null },
});

/**
 * The 0.1° tiles BBOX touches. Its right edge lands exactly on -97.1, which is a tile
 * seam, so it spans two columns — worth stating explicitly, because "how many tiles does
 * this cover" is the comparison the covered/uncached decision turns on.
 */
const BBOX_TILES = [
  { tile_x: -972, tile_y: 327 },
  { tile_x: -971, tile_y: 327 },
];

/** No venue rows, but every tile in view has been imported recently. */
const importedButEmptyArea = () => ({
  osm_sports_venues: { data: [], error: null },
  venue_coverage: {
    data: BBOX_TILES.map((t) => ({ ...t, warmed_at: new Date().toISOString(), import_version: VENUE_IMPORT_VERSION })),
    error: null,
  },
});

/**
 * Coverage rows for every tile a centre+radius touches.
 *
 * Derived rather than hardcoded because `loadVenuesForArea` takes a centre and a radius,
 * and the resulting box straddles four tiles here — a hand-written list silently drifts
 * the moment the radius in a test changes. The arithmetic itself is pinned separately in
 * `src/lib/venueTiles.test.ts`; these tests are about the decision, not the grid.
 */
const coveredRowsFor = (lat: number, lng: number, radiusKm: number) =>
  tilesForBbox(bboxFromCenterRadius(lat, lng, radiusKm)).map((t) => ({
    tile_x: t.x,
    tile_y: t.y,
    warmed_at: new Date().toISOString(), import_version: VENUE_IMPORT_VERSION,
  }));

/**
 * Wait for the fire-and-forget warm walk to stop issuing requests, then report how many it made.
 *
 * `warmVenueArea` deliberately does not block the read it was triggered from, and it walks
 * several tiles in sequence — so reading `mock.calls.length` right after `loadVenuesForArea`
 * resolves catches the chain mid-flight and yields a number that keeps changing.
 */
async function settledFetchCount(spy: { mock: { calls: unknown[] } }): Promise<number> {
  let last = -1;
  // Bounded: a runaway loop must fail the test, not hang the suite.
  for (let i = 0; i < 50 && last !== spy.mock.calls.length; i++) {
    last = spy.mock.calls.length;
    await new Promise((r) => setTimeout(r, 0));
  }
  return spy.mock.calls.length;
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
      makeSupabaseStub(withVenues([SOCCER_PITCH_ROW]))
    );
    const out = await fetchSportsVenuesFromDb(BBOX);
    expect(out.status).toBe("ok");
    if (out.status !== "ok") return;
    expect(out.geojson.features).toHaveLength(1);
    expect(out.geojson.features[0]!.properties.id).toBe("way/461237079");
  });

  it("reads through the proximity RPC, not a bbox table scan", async () => {
    // PostgREST caps responses at 1000 rows, so whichever rows come back are the only ones the
    // map can ever see. Ordering by distance has to happen server-side, before that cap — the
    // old `.order("id")` read returned an arbitrary geographic sample and then sorted it, which
    // is how a 33 km pitch outranked venues that were never fetched.
    const stub = makeSupabaseStub(withVenues([SOCCER_PITCH_ROW]));
    const { fetchSportsVenuesFromDb } = await loadModule(stub);

    const out = await fetchSportsVenuesFromDb(BBOX);

    expect(out.status).toBe("ok");
    expect(stub.rpc).toHaveBeenCalledTimes(1);
    expect(stub.rpc.mock.calls[0]![0]).toBe("get_venues_in_bbox");
    expect(stub.rpc.mock.calls[0]![1]).toMatchObject({
      p_min_lat: BBOX.minLat,
      p_max_lat: BBOX.maxLat,
      p_min_lng: BBOX.minLng,
      p_max_lng: BBOX.maxLng,
    });
    // The table read is the fallback only; it must not fire when the RPC answers.
    expect(stub.from).not.toHaveBeenCalledWith("osm_sports_venues");
  });

  it("falls back to the bbox table read when the RPC is not deployed yet", async () => {
    // The migration ships separately from the bundle, so a deployment can legitimately run this
    // code before the function exists. Venues ordered by id beat no venues at all.
    const stub = makeSupabaseStub(withVenues([SOCCER_PITCH_ROW]), { rpcMissing: true });
    const { fetchSportsVenuesFromDb } = await loadModule(stub);

    const out = await fetchSportsVenuesFromDb(BBOX);

    expect(out.status).toBe("ok");
    if (out.status !== "ok") return;
    expect(out.geojson.features).toHaveLength(1);
    expect(stub.from).toHaveBeenCalledWith("osm_sports_venues");
  });

  it("drops private and residential venues from the layer", async () => {
    // The query already excludes these server-side; this covers the per-row backstop, which is
    // what protects the map if that filter and `venueAccessTier` ever drift apart.
    const { fetchSportsVenuesFromDb } = await loadModule(
      makeSupabaseStub(
        withVenues([
          SOCCER_PITCH_ROW,
          { ...SOCCER_PITCH_ROW, id: "way/1", access: "private" },
          { ...SOCCER_PITCH_ROW, id: "way/2", leisure: "swimming_pool", sport: null, name: null },
        ])
      )
    );
    const out = await fetchSportsVenuesFromDb(BBOX);
    expect(out.status).toBe("ok");
    if (out.status !== "ok") return;
    expect(out.geojson.features.map((f) => f.properties.id)).toEqual(["way/461237079"]);
  });

  it("keeps a named pool and a members-only venue", async () => {
    const { fetchSportsVenuesFromDb } = await loadModule(
      makeSupabaseStub(
        withVenues([
          { ...SOCCER_PITCH_ROW, id: "way/3", leisure: "swimming_pool", sport: null, name: "City Pool" },
          { ...SOCCER_PITCH_ROW, id: "way/4", access: "customers" },
        ])
      )
    );
    const out = await fetchSportsVenuesFromDb(BBOX);
    expect(out.status).toBe("ok");
    if (out.status !== "ok") return;
    expect(out.geojson.features.map((f) => f.properties.id)).toEqual(["way/3", "way/4"]);
  });

  it("reports 'empty' — not 'uncached' — when access filtering removed every row", async () => {
    // Same contract as the sport filter: rows existed, so re-importing would return the same
    // rows. Treating this as a missing import would warm the tile forever.
    const { fetchSportsVenuesFromDb } = await loadModule(
      makeSupabaseStub(withVenues([{ ...SOCCER_PITCH_ROW, access: "private" }]))
    );
    expect((await fetchSportsVenuesFromDb(BBOX)).status).toBe("empty");
  });

  it("reports 'uncached' — NOT 'empty' — when nobody has imported the area", async () => {
    // The actual bug: zero rows was read as "no venues here", so the import that would
    // have created them was never triggered and the area stayed blank forever.
    const { fetchSportsVenuesFromDb } = await loadModule(makeSupabaseStub(uncachedArea()));
    expect((await fetchSportsVenuesFromDb(BBOX)).status).toBe("uncached");
  });

  it("reports 'empty' when the area was imported and genuinely has no venues", async () => {
    const { fetchSportsVenuesFromDb } = await loadModule(makeSupabaseStub(importedButEmptyArea()));
    expect((await fetchSportsVenuesFromDb(BBOX)).status).toBe("empty");
  });

  it("treats coverage from an older token set as 'uncached', however recent it is", async () => {
    // The 2026-08-12 gap: four leisure tokens were added and all 169 coverage rows stayed
    // chronologically fresh while none had ever asked Overpass for the new venue types, so
    // every tile needed a manual --force re-import. A stamped version makes that self-healing.
    const { fetchSportsVenuesFromDb } = await loadModule(
      makeSupabaseStub({
        osm_sports_venues: { data: [], error: null },
        venue_coverage: {
          data: BBOX_TILES.map((t) => ({
            ...t,
            warmed_at: new Date().toISOString(),
            import_version: VENUE_IMPORT_VERSION - 1,
          })),
          error: null,
        },
      })
    );
    expect((await fetchSportsVenuesFromDb(BBOX)).status).toBe("uncached");
  });

  it("treats coverage written before versioning existed as 'uncached'", async () => {
    // The column defaults to 0 for pre-migration rows, which is honest: nothing recorded what
    // tag set they used, so they cannot be trusted to hold the current venue types.
    const { fetchSportsVenuesFromDb } = await loadModule(
      makeSupabaseStub({
        osm_sports_venues: { data: [], error: null },
        venue_coverage: {
          data: BBOX_TILES.map((t) => ({ ...t, warmed_at: new Date().toISOString(), import_version: 0 })),
          error: null,
        },
      })
    );
    expect((await fetchSportsVenuesFromDb(BBOX)).status).toBe("uncached");
  });

  it("treats expired coverage as 'uncached' so the cache refreshes on its own", async () => {
    const longAgo = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString();
    const { fetchSportsVenuesFromDb } = await loadModule(
      makeSupabaseStub({
        osm_sports_venues: { data: [], error: null },
        venue_coverage: {
          data: BBOX_TILES.map((t) => ({ ...t, warmed_at: longAgo })),
          error: null,
        },
      })
    );
    expect((await fetchSportsVenuesFromDb(BBOX)).status).toBe("uncached");
  });

  it("treats partial coverage as 'uncached' — one un-imported tile is a hole in the map", async () => {
    const { fetchSportsVenuesFromDb } = await loadModule(
      makeSupabaseStub({
        osm_sports_venues: { data: [], error: null },
        venue_coverage: {
          data: [{ ...BBOX_TILES[0]!, warmed_at: new Date().toISOString(), import_version: VENUE_IMPORT_VERSION }],
          error: null,
        },
      })
    );
    expect((await fetchSportsVenuesFromDb(BBOX)).status).toBe("uncached");
  });

  it("treats an unreadable coverage table as 'uncached' rather than declaring the area empty", async () => {
    // Guessing "covered" here would silently re-create the original bug for every user
    // whose coverage read failed; guessing "uncached" costs at most one warm request,
    // which the server de-duplicates against the same table anyway.
    const { fetchSportsVenuesFromDb } = await loadModule(
      makeSupabaseStub({
        osm_sports_venues: { data: [], error: null },
        venue_coverage: { data: null, error: { code: "PGRST205", message: "no venue_coverage" } },
      })
    );
    expect((await fetchSportsVenuesFromDb(BBOX)).status).toBe("uncached");
  });

  it("reports 'empty' when rows exist but the sport filter removed them all", async () => {
    // Rows existed; the filter emptied them. Re-importing would return the same rows,
    // so this must NOT look like a missing import.
    const { fetchSportsVenuesFromDb } = await loadModule(
      makeSupabaseStub(withVenues([SOCCER_PITCH_ROW]))
    );
    const out = await fetchSportsVenuesFromDb(BBOX, { sportFilter: ["Tennis"] });
    expect(out.status).toBe("empty");
  });

  it("reports 'unavailable' with the error when PostgREST rejects the query", async () => {
    const { fetchSportsVenuesFromDb } = await loadModule(
      makeSupabaseStub({
        osm_sports_venues: {
          data: null,
          error: { code: "42703", message: 'column "nope" does not exist' },
        },
      })
    );
    const out = await fetchSportsVenuesFromDb(BBOX);
    expect(out.status).toBe("unavailable");
    if (out.status !== "unavailable") return;
    expect(out.error).toMatch(/does not exist/);
  });

  it("keeps a venue whose sport matches the filter", async () => {
    const { fetchSportsVenuesFromDb } = await loadModule(
      makeSupabaseStub(withVenues([SOCCER_PITCH_ROW]))
    );
    const out = await fetchSportsVenuesFromDb(BBOX, { sportFilter: ["Soccer"] });
    expect(out.status).toBe("ok");
  });
});

describe("loadVenuesForArea", () => {
  const LAT = 32.73;
  const LNG = -97.115;

  it("never awaits a venue fetch over the network when the DB can answer", async () => {
    // The whole point of the rewrite. Overpass needs ~57s for Los Angeles and never
    // answers for London, so nothing on the render path may block on it.
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { loadVenuesForArea } = await loadModule(makeSupabaseStub(withVenues([SOCCER_PITCH_ROW])));

    const res = await loadVenuesForArea(LAT, LNG, 5);

    expect(res.status).toBe("ok");
    expect(res.geojson.features).toHaveLength(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not warm an area that was imported and is genuinely empty", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { loadVenuesForArea } = await loadModule(
      makeSupabaseStub({
        osm_sports_venues: { data: [], error: null },
        venue_coverage: { data: coveredRowsFor(LAT, LNG, 5), error: null },
      })
    );

    const res = await loadVenuesForArea(LAT, LNG, 5);

    expect(res.status).toBe("empty");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("asks the server to import an un-imported area, without waiting for it", async () => {
    // A warm request that never settles. Reaching the assertions below at all is the
    // proof: if the read awaited the import, this test would hang instead of fail.
    const fetchSpy = vi.fn((_url: string, _init?: RequestInit) => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetchSpy);
    const { loadVenuesForArea } = await loadModule(makeSupabaseStub(uncachedArea()));

    const res = await loadVenuesForArea(LAT, LNG, 5);

    expect(res.status).toBe("warming");
    expect(res.geojson.features).toHaveLength(0);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]![0]).toBe("/api/warm-venues");
  });

  it("does not re-request an import the map has already asked for", async () => {
    // The map re-reads on every settle; without this, panning around an un-imported city
    // would fire a warm request per frame-ish and get us rate-limited off Overpass.
    const fetchSpy = vi.fn(() => new Promise(() => {}));
    vi.stubGlobal("fetch", fetchSpy);
    const { loadVenuesForArea } = await loadModule(makeSupabaseStub(uncachedArea()));

    await loadVenuesForArea(LAT, LNG, 5);
    await loadVenuesForArea(LAT, LNG, 5);
    await loadVenuesForArea(LAT + 0.001, LNG + 0.001, 5);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("backs off a refused tile instead of re-asking on the next settle", async () => {
    // The 503 storm. A refusal used to make the tile immediately requestable again, and
    // `warmVenueArea` runs on every map settle — so a tile Overpass had just refused was
    // re-requested seconds later, filling the console with 503s and hammering the mirrors that
    // had already said no.
    const fetchSpy = vi.fn(async () => new Response("", { status: 503 }));
    vi.stubGlobal("fetch", fetchSpy);
    const { loadVenuesForArea } = await loadModule(makeSupabaseStub(uncachedArea()));

    await loadVenuesForArea(LAT, LNG, 5);
    // The warm walk is fire-and-forget and covers several tiles, so the count is still climbing
    // when the read resolves. Let it drain before measuring, or this asserts against a moving
    // number rather than against the cooldown.
    const afterFirst = await settledFetchCount(fetchSpy);
    expect(afterFirst).toBeGreaterThan(0);

    // Immediately re-reading the same ground must not re-ask.
    await loadVenuesForArea(LAT, LNG, 5);
    expect(await settledFetchCount(fetchSpy)).toBe(afterFirst);
  });

  it("retries a refused tile once the cooldown has elapsed", async () => {
    // The other half of the contract: backing off must not become giving up, or one bad minute
    // would leave that ground permanently un-importable for the session.
    const fetchSpy = vi.fn(async () => new Response("", { status: 503 }));
    vi.stubGlobal("fetch", fetchSpy);
    const { loadVenuesForArea } = await loadModule(makeSupabaseStub(uncachedArea()));

    await loadVenuesForArea(LAT, LNG, 5);
    const afterFirst = await settledFetchCount(fetchSpy);

    // Past the 5 minute cooldown.
    const realNow = Date.now;
    Date.now = () => realNow() + 6 * 60_000;
    try {
      await loadVenuesForArea(LAT, LNG, 5);
      expect(await settledFetchCount(fetchSpy)).toBeGreaterThan(afterFirst);
    } finally {
      Date.now = realNow;
    }
  });

  it("surfaces a failed read as 'unavailable' instead of an empty map", async () => {
    // Regression guard. The old code threw on failure and then caught its own throw one
    // block later, returning an empty collection with the error dropped — so a dead
    // pipeline reported itself as "no sports venues here".
    const { loadVenuesForArea } = await loadModule(
      makeSupabaseStub({
        osm_sports_venues: { data: null, error: { code: "08006", message: "connection failure" } },
      })
    );

    const res = await loadVenuesForArea(LAT, LNG, 5);

    expect(res.status).toBe("unavailable");
    expect(res.error).toMatch(/connection failure/);
  });
});

/**
 * Venues load only for an explicit act, and people re-ask for the same few places. The cache
 * exists so the second ask is free — NOT so the map can paint venues the viewport happens to
 * cross. Nothing reads it but `loadVenuesForArea`, which only an explicit act calls.
 */
describe("explicitly loaded areas are cached", () => {
  const LAT = 32.73;
  const LNG = -97.115;

  it("serves a repeat request for the same area without touching the database", async () => {
    const stub = makeSupabaseStub(withVenues([SOCCER_PITCH_ROW]));
    const { loadVenuesForArea } = await loadModule(stub);

    const first = await loadVenuesForArea(LAT, LNG, 5);
    const readsAfterFirst = stub.rpc.mock.calls.length;
    expect(readsAfterFirst).toBeGreaterThan(0);

    const second = await loadVenuesForArea(LAT, LNG, 5);

    expect(stub.rpc.mock.calls.length).toBe(readsAfterFirst);
    expect(second.status).toBe("ok");
    expect(second.geojson.features).toHaveLength(first.geojson.features.length);
  });

  it("misses when the sport filter differs, because those are different rows", async () => {
    const stub = makeSupabaseStub(withVenues([SOCCER_PITCH_ROW]));
    const { loadVenuesForArea } = await loadModule(stub);

    await loadVenuesForArea(LAT, LNG, 5, { sportFilter: ["Soccer"] });
    const readsAfterFirst = stub.rpc.mock.calls.length;
    await loadVenuesForArea(LAT, LNG, 5, { sportFilter: ["Tennis"] });

    expect(stub.rpc.mock.calls.length).toBeGreaterThan(readsAfterFirst);
  });

  it("treats a reordered sport filter as the same area", async () => {
    const stub = makeSupabaseStub(withVenues([SOCCER_PITCH_ROW]));
    const { loadVenuesForArea } = await loadModule(stub);

    await loadVenuesForArea(LAT, LNG, 5, { sportFilter: ["Soccer", "Tennis"] });
    const readsAfterFirst = stub.rpc.mock.calls.length;
    await loadVenuesForArea(LAT, LNG, 5, { sportFilter: ["Tennis", "Soccer"] });

    expect(stub.rpc.mock.calls.length).toBe(readsAfterFirst);
  });

  it("never caches a 'warming' area, or it would stay empty all session", async () => {
    // Same trap venue_coverage avoids: an area we could not answer for must stay askable, or
    // the import that is running right now would never be picked up.
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const stub = makeSupabaseStub(uncachedArea());
    const { loadVenuesForArea } = await loadModule(stub);

    const first = await loadVenuesForArea(LAT, LNG, 5);
    expect(first.status).toBe("warming");
    const readsAfterFirst = stub.rpc.mock.calls.length;

    const second = await loadVenuesForArea(LAT, LNG, 5);

    expect(second.status).toBe("warming");
    expect(stub.rpc.mock.calls.length).toBeGreaterThan(readsAfterFirst);
  });

  it("never caches an unavailable read", async () => {
    const stub = makeSupabaseStub({
      osm_sports_venues: { data: null, error: { code: "08006", message: "connection failure" } },
    });
    const { loadVenuesForArea } = await loadModule(stub);

    expect((await loadVenuesForArea(LAT, LNG, 5)).status).toBe("unavailable");
    const readsAfterFirst = stub.rpc.mock.calls.length;

    expect((await loadVenuesForArea(LAT, LNG, 5)).status).toBe("unavailable");
    expect(stub.rpc.mock.calls.length).toBeGreaterThan(readsAfterFirst);
  });
});

describe("missing-table skip latch", () => {
  it("expires instead of disabling DB reads for the whole session", async () => {
    const stub = makeSupabaseStub({
      osm_sports_venues: {
        data: null,
        error: { code: "PGRST205", message: "Could not find the table 'public.osm_sports_venues'" },
      },
    });
    const { fetchSportsVenuesFromDb } = await loadModule(stub);

    // Counted on `rpc`, not `from`: the venue read is the proximity RPC now, and `from` only
    // serves the coverage lookup, which an errored read never reaches.
    await fetchSportsVenuesFromDb(BBOX);
    const callsAfterFirst = stub.rpc.mock.calls.length;
    expect(callsAfterFirst).toBeGreaterThan(0);

    // Immediately after: skipped (no new query).
    await fetchSportsVenuesFromDb(BBOX);
    expect(stub.rpc.mock.calls.length).toBe(callsAfterFirst);

    // After the cooldown: retried.
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 5 * 60_000);
    await fetchSportsVenuesFromDb(BBOX);
    vi.useRealTimers();
    expect(stub.rpc.mock.calls.length).toBeGreaterThan(callsAfterFirst);
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
    const { bboxFromCenterRadius } = await loadModule(makeSupabaseStub({}));
    for (const lat of [0, 32.7, 40, 51.5, 60]) {
      const box = bboxFromCenterRadius(lat, -97.1, 10);
      expect(lngHalfWidthKm(box, lat)).toBeCloseTo(10, 6);
      expect((box.maxLat - box.minLat) / 2).toBeCloseTo(10 / KM_PER_DEG_LAT, 9);
    }
  });

  it("no longer under-fetches at high latitude (the actual bug)", async () => {
    const { bboxFromCenterRadius } = await loadModule(makeSupabaseStub({}));
    // The old constant produced this span regardless of where you were.
    const oldHalfSpanDeg = 10 / (KM_PER_DEG_LAT * Math.cos((40 * Math.PI) / 180));
    const box = bboxFromCenterRadius(60, 0, 10);
    const halfSpanDeg = (box.maxLng - box.minLng) / 2;
    // At 60° the true span is much wider than the 40° constant allowed for.
    expect(halfSpanDeg).toBeGreaterThan(oldHalfSpanDeg * 1.3);
  });

  it("still matches the old behaviour at the latitude that was hardcoded", async () => {
    const { bboxFromCenterRadius } = await loadModule(makeSupabaseStub({}));
    const oldHalfSpanDeg = 10 / (KM_PER_DEG_LAT * Math.cos((40 * Math.PI) / 180));
    const box = bboxFromCenterRadius(40, 0, 10);
    expect((box.maxLng - box.minLng) / 2).toBeCloseTo(oldHalfSpanDeg, 9);
  });

  it("treats north and south symmetrically", async () => {
    const { bboxFromCenterRadius } = await loadModule(makeSupabaseStub({}));
    const north = bboxFromCenterRadius(45, 10, 25);
    const south = bboxFromCenterRadius(-45, 10, 25);
    expect(north.maxLng - north.minLng).toBeCloseTo(south.maxLng - south.minLng, 9);
  });

  it("stays finite near the pole instead of dividing by ~zero", async () => {
    const { bboxFromCenterRadius } = await loadModule(makeSupabaseStub({}));
    const box = bboxFromCenterRadius(89.9, 0, 50);
    expect(Number.isFinite(box.minLng)).toBe(true);
    expect(Number.isFinite(box.maxLng)).toBe(true);
    expect(box.minLng).toBeGreaterThanOrEqual(-180);
    expect(box.maxLng).toBeLessThanOrEqual(180);
    expect(box.maxLat).toBeLessThanOrEqual(90);
  });
});

/**
 * A 5xx from the API layer says nothing about which venues exist. On 2026-08-11 one such
 * window blanked the whole map, so the venue read retries before reporting "unavailable".
 */
describe("fetchSportsVenuesFromDb retries a transient API failure", () => {
  /**
   * Like makeSupabaseStub, but hands out a different result on each venue read.
   *
   * The venue read is the proximity RPC now, so that is what the sequence drives; `from` only
   * serves the coverage lookup and always answers empty.
   */
  function makeSequencedStub(results: TableResult[]) {
    let i = 0;
    const thenable = (result: TableResult) => {
      const builder: Record<string, unknown> = {};
      for (const m of ["select", "gte", "lte", "limit", "order", "abortSignal", "eq", "in", "or"]) {
        builder[m] = vi.fn(() => builder);
      }
      builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
      return builder;
    };
    const rpc = vi.fn(() => thenable(results[Math.min(i++, results.length - 1)]!));
    const from = vi.fn(() => thenable({ data: [], error: null }));
    return { stub: { from, rpc }, attempts: () => i };
  }

  it("recovers when the retry succeeds, instead of reporting the area unavailable", async () => {
    const seq = makeSequencedStub([
      { data: null, error: { status: 503, message: "Service Unavailable" } },
      { data: [SOCCER_PITCH_ROW], error: null },
    ]);
    const { fetchSportsVenuesFromDb } = await loadModule(seq.stub);

    const out = await fetchSportsVenuesFromDb(BBOX);

    expect(seq.attempts()).toBe(2);
    expect(out.status).toBe("ok");
  });

  it("does not retry an error that is a final answer", async () => {
    const seq = makeSequencedStub([
      { data: null, error: { code: "42501", message: "permission denied for table osm_sports_venues" } },
    ]);
    const { fetchSportsVenuesFromDb } = await loadModule(seq.stub);

    const out = await fetchSportsVenuesFromDb(BBOX);

    expect(seq.attempts()).toBe(1);
    expect(out.status).toBe("unavailable");
  });
});
