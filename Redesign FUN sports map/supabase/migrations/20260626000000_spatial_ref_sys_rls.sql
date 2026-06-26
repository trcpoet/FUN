-- PostGIS creates public.spatial_ref_sys (EPSG coordinate definitions) without RLS.
-- Supabase Security Advisor flags exposed tables in public that lack RLS.
-- FUN does not query this table via PostgREST; policy is read-only reference data.

alter table if exists public.spatial_ref_sys enable row level security;

drop policy if exists "spatial_ref_sys_select" on public.spatial_ref_sys;
create policy "spatial_ref_sys_select"
  on public.spatial_ref_sys
  for select
  to anon, authenticated
  using (true);
