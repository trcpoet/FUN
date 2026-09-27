-- Turn the notification bell on.
--
-- `supabase_realtime` has contained exactly two tables since it was created:
-- dm_messages and game_messages. No migration ever added `notifications`, so
-- `subscribeToNotifications` has never fired a single event, in production or
-- anywhere — the bell has been decorative for its entire life.
--
-- Safe to subscribe to unfiltered: the only SELECT policy on the table is
-- "notifications: read own" (`auth.uid() = user_id`, to authenticated), and
-- Realtime evaluates that policy with the subscriber's own JWT. A subscriber
-- therefore receives their own rows and nobody else's.

alter publication supabase_realtime add table public.notifications;
