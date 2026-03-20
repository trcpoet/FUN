-- Profile text search for unified map search (people path).
-- Requires: profiles.athlete_profile (jsonb) from 20250320000000_athlete_profile_jsonb.sql
-- Adds: generated search columns + pg_trgm indexes + search_profiles() RPC.

create extension if not exists pg_trgm;

-- Generated lowercase columns for index-friendly matching (no full-table scan on ILIKE).
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'display_name_search'
  ) then
    alter table public.profiles
      add column display_name_search text
      generated always as (lower(trim(coalesce(display_name, '')))) stored;
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'handle_search'
  ) then
    alter table public.profiles
      add column handle_search text
      generated always as (
        lower(trim(both '@' from trim(coalesce(athlete_profile->>'handle', ''))))
      ) stored;
  end if;
end $$;

create index if not exists profiles_display_name_search_trgm_idx
  on public.profiles using gin (display_name_search gin_trgm_ops);

create index if not exists profiles_handle_search_trgm_idx
  on public.profiles using gin (handle_search gin_trgm_ops)
  where length(handle_search) > 0;

comment on column public.profiles.display_name_search is
  'Lowercased display_name for trigram search; maintained by DB.';
comment on column public.profiles.handle_search is
  'Lowercased @handle from athlete_profile JSON; maintained by DB.';

-- Bounded people search: text match on name/handle, optional geo filter on profile_locations.
create or replace function public.search_profiles(
  q text,
  p_lat double precision default null,
  p_lng double precision default null,
  radius_km double precision default 80,
  limit_n int default 15,
  p_exclude uuid default null
)
returns table (
  profile_id uuid,
  display_name text,
  avatar_url text,
  handle text,
  city text,
  favorite_sport text,
  distance_km double precision,
  rank_score double precision
)
language sql
stable
security definer
set search_path = public
as $$
  with qn as (
    select nullif(trim(lower(coalesce(q, ''))), '') as n
  ),
  ref as (
    select case
      when p_lat is not null and p_lng is not null
      then st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography
      else null::geography
    end as g
  ),
  base as (
    select
      p.id as pid,
      p.display_name as dname,
      p.avatar_url as aurl,
      nullif(trim(both '@' from trim(coalesce(p.athlete_profile->>'handle', ''))), '') as h,
      nullif(trim(coalesce(p.athlete_profile->>'city', '')), '') as c,
      nullif(trim(coalesce(p.athlete_profile->>'favoriteSport', '')), '') as fs,
      p.display_name_search as dns,
      p.handle_search as hs,
      case
        when r.g is not null and pl.profile_id is not null
        then (
          st_distance(
            st_setsrid(st_makepoint(pl.lng, pl.lat), 4326)::geography,
            r.g
          ) / 1000.0
        )
        else null::double precision
      end as dist_km
    from public.profiles p
    cross join qn
    cross join ref r
    left join public.profile_locations pl on pl.profile_id = p.id
    where (p_exclude is null or p.id <> p_exclude)
      and qn.n is not null
      and length(qn.n) >= 2
      and (
        p.display_name_search % qn.n
        or (length(p.handle_search) > 0 and p.handle_search % qn.n)
        or p.display_name_search like qn.n || '%'
        or (length(p.handle_search) > 0 and p.handle_search like qn.n || '%')
        or p.display_name_search like '%' || qn.n || '%'
        or (length(p.handle_search) > 0 and p.handle_search like '%' || qn.n || '%')
      )
      and (
        r.g is null
        or pl.profile_id is null
        or st_dwithin(
          st_setsrid(st_makepoint(pl.lng, pl.lat), 4326)::geography,
          r.g,
          radius_km * 1000.0
        )
      )
  ),
  scored as (
    select
      b.*,
      greatest(
        case when b.dns = qn.n then 1.0::double precision else 0.0 end,
        case when length(b.hs) > 0 and b.hs = qn.n then 1.0::double precision else 0.0 end,
        similarity(b.dns, qn.n),
        case when length(b.hs) > 0 then similarity(b.hs, qn.n) else 0.0::double precision end
      ) as rnk,
      case
        when r.g is not null and b.dist_km is not null and b.dist_km <= 25 then 0.08::double precision
        when r.g is not null and b.dist_km is not null and b.dist_km <= 80 then 0.04::double precision
        else 0::double precision
      end as near_boost
    from base b
    cross join qn
    cross join ref r
  )
  select
    s.pid as profile_id,
    s.dname as display_name,
    s.aurl as avatar_url,
    s.h as handle,
    s.c as city,
    s.fs as favorite_sport,
    s.dist_km as distance_km,
    (s.rnk + s.near_boost)::double precision as rank_score
  from scored s
  order by rank_score desc, distance_km asc nulls last
  limit least(coalesce(nullif(limit_n, 0), 15), 25);
$$;

grant execute on function public.search_profiles(text, double precision, double precision, double precision, int, uuid) to anon, authenticated;
