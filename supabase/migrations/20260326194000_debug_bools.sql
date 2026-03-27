create or replace function public.debug_bools(p_user_id uuid default auth.uid())
returns table(
  id uuid,
  title text,
  starts_at timestamptz,
  created_at timestamptz,
  is_not_null_recent boolean,
  is_null_recent boolean,
  final_bool boolean
)
language sql
security definer
set search_path = public
as $$
  select 
    id, 
    title, 
    starts_at, 
    created_at,
    (starts_at is not null and starts_at >= now() - interval '4 hours') as is_not_null_recent,
    (starts_at is null and created_at >= now() - interval '24 hours') as is_null_recent,
    (
      (starts_at is not null and starts_at >= now() - interval '4 hours')
      or
      (starts_at is null and created_at >= now() - interval '24 hours')
    ) as final_bool
  from public.games
  where created_by = p_user_id;
$$;
