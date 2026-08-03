-- =======================================================================
-- People-like-you nearby: opt-in discovery flag + similarity RPC
-- =======================================================================
-- "Similar" tab on the Feed page (src/app/pages/Feed.tsx) needs a pool of
-- candidates to rank. This is intentionally presence-independent: most
-- users default to Ghost mode on the live map (see
-- filter_presence_trust.sql), so gating matching on map visibility would
-- leave the tab nearly empty. Instead, discoverable_for_matching is a
-- separate opt-in the user flips on from the Similar tab itself.

alter table public.profiles
  add column if not exists discoverable_for_matching boolean not null default false;

-- -----------------------------------------------------------------------
-- 1. _athlete_sports_array — pull primarySports + secondarySports out of
--    profiles.athlete_profile (jsonb) as a flat, deduped text[].
--    Pure function, no table access, but locked to authenticated for
--    consistency with the rest of this schema's grant hygiene.
-- -----------------------------------------------------------------------
create or replace function public._athlete_sports_array(profile_json jsonb)
returns text[]
language sql
immutable
as $function$
  select coalesce(
    array(
      select distinct x
      from jsonb_array_elements_text(
        coalesce(nullif(profile_json->'primarySports', 'null'::jsonb), '[]'::jsonb)
        || coalesce(nullif(profile_json->'secondarySports', 'null'::jsonb), '[]'::jsonb)
      ) x
    ),
    array[]::text[]
  )
$function$;

grant execute on function public._athlete_sports_array(jsonb) to authenticated;
revoke execute on function public._athlete_sports_array(jsonb) from public, anon;

-- -----------------------------------------------------------------------
-- 2. get_similar_athletes — nearby, opted-in candidates ranked by shared
--    sports + availability overlap (equal weight), distance as a
--    tiebreaker only (not part of the score).
-- -----------------------------------------------------------------------
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
    (st_distance(pl.location_geography, st_point(lng, lat)::geography) / 1000.0) as distance_km,
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
      st_point(lng, lat)::geography,
      radius_km * 1000.0
    )
  order by final_score desc, distance_km asc
  limit limit_count;
end;
$function$;

grant execute on function public.get_similar_athletes(double precision, double precision, double precision, integer) to authenticated;
revoke execute on function public.get_similar_athletes(double precision, double precision, double precision, integer) from public, anon;
