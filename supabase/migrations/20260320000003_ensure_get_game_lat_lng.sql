-- Ensure the RPC exists and PostgREST knows about it.
-- This fixes client errors like:
-- "POST .../rest/v1/rpc/get_game_lat_lng 404 (Not Found)"

drop function if exists public.get_game_lat_lng(uuid);

create or replace function public.get_game_lat_lng(p_game_id uuid)
returns table (
  lat double precision,
  lng double precision
)
language sql
stable
security definer
set search_path = public
as $$
  select
    st_y(g.location::geometry)::double precision as lat,
    st_x(g.location::geometry)::double precision as lng
  from public.games g
  where g.id = p_game_id
  limit 1;
$$;

grant execute on function public.get_game_lat_lng(uuid) to authenticated;
grant execute on function public.get_game_lat_lng(uuid) to anon;

notify pgrst, 'reload schema';

