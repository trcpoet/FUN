-- Close games already stuck in status='live' past their window.
--
-- `status` only leaves 'live' when the host presses "End game", so a host who
-- walks away leaves the row live forever — it kept counting toward the map's
-- Live badge and the feed's Live section long after the game finished.
--
-- The read-side expiry predicates that stop this recurring live in
-- 20260801130000_profile_gender_and_game_gating.sql, which redefines both
-- get_games_nearby and get_live_nearby. This migration only repairs existing data.

update public.games
   set status     = 'completed',
       ended_at   = coalesce(ended_at, ends_at, now()),
       updated_at = now()
 where status = 'live'
   and ends_at is not null
   and ends_at < now();
