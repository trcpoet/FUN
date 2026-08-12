-- ===========================================================================
-- venue_coverage.import_version — make a tag-set change invalidate coverage.
--
-- WHY
-- ---
-- `warmed_at` records WHEN a tile was imported. It has never recorded WHAT was
-- asked for, and on 2026-08-12 that gap cost a manual repair: four leisure
-- tokens were added to the Overpass query (adventure_park, fitness_station,
-- marina, slipway) and all 169 coverage rows stayed chronologically fresh while
-- none of them had ever requested the new venue types.
--
-- Nothing in the data could see it. The client kept reporting those tiles as
-- covered, the warm route kept skipping them as fresh, and the backfill script
-- reported "already imported" — so every affected tile had to be re-imported by
-- hand with `--force`, and the one tile that failed mid-run silently kept its
-- old row and got skipped on the retry.
--
-- Stamping the version the tile was imported under closes it: a row below the
-- current version is stale however recent it is, so the areas people actually
-- visit re-import on their own. Same mechanism as
-- `osm_sports_venues.enrichment_version`.
--
-- WHY THE DEFAULT IS 0 RATHER THAN THE CURRENT VERSION
-- ---------------------------------------------------
-- 0 means "imported before versioning existed, under an unknown tag set", which
-- is the honest description of every existing row — including the DFW tiles
-- re-warmed by hand on 2026-08-12, since nothing recorded what they used.
-- Treating them as current would leave the ~119 tiles imported under the OLD
-- token list permanently trusted, which is the exact bug this closes.
--
-- The cost is a one-time re-import of each tile someone visits. That is bounded
-- by real usage rather than by table size — an unvisited tile costs nothing —
-- and each re-import is an upsert over rows that mostly already exist.
--
-- The version itself is DERIVED from the token lists in
-- server/lib/osmVenueQuery.ts (`VENUE_IMPORT_VERSION`), not maintained by hand.
-- The failure being fixed was two lists drifting apart because someone had to
-- remember to reconcile them; a version that needs remembering would repeat it.
-- ===========================================================================

alter table public.venue_coverage
  add column if not exists import_version integer not null default 0;

comment on column public.venue_coverage.import_version is
  'Which Overpass token set this tile was imported under — VENUE_IMPORT_VERSION in '
  'server/lib/osmVenueQuery.ts, derived from the leisure+sport token lists. A row below the '
  'current value is stale regardless of warmed_at, so changing the tokens re-imports visited '
  'areas without a manual --force backfill. 0 = imported before this column existed.';

-- Readers filter on (tile_x, tile_y) via the primary key and then test freshness in
-- application code, so no index is needed here: import_version is never a search predicate.

notify pgrst, 'reload schema';
