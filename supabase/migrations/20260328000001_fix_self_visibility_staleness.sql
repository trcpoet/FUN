-- Migration: Fix self-visibility on map
-- Relaxes the 45-minute stale check only for the current user's own profile
-- so they can always see their last reported position on the map.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_profiles_nearby(
  lat double precision,
  lng double precision,
  radius_km double precision default 5,
  limit_count int default 50
)
RETURNS TABLE (
  profile_id uuid,
  display_name text,
  avatar_url text,
  avatar_id text,
  sportsmanship double precision,
  status_body text,
  status_expires_at timestamptz,
  lat double precision,
  lng double precision,
  distance_km double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id as profile_id,
    p.display_name,
    p.avatar_url,
    p.avatar_id,
    p.sportsmanship_avg as sportsmanship,
    st.body as status_body,
    null::timestamptz as status_expires_at,
    pl.lat,
    pl.lng,
    (st_distance(pl.location_geography, st_point(lng, lat)::geography) / 1000.0) as distance_km
  FROM public.profile_locations pl
  JOIN public.profiles p ON p.id = pl.profile_id
  JOIN auth.users u ON u.id = p.id
  LEFT JOIN LATERAL (
    SELECT s.body
    FROM public.status_updates s
    WHERE s.user_id = p.id
    ORDER BY s.created_at DESC
    LIMIT 1
  ) st ON true
  WHERE st_dwithin(
      pl.location_geography,
      st_point(lng, lat)::geography,
      radius_km * 1000.0
    )
    -- STALE CHECK: Others must be active within 45m. Self is always shown if within search radius.
    AND (
      p.id = auth.uid()
      OR
      pl.updated_at > now() - interval '45 minutes'
    )
    -- PRIVACY RULES
    AND (
      -- Rule 1: Always show myself
      p.id = auth.uid()
      OR
      -- Rule 2: Show others if both target and caller are verified/onboarded
      (
        NOT coalesce(u.is_anonymous, false)
        AND coalesce(p.onboarding_completed, false) = true
        AND EXISTS (
          SELECT 1
          FROM auth.users caller_u
          JOIN public.profiles caller_p ON caller_p.id = caller_u.id
          WHERE caller_u.id = auth.uid()
            AND NOT coalesce(caller_u.is_anonymous, false)
            AND coalesce(caller_p.onboarding_completed, false) = true
        )
      )
    )
  ORDER BY pl.location_geography <-> st_point(lng, lat)::geography
  LIMIT limit_count;
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
