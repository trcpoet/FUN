-- Migration: Re-enforcing the absolute active game count limits

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
    and (
      (starts_at is not null and starts_at >= now() - interval '4 hours')
      or
      (starts_at is null and created_at >= now() - interval '24 hours')
    );
$$;
