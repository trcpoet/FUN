-- PostgREST returns 404 on POST /rest/v1/rpc/create_game if:
-- 1) The function is missing or has a different signature than the app expects, or
-- 2) EXECUTE was not granted to anon/authenticated.
--
-- Apply 20260321000000_games_requirements.sql first (defines create_game with p_requirements).
-- Then run this migration (or paste in SQL Editor).

grant execute on function public.create_game(
  text,
  text,
  double precision,
  double precision,
  int,
  timestamptz,
  text,
  text,
  jsonb
) to authenticated;

grant execute on function public.create_game(
  text,
  text,
  double precision,
  double precision,
  int,
  timestamptz,
  text,
  text,
  jsonb
) to anon;

notify pgrst, 'reload schema';
