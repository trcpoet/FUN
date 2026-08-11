-- Venue cache coverage ledger.
--
-- WHY THIS EXISTS
-- `osm_sports_venues` is a cache, not a survey of the world, and a bbox with zero rows
-- is ambiguous: it can mean "nobody has ever imported this area" or "we imported it and
-- there genuinely are no pitches here". The client used to collapse both into `empty`
-- and short-circuit, so an un-imported area (Los Angeles, London) showed no venues
-- forever and the on-demand import was never called.
--
-- Reading zero rows now sends the client here. A tile with a row = we have looked;
-- no row = we have not. Without this table the alternative — re-importing whenever we
-- see zero rows — re-fetches every genuinely empty rural tile on every visit, which is
-- exactly the traffic pattern that gets us throttled off the public Overpass mirrors.
--
-- Grid: fixed lat/lng tiles of VENUE_TILE_DEG (0.1°) — see server/lib/venueTiles.ts,
-- which owns the tile math for the client, the warm route and the backfill script.
-- Keep the constant there and this comment in sync; they are the same grid.
create table if not exists public.venue_coverage (
  -- floor(lng / 0.1) and floor(lat / 0.1) — integers, so the grid can never drift.
  tile_x integer not null,
  tile_y integer not null,
  -- When this tile was last imported. Stale tiles are re-warmed; see VENUE_COVERAGE_TTL_DAYS.
  warmed_at timestamptz not null default now(),
  -- Rows written for this tile. 0 is a real, meaningful answer: "looked, found nothing".
  venue_count integer not null default 0,
  primary key (tile_x, tile_y)
);

comment on table public.venue_coverage is
  'Which 0.1-degree tiles of osm_sports_venues have been imported. Distinguishes "never fetched" from "fetched, genuinely empty" so the client knows whether to trigger a warm.';

-- Covering index for the only query shape there is: a tile_x/tile_y range for a bbox.
-- Includes warmed_at so the staleness check is an index-only scan rather than a heap hit.
create index if not exists venue_coverage_tile_idx
  on public.venue_coverage (tile_x, tile_y, warmed_at);

alter table public.venue_coverage enable row level security;

-- Public read, matching osm_sports_venues_public_read: guests browse the map, so the
-- client must be able to tell "not fetched yet" from "empty" without being signed in.
drop policy if exists "venue_coverage_public_read" on public.venue_coverage;
create policy "venue_coverage_public_read"
  on public.venue_coverage
  for select
  to anon, authenticated
  using (true);

-- Writes are service-role only (the warm route and the backfill script). No insert/update
-- policy is defined on purpose: service_role bypasses RLS, everyone else is denied, so a
-- client cannot mark an area "covered" and suppress its own imports.
