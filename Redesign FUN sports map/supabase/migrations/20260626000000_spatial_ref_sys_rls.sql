-- PostGIS creates public.spatial_ref_sys (EPSG coordinate definitions) without RLS.
-- Supabase Security Advisor flags exposed tables in public that lack RLS.
-- FUN does not query this table via PostgREST; policy is read-only reference data.
--
-- spatial_ref_sys is owned by the PostGIS/superuser role, so the migration role
-- cannot ALTER it ("must be owner", SQLSTATE 42501) on hosted Supabase. This is a
-- known false-positive that requires superuser to resolve. Attempt it best-effort
-- and tolerate the ownership error so it never halts a migration push.
do $$
begin
  execute 'alter table public.spatial_ref_sys enable row level security';
  execute 'drop policy if exists "spatial_ref_sys_select" on public.spatial_ref_sys';
  execute 'create policy "spatial_ref_sys_select" on public.spatial_ref_sys '
       || 'for select to anon, authenticated using (true)';
exception
  when insufficient_privilege or undefined_table then
    raise notice 'spatial_ref_sys RLS skipped (not owner): %', sqlerrm;
end $$;
