-- Optimization Migration: Performance, Indexing, and Denormalization (v2)
--
-- Incorporates latest logic for privacy (onboarding, non-guest) and status (no expires_at).
-- 1) Adds missing indexes on foreign keys and frequently queried columns.
-- 2) Implements counter caching for game participants.
-- 3) Implements aggregate caching for athlete endorsements (sportsmanship).
-- 4) Refactors profile_locations to use geography for faster PostGIS queries.
-- 5) Updates RPCs to leverage cached values, spatial indexes, and latest privacy rules.

BEGIN;

-- 1. Indexing Optimizations
CREATE INDEX IF NOT EXISTS game_participants_user_id_idx ON public.game_participants(user_id);
CREATE INDEX IF NOT EXISTS profile_locations_updated_at_idx ON public.profile_locations(updated_at);
CREATE INDEX IF NOT EXISTS status_updates_user_created_idx ON public.status_updates(user_id, created_at DESC);

-- 2. Geography Column for profile_locations
DO $$ 
BEGIN 
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profile_locations' AND column_name = 'location_geography'
  ) THEN
    ALTER TABLE public.profile_locations ADD COLUMN location_geography geography(point, 4326);
  END IF;
END $$;

UPDATE public.profile_locations 
SET location_geography = ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography 
WHERE location_geography IS NULL;

CREATE INDEX IF NOT EXISTS profile_locations_location_geography_idx ON public.profile_locations USING GIST(location_geography);

-- 3. Participant Counter Cache for Games
DO $$ 
BEGIN 
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'games' AND column_name = 'participant_count'
  ) THEN
    ALTER TABLE public.games ADD COLUMN participant_count int DEFAULT 0;
  END IF;
END $$;

-- Initial count update
UPDATE public.games g
SET participant_count = (
  SELECT count(*)::int
  FROM public.game_participants gp
  WHERE gp.game_id = g.id
);

-- Trigger to maintain participant_count
CREATE OR REPLACE FUNCTION public.maintain_game_participant_count()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE public.games SET participant_count = participant_count + 1 WHERE id = NEW.game_id;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE public.games SET participant_count = participant_count - 1 WHERE id = OLD.game_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_maintain_game_participant_count ON public.game_participants;
CREATE TRIGGER tr_maintain_game_participant_count
AFTER INSERT OR DELETE ON public.game_participants
FOR EACH ROW EXECUTE FUNCTION public.maintain_game_participant_count();

-- 4. Endorsement Aggregate Cache for Profiles
DO $$ 
BEGIN 
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'sportsmanship_avg'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN sportsmanship_avg double precision;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'endorsement_count'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN endorsement_count int DEFAULT 0;
  END IF;
END $$;

-- Initial aggregate update
UPDATE public.profiles p
SET 
  sportsmanship_avg = (SELECT avg(rating)::double precision FROM public.athlete_endorsements WHERE athlete_id = p.id),
  endorsement_count = (SELECT count(*)::int FROM public.athlete_endorsements WHERE athlete_id = p.id);

-- Trigger to maintain endorsement aggregates
CREATE OR REPLACE FUNCTION public.maintain_profile_endorsement_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
    UPDATE public.profiles
    SET 
      sportsmanship_avg = (SELECT avg(rating)::double precision FROM public.athlete_endorsements WHERE athlete_id = NEW.athlete_id),
      endorsement_count = (SELECT count(*)::int FROM public.athlete_endorsements WHERE athlete_id = NEW.athlete_id)
    WHERE id = NEW.athlete_id;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE public.profiles
    SET 
      sportsmanship_avg = (SELECT avg(rating)::double precision FROM public.athlete_endorsements WHERE athlete_id = OLD.athlete_id),
      endorsement_count = (SELECT count(*)::int FROM public.athlete_endorsements WHERE athlete_id = OLD.athlete_id)
    WHERE id = OLD.athlete_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_maintain_profile_endorsement_stats ON public.athlete_endorsements;
CREATE TRIGGER tr_maintain_profile_endorsement_stats
AFTER INSERT OR UPDATE OR DELETE ON public.athlete_endorsements
FOR EACH ROW EXECUTE FUNCTION public.maintain_profile_endorsement_stats();

-- 5. Partial Spatial Index for Active Games
CREATE INDEX IF NOT EXISTS games_active_location_idx ON public.games USING GIST(location) 
WHERE status IN ('open', 'full', 'live');

-- 6. Optimized get_games_nearby (includes privacy rules)
DROP FUNCTION IF EXISTS public.get_games_nearby(double precision, double precision, double precision);
CREATE OR REPLACE FUNCTION public.get_games_nearby(
  lat double precision,
  lng double precision,
  radius_km double precision default 10
)
RETURNS TABLE (
  id uuid,
  title text,
  sport text,
  spots_needed int,
  starts_at timestamptz,
  created_by uuid,
  created_at timestamptz,
  status text,
  location_label text,
  description text,
  requirements jsonb,
  participant_count int,
  spots_remaining int,
  distance_km double precision,
  lat double precision,
  lng double precision,
  live_started_at timestamptz,
  ended_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    g.id,
    g.title,
    g.sport,
    g.spots_needed,
    g.starts_at,
    g.created_by,
    g.created_at,
    g.status,
    g.location_label,
    g.description,
    coalesce(g.requirements, '{}'::jsonb) as requirements,
    g.participant_count,
    greatest(g.spots_needed - g.participant_count, 0)::int as spots_remaining,
    (st_distance(g.location, st_point(lng, lat)::geography) / 1000.0) as distance_km,
    st_y(g.location::geometry) as lat,
    st_x(g.location::geometry) as lng,
    g.live_started_at,
    g.ended_at
  FROM public.games g
  WHERE st_dwithin(g.location, st_point(lng, lat)::geography, radius_km * 1000.0)
    AND g.status IN ('open', 'full', 'live')
    AND (
      g.status <> 'live'
      OR (coalesce(g.live_started_at, g.updated_at, g.created_at) > now() - interval '24 hours')
    )
    -- PRIVACY: Caller must not be anonymous and must have completed onboarding
    AND EXISTS (
      SELECT 1
      FROM auth.users u
      JOIN public.profiles p ON p.id = u.id
      WHERE u.id = auth.uid()
        AND NOT coalesce(u.is_anonymous, false)
        AND coalesce(p.onboarding_completed, false) = true
    )
  ORDER BY g.location <-> st_point(lng, lat)::geography
  LIMIT 50;
$$;

-- 7. Optimized get_profiles_nearby (includes privacy rules)
-- Use a loop to drop all versions of the function
DO $$
DECLARE
  fn regprocedure;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'get_profiles_nearby'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || fn::text || ' CASCADE';
  END LOOP;
END $$;

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
  -- PRIVACY: Ensure the target user is a verified auth user (not anon)
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
    AND pl.updated_at > now() - interval '45 minutes'
    -- PRIVACY: Target must not be anonymous and must have completed onboarding
    AND NOT coalesce(u.is_anonymous, false)
    AND coalesce(p.onboarding_completed, false) = true
    -- PRIVACY: Caller must not be anonymous and must be onboarded
    AND EXISTS (
      SELECT 1
      FROM auth.users caller_u
      JOIN public.profiles caller_p ON caller_p.id = caller_u.id
      WHERE caller_u.id = auth.uid()
        AND NOT coalesce(caller_u.is_anonymous, false)
        AND coalesce(caller_p.onboarding_completed, false) = true
    )
  ORDER BY pl.location_geography <-> st_point(lng, lat)::geography
  LIMIT limit_count;
$$;

-- 8. Optimized update_my_location
CREATE OR REPLACE FUNCTION public.update_my_location(p_lat double precision, p_lng double precision)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Ensure profile exists
  INSERT INTO public.profiles (id, display_name)
  VALUES (auth.uid(), 'Player')
  ON CONFLICT (id) DO NOTHING;
  
  INSERT INTO public.profile_locations (profile_id, lat, lng, location_geography, updated_at)
  VALUES (auth.uid(), p_lat, p_lng, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography, now())
  ON CONFLICT (profile_id) DO UPDATE SET 
    lat = p_lat, 
    lng = p_lng, 
    location_geography = ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
    updated_at = now();
END;
$$;

-- 9. Optimized get_my_game_inbox
CREATE OR REPLACE FUNCTION public.get_my_game_inbox()
RETURNS TABLE (
  id uuid,
  title text,
  sport text,
  starts_at timestamptz,
  location_label text,
  last_message_body text,
  last_message_at timestamptz,
  participant_count int,
  spots_remaining int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    g.id,
    g.title,
    g.sport,
    g.starts_at,
    g.location_label,
    lm.body as last_message_body,
    lm.created_at as last_message_at,
    g.participant_count,
    greatest(g.spots_needed - g.participant_count, 0)::int as spots_remaining
  FROM public.game_participants me
  JOIN public.games g ON g.id = me.game_id
  LEFT JOIN LATERAL (
    SELECT m.body, m.created_at
    FROM public.game_messages m
    WHERE m.game_id = g.id
    ORDER BY m.created_at DESC
    LIMIT 1
  ) lm ON true
  WHERE me.user_id = auth.uid()
  ORDER BY coalesce(lm.created_at, g.starts_at, g.created_at) DESC NULLS LAST;
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
