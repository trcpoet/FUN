create or replace function public.debug_active_hosted_games(p_user_id uuid default auth.uid())
returns table(id uuid, title text, status text, starts_at timestamptz, created_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select id, title, status, starts_at, created_at
  from public.games
  where created_by = coalesce(p_user_id, auth.uid())
    and status in ('open', 'full')
    and (
      (starts_at is not null and starts_at >= now() - interval '4 hours')
      or
      (starts_at is null and created_at >= now() - interval '24 hours')
    );
$$;
