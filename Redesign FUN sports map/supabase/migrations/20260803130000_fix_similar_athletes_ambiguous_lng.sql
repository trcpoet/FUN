-- =======================================================================
-- Fix: get_similar_athletes failed with 42702 "column reference lng is
--      ambiguous" on every authenticated call (the Similar tab was empty).
-- =======================================================================
-- public.profile_locations has real lat/lng columns, and this function's
-- parameters are also named lat/lng. Inside RETURN QUERY -- whose FROM clause
-- includes profile_locations -- PL/pgSQL cannot tell the parameter from the
-- column, so it refuses to guess and aborts before returning a row.
--
-- This stayed invisible until a real session called it: callers with a null
-- auth.uid() return early and never reach the query, so the function only
-- breaks for authenticated users -- which is exactly what the Similar tab is.
--
-- Fixed at the source rather than by renaming the parameters: the origin point
-- is hoisted into a local variable in the DECLARE block, where there is no FROM
-- clause and lat/lng unambiguously mean the parameters. That keeps the RPC
-- signature byte-identical, so no client change is needed and the deployed
-- frontend starts working as soon as this lands. It also builds the origin
-- geography once instead of once per use.
--
-- Only lat/lng needed this. The other names this function shares with the
-- joined tables (profile_id, display_name, avatar_url, avatar_id) are always
-- written qualified (pl. / p.), so they were never ambiguous.

create or replace function public.get_similar_athletes(
  lat double precision,
  lng double precision,
  radius_km double precision default 5,
  limit_count integer default 20
)
returns table(
  profile_id uuid,
  display_name text,
  avatar_url text,
  avatar_id text,
  sportsmanship double precision,
  shared_sports text[],
  availability text,
  distance_km double precision,
  final_score double precision
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_my_sports text[];
  v_my_availability text;
  -- Resolved here, outside any FROM clause: no column named lat/lng is in
  -- scope, so these can only be the parameters.
  v_origin geography := st_point(lng, lat)::geography;
begin
  if v_uid is null then
    return;
  end if;

  select public._athlete_sports_array(p.athlete_profile), p.athlete_profile->>'availability'
    into v_my_sports, v_my_availability
  from public.profiles p
  where p.id = v_uid;

  return query
  select
    p.id as profile_id,
    p.display_name,
    p.avatar_url,
    p.avatar_id,
    p.sportsmanship_avg as sportsmanship,
    array(
      select distinct x
      from unnest(public._athlete_sports_array(p.athlete_profile)) x
      where x = any(coalesce(v_my_sports, array[]::text[]))
    ) as shared_sports,
    p.athlete_profile->>'availability' as availability,
    (st_distance(pl.location_geography, v_origin) / 1000.0) as distance_km,
    (
      -- sports/skill overlap: fraction of MY sports the candidate also plays
      0.5 * (
        case
          when coalesce(array_length(v_my_sports, 1), 0) = 0 then 0.0
          else (
            select count(*)::double precision
            from unnest(public._athlete_sports_array(p.athlete_profile)) x
            where x = any(v_my_sports)
          ) / array_length(v_my_sports, 1)
        end
      )
      +
      -- availability overlap: exact match wins, "open_to_games" is broadly
      -- compatible, "busy" on either side kills it, unknown = small credit
      0.5 * (
        case
          when v_my_availability is null or p.athlete_profile->>'availability' is null then 0.3
          when p.athlete_profile->>'availability' = v_my_availability then 1.0
          when v_my_availability = 'busy' or p.athlete_profile->>'availability' = 'busy' then 0.0
          when v_my_availability = 'open_to_games' or p.athlete_profile->>'availability' = 'open_to_games' then 0.6
          else 0.3
        end
      )
    ) as final_score
  from public.profile_locations pl
  join public.profiles p on p.id = pl.profile_id
  join auth.users u on u.id = p.id
  where p.id <> v_uid
    and coalesce(p.discoverable_for_matching, false) = true
    and not coalesce(u.is_anonymous, false)
    and st_dwithin(
      pl.location_geography,
      v_origin,
      radius_km * 1000.0
    )
  order by final_score desc, distance_km asc
  limit limit_count;
end;
$function$;

-- CREATE OR REPLACE preserves existing grants; restated so a from-scratch
-- rebuild lands in the same state as prod.
grant execute on function public.get_similar_athletes(double precision, double precision, double precision, integer) to authenticated;
revoke execute on function public.get_similar_athletes(double precision, double precision, double precision, integer) from public, anon;
