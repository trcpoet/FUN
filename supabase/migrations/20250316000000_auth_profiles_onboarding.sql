-- Migration: auth profile creation trigger, onboarding_completed, profiles INSERT policy
-- Run AFTER schema.sql and gamification migration. Safe to run once.

-- ----- 1) onboarding_completed on profiles -----
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'onboarding_completed'
  ) then
    alter table public.profiles add column onboarding_completed boolean not null default false;
  end if;
end $$;

-- ----- 2) Trigger: create profile row when a new auth user is created -----
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, onboarding_completed)
  values (new.id, 'Player', false)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----- 3) RLS: allow users to insert their own profile (e.g. anonymous upgrade / fallback) -----
drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile" on public.profiles for insert with check (auth.uid() = id);
