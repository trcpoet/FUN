-- Migration: Fix Active Hosted Games Count (Ignore Ghost Games)
-- Resolves an issue where games with starts_at IS NULL exist perpetually in an active state.

create or replace function public.get_active_hosted_games_count(p_user_id uuid default auth.uid())
returns int
language sql
security definer
set search_path = public
as $$
  select count(*)::int
  from public.games
  where created_by = coalesce(p_user_id, auth.uid())
    and status in ('open', 'full')
    -- A game is considered actively hosted if:
    -- 1. It explicitly starts in the future (or started very recently within 4 hours)
    -- 2. Or, if it has no start time (ghost game), it was created within the last 24 hours.
    and (
      (starts_at is not null and starts_at >= now() - interval '4 hours')
      or
      (starts_at is null and created_at >= now() - interval '24 hours')
    );
$$;
