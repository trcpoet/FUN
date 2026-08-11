-- Drop the legacy 9-argument `create_game` overload.
--
-- Two overloads were live at once:
--   (A) 9-arg  — p_title, p_sport, p_lat, p_lng, p_spots_needed, ...          <- dropped here
--   (B) 11-arg — p_title, p_sport, p_spots_needed, p_lat, p_lng, ..., p_visibility
--
-- (A) predates 20260501080000_game_duration_and_visibility.sql. It is SECURITY
-- DEFINER and executable by anon/authenticated, and it inserts games rows while
-- silently ignoring duration_minutes and visibility — i.e. a write path that
-- bypasses the game visibility rules enforced everywhere else.
--
-- The client (src/lib/api.ts) always calls (B) first and only falls back to (A)
-- on a specific "missing argument" error, so dropping (A) needs no code change;
-- the fallback branch simply becomes unreachable and fails safe.
--
-- NOT `cascade` on purpose: nothing should depend on this function, and a
-- cascade here could silently remove objects we do want.

drop function if exists public.create_game(
  text,                      -- p_title
  text,                      -- p_sport
  double precision,          -- p_lat
  double precision,          -- p_lng
  int,                       -- p_spots_needed
  timestamptz,               -- p_starts_at
  text,                      -- p_location_label
  text,                      -- p_description
  jsonb                      -- p_requirements
);

notify pgrst, 'reload schema';
