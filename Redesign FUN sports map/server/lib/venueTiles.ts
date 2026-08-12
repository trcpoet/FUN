/**
 * The venue cache coverage grid.
 *
 * WHY THIS EXISTS
 * `osm_sports_venues` is a cache. A bbox with zero rows is ambiguous — either nobody has
 * imported the area yet, or we imported it and there is genuinely nothing there. The
 * client used to treat both as "empty" and stop, so un-imported cities showed no venues
 * forever. `public.venue_coverage` records which tiles we have actually looked at, and
 * this module owns the tile math on both sides of that table.
 *
 * Deliberately dependency-free (pure arithmetic, no DOM, no node, no imports) so the
 * client bundle, the edge routes and the ops scripts can all share ONE definition of the
 * grid. A second copy that rounded differently would let the client ask about tiles the
 * warm route never writes — a cache that looks permanently cold.
 */

export type TileBbox = { minLat: number; minLng: number; maxLat: number; maxLng: number };

export type VenueTile = { x: number; y: number };

/**
 * Tiles per degree. Integer on purpose: `lng * 10` carries far less float error than
 * `lng / 0.1`, so a coordinate sitting exactly on a tile seam lands on the same side
 * here as it does in Postgres' `floor()`.
 */
export const VENUE_TILES_PER_DEG = 10;

/** Grid size in degrees (~11.1 km of latitude). Mirrored in the venue_coverage migration. */
export const VENUE_TILE_DEG = 1 / VENUE_TILES_PER_DEG;

/**
 * How long a warmed tile stays trusted.
 *
 * OSM changes slowly and a re-warm costs an Overpass round trip, so this is generous —
 * the point is that coverage eventually refreshes on its own, not that it tracks OSM
 * closely. Ops can force a refresh sooner with `scripts/backfill-venues.mts`.
 */
export const VENUE_COVERAGE_TTL_DAYS = 90;

/**
 * Radius (km) a single warm request is allowed to cover.
 *
 * Much smaller than the 15 km display radius on purpose. Overpass cost scales with area,
 * and a 15 km bbox over a dense metro is measured in minutes (Los Angeles: 56s, London:
 * no response at all) — far past anything a request can wait for. We warm the ground the
 * user is actually looking at and let subsequent pans extend coverage outward.
 */
export const VENUE_WARM_RADIUS_KM = 6;

/** Most tiles one warm request may claim, so a single client cannot queue unbounded work. */
export const VENUE_WARM_MAX_TILES = 9;

const KM_PER_DEG_LAT = 111;

/**
 * Smallest cosine we will divide by, ~cos(84°).
 *
 * Meridians converge at the poles, so a fixed distance spans ever more longitude the further
 * north or south you go — and past ~84° the span exceeds the whole globe. Clamping here keeps
 * the box finite; `bboxFromCenterRadius` separately caps the result at ±180°.
 */
const MIN_LAT_COSINE = Math.cos((84 * Math.PI) / 180);

/**
 * Compute bbox for a circle of given radius (km) around center.
 *
 * Longitude degrees shrink as you move away from the equator, so the conversion has to use the
 * *actual* latitude. This previously hardcoded cos(40°), which silently mis-sized every request
 * made anywhere else: at Dallas (~32.7°) the box came out ~10% too wide (merely wasteful), but
 * at 60° it was ~35% too narrow — venues inside the radius were never fetched, and because the
 * basemap draws pitches from its own tiles, the gap showed up as "pitch visible, no icon".
 *
 * Lives here rather than in the client module so the map and the warm route derive the *same*
 * box from the same centre — a client asking about tiles the server never writes would look
 * exactly like a cache that never warms.
 */
export function bboxFromCenterRadius(
  centerLat: number,
  centerLng: number,
  radiusKm: number
): TileBbox {
  const dLat = radiusKm / KM_PER_DEG_LAT;
  const cosLat = Math.max(Math.abs(Math.cos((centerLat * Math.PI) / 180)), MIN_LAT_COSINE);
  const dLng = radiusKm / (KM_PER_DEG_LAT * cosLat);
  return {
    minLat: Math.max(-90, centerLat - dLat),
    maxLat: Math.min(90, centerLat + dLat),
    minLng: Math.max(-180, centerLng - dLng),
    maxLng: Math.min(180, centerLng + dLng),
  };
}

export function tileXForLng(lng: number): number {
  return Math.floor(lng * VENUE_TILES_PER_DEG);
}

export function tileYForLat(lat: number): number {
  return Math.floor(lat * VENUE_TILES_PER_DEG);
}

/** The bbox a tile covers. Inverse of {@link tileXForLng} / {@link tileYForLat}. */
export function tileToBbox(tile: VenueTile): TileBbox {
  return {
    minLng: tile.x * VENUE_TILE_DEG,
    maxLng: (tile.x + 1) * VENUE_TILE_DEG,
    minLat: tile.y * VENUE_TILE_DEG,
    maxLat: (tile.y + 1) * VENUE_TILE_DEG,
  };
}

/** Integer tile-index range covering a bbox — the shape the coverage query filters on. */
export function tileRangeForBbox(bbox: TileBbox): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
} {
  return {
    minX: tileXForLng(bbox.minLng),
    maxX: tileXForLng(bbox.maxLng),
    minY: tileYForLat(bbox.minLat),
    maxY: tileYForLat(bbox.maxLat),
  };
}

/** How many tiles a bbox spans. Compared against the coverage row count to detect gaps. */
export function tileCountForBbox(bbox: TileBbox): number {
  const r = tileRangeForBbox(bbox);
  return (r.maxX - r.minX + 1) * (r.maxY - r.minY + 1);
}

/** Every tile intersecting a bbox. */
export function tilesForBbox(bbox: TileBbox): VenueTile[] {
  const r = tileRangeForBbox(bbox);
  const tiles: VenueTile[] = [];
  for (let x = r.minX; x <= r.maxX; x++) {
    for (let y = r.minY; y <= r.maxY; y++) {
      tiles.push({ x, y });
    }
  }
  return tiles;
}

/**
 * Tiles nearest a point first.
 *
 * The warm job runs tiles in this order and writes coverage per tile, so the ground under
 * the user's viewport lands first and the map can paint it while the outer ring is still
 * being fetched. Ordering by squared distance between tile centres — no need for a real
 * geodesic here, and no sqrt.
 */
export function sortTilesByProximity(tiles: VenueTile[], lat: number, lng: number): VenueTile[] {
  const cx = lng * VENUE_TILES_PER_DEG - 0.5;
  const cy = lat * VENUE_TILES_PER_DEG - 0.5;
  return [...tiles].sort((a, b) => {
    const da = (a.x - cx) ** 2 + (a.y - cy) ** 2;
    const db = (b.x - cx) ** 2 + (b.y - cy) ** 2;
    return da - db;
  });
}

/** One `venue_coverage` row, as far as freshness is concerned. */
export type VenueCoverageRow = {
  warmed_at: string;
  /**
   * Absent on rows written before migration 20260813, and on any deployment that has not
   * applied it. Treated as 0 — "imported under an unknown tag set" — which is stale.
   */
  import_version?: number | null;
};

/**
 * `true` when a coverage row can no longer be trusted.
 *
 * Two independent reasons, and either is enough:
 *
 *  - **Age.** Older than {@link VENUE_COVERAGE_TTL_DAYS}, so OSM has probably moved on.
 *  - **Tag set.** Imported under a different set of Overpass tokens than we ask for now. A row
 *    can be minutes old and still be missing entire venue types, which is exactly what happened
 *    when four leisure tokens were added on 2026-08-12 — 169 rows stayed "fresh" while none of
 *    them had ever asked for the new types. Time alone cannot see that.
 */
export function isCoverageStale(
  row: VenueCoverageRow,
  currentImportVersion: number,
  now: number = Date.now()
): boolean {
  if ((row.import_version ?? 0) !== currentImportVersion) return true;
  const warmedAt = Date.parse(row.warmed_at);
  if (Number.isNaN(warmedAt)) return true;
  return now - warmedAt > VENUE_COVERAGE_TTL_DAYS * 24 * 60 * 60 * 1000;
}
