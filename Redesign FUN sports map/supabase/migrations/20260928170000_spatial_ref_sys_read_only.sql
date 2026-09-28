-- A signed-out browser could write to PostGIS's coordinate-system table.
--
-- `spatial_ref_sys` came in with the postgis extension, in `public`, so PostgREST
-- serves it. supabase_admin owns it and granted anon and authenticated every
-- privilege on it, with RLS off. Verified against production before writing this:
-- a PATCH to /rest/v1/spatial_ref_sys with the publishable key returned 200, not
-- 42501.
--
-- Why that matters here: `games.location` and `profile_locations.location_geography`
-- are geography, which is SRID 4326, and PostGIS resolves 4326 by reading this
-- table. One `DELETE ?srid=eq.4326` from anyone holding the key in our JS bundle
-- would take out get_games_nearby, create_game, get_profiles_nearby and every other
-- distance query, for everyone, until someone noticed.
--
-- The obvious fixes are not available to `postgres`: it is not the owner, so it
-- cannot enable RLS, and it is not the grantor, so REVOKE is a silent no-op. It does
-- hold TRIGGER on the table, so the API roles are refused by a trigger instead.
-- Statement-level, so it also refuses a write that matches no rows, and TRUNCATE is
-- covered though PostgREST cannot issue one. supabase_admin is untouched, so a
-- postgis upgrade can still rewrite the table.
--
-- Reads are unaffected. The linter will keep reporting `rls_disabled_in_public` on
-- this table; only the owner can clear that.
--
-- Revert: drop trigger spatial_ref_sys_read_only on public.spatial_ref_sys;
--         drop function public.spatial_ref_sys_read_only();

create or replace function public.spatial_ref_sys_read_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    raise exception 'spatial_ref_sys is read-only' using errcode = '42501';
  end if;
  return null;
end;
$$;

-- A trigger function checks EXECUTE when the trigger is created, not when it fires,
-- so nothing needs to call this directly.
revoke all on function public.spatial_ref_sys_read_only() from public, anon, authenticated;

drop trigger if exists spatial_ref_sys_read_only on public.spatial_ref_sys;
create trigger spatial_ref_sys_read_only
  before insert or update or delete or truncate on public.spatial_ref_sys
  for each statement execute function public.spatial_ref_sys_read_only();
