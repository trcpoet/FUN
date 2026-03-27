create or replace function public.debug_get_source()
returns text
language sql
security definer
set search_path = public
as $$
  select prosrc
  from pg_proc
  where proname = 'get_active_hosted_games_count'
  limit 1;
$$;
