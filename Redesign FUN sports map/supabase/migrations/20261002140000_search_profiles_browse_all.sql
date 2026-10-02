-- `search_profiles` could only answer a question, never list the room.
--
-- It hard-filtered on `length(q) >= 2`, so an empty query returned nothing. The
-- feed's search button wants to open on "here is everyone", which needed either
-- a second function or this one to stop insisting on a query. A second function
-- would have meant a second copy of the eligibility rules — not anonymous,
-- email or phone confirmed, never yourself — and those are exactly the rules
-- you do not want drifting between two code paths.
--
-- Three modes now, same filters throughout:
--   no query      -> everyone eligible, nearest first, then alphabetical
--   one character -> plain substring match; trigram similarity needs two
--                    characters, and returning nothing while someone types the
--                    first letter reads as broken
--   two or more   -> unchanged: trigram, prefix and contains, ranked
--
-- `rank_score` is 0 in the first two modes, so the ORDER BY falls through to
-- distance and then name, which is the right shape for a browse list.
--
-- The result ceiling moves from 25 to 100. Existing callers are unaffected:
-- `searchPeople` caps itself at 25 before calling.

create or replace function public.search_profiles(
  q          text,
  p_lat      double precision default null,
  p_lng      double precision default null,
  radius_km  double precision default 80,
  limit_n    integer default 15,
  p_exclude  uuid default null
)
returns table(
  profile_id     uuid,
  display_name   text,
  avatar_url     text,
  handle         text,
  city           text,
  favorite_sport text,
  distance_km    double precision,
  rank_score     double precision
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with qn as (select nullif(trim(lower(coalesce(q, ''))), '') as n),
  ref as (
    select case when p_lat is not null and p_lng is not null
      then st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography
      else null::geography end as g
  ),
  base as (
    select p.id as pid, p.display_name as dname, p.avatar_url as aurl,
      nullif(trim(both '@' from trim(coalesce(p.athlete_profile->>'handle',''))),'') as h,
      nullif(trim(coalesce(p.athlete_profile->>'city','')),'') as c,
      nullif(trim(coalesce(p.athlete_profile->>'favoriteSport','')),'') as fs,
      p.display_name_search as dns, p.handle_search as hs,
      case when r.g is not null and pl.profile_id is not null
        then (st_distance(st_setsrid(st_makepoint(pl.lng, pl.lat),4326)::geography, r.g)/1000.0)
        else null::double precision end as dist_km
    from public.profiles p
    join auth.users u on u.id = p.id
    cross join qn cross join ref r
    left join public.profile_locations pl on pl.profile_id = p.id
    where (p_exclude is null or p.id <> p_exclude)
      and not coalesce(u.is_anonymous, false)
      and (u.email_confirmed_at is not null or u.phone_confirmed_at is not null
           or coalesce((p.athlete_profile->>'verified')::boolean,false) = true)
      and (
        qn.n is null
        or (length(qn.n) = 1 and (
              p.display_name_search like '%' || qn.n || '%'
           or (length(p.handle_search) > 0 and p.handle_search like '%' || qn.n || '%')))
        or (length(qn.n) >= 2 and (
              p.display_name_search % qn.n
           or (length(p.handle_search) > 0 and p.handle_search % qn.n)
           or p.display_name_search like qn.n || '%'
           or (length(p.handle_search) > 0 and p.handle_search like qn.n || '%')
           or p.display_name_search like '%' || qn.n || '%'
           or (length(p.handle_search) > 0 and p.handle_search like '%' || qn.n || '%')))
      )
      and (r.g is null or pl.profile_id is null
           or st_dwithin(st_setsrid(st_makepoint(pl.lng, pl.lat),4326)::geography,
                         r.g, radius_km * 1000.0))
  ),
  scored as (
    select b.*,
      case when qn.n is null or length(qn.n) < 2 then 0::double precision else greatest(
        case when b.dns = qn.n then 1.0::double precision else 0.0 end,
        case when length(b.hs) > 0 and b.hs = qn.n then 1.0::double precision else 0.0 end,
        similarity(b.dns, qn.n),
        case when length(b.hs) > 0 then similarity(b.hs, qn.n) else 0.0::double precision end
      ) end as rnk,
      case when r.g is not null and b.dist_km is not null and b.dist_km <= 25 then 0.08::double precision
           when r.g is not null and b.dist_km is not null and b.dist_km <= 80 then 0.04::double precision
           else 0::double precision end as near_boost
    from base b cross join qn cross join ref r
  )
  select s.pid, s.dname, s.aurl, s.h, s.c, s.fs, s.dist_km,
         (s.rnk + s.near_boost)::double precision
  from scored s
  order by (s.rnk + s.near_boost) desc, s.dist_km asc nulls last, lower(coalesce(s.dname,'')) asc
  limit least(coalesce(nullif(limit_n, 0), 15), 100);
$function$;

revoke all on function public.search_profiles(text, double precision, double precision, double precision, integer, uuid) from public, anon;
grant execute on function public.search_profiles(text, double precision, double precision, double precision, integer, uuid) to authenticated;
