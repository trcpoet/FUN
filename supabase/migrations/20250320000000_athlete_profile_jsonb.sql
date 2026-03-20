-- Extensible athlete identity: progressive disclosure, sport-aware sections stored as JSON.
-- PostgREST schema reload runs at the end of this file (NOTIFY pgrst). If you added the column
-- manually earlier, run in SQL Editor: NOTIFY pgrst, 'reload schema';
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'athlete_profile'
  ) then
    alter table public.profiles
      add column athlete_profile jsonb not null default '{}'::jsonb;
  end if;
end $$;

comment on column public.profiles.athlete_profile is
  'Athlete-facing profile extensions (handle, sports, metrics, experience, highlights, trust UI). Validated in app.';

-- Tell PostgREST to reload its schema cache so PATCH/SELECT see the new column immediately.
-- (If you already ran this migration before this line existed, run once in SQL Editor: NOTIFY pgrst, 'reload schema';)
notify pgrst, 'reload schema';
