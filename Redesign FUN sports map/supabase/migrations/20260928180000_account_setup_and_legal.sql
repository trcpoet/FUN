-- Age, gender, country and the legal documents, collected before an account exists.
--
-- FUN launches to two audiences that must never meet: teens (13-17) and adults (18+).
-- That line is drawn from a birthdate, so the birthdate has to be (a) asked for at
-- sign-up, (b) checked by the server rather than the form, (c) impossible to edit
-- afterwards, and (d) invisible to everyone but its owner. This migration does the
-- collection; the wall itself is the next phase.
--
-- How a sign-up is checked: the form sends birthdate, gender, country and the versions
-- of the documents it showed as auth metadata. `handle_new_user` reads them once, at
-- insert, and raises if the person is under their country's minimum age (or is a teen
-- while teen sign-ups are closed) -- the raise aborts the insert, so no account exists.
-- The answers are then copied into their own tables and stripped from the metadata,
-- which Supabase otherwise echoes into every session token.
--
-- A sign-up that sends no birthdate at all (an old cached client, a user created in the
-- dashboard) is still created, but `account_setup_complete` is false and the client
-- routes it to /account-setup, where `complete_account_setup` applies the same checks.
-- Phase 2 will treat an incomplete account as unable to interact, so skipping the form
-- buys nothing.

-- ---------------------------------------------------------------------------
-- Minimum age by country. Default 13 (COPPA and every app store). Higher where a
-- national law says so: GDPR Art. 8 digital-consent ages, below which parental consent
-- would be needed (FUN does not collect it, so the consent age is the minimum), and
-- Australia's social-media minimum age. VALUES NEED CONFIRMATION BY COUNSEL.
-- ---------------------------------------------------------------------------
create table if not exists public.min_age_by_country (
  country text primary key check (country ~ '^[A-Z]{2}$'),
  min_age smallint not null check (min_age between 13 and 18),
  basis text not null
);
alter table public.min_age_by_country enable row level security;
revoke all on public.min_age_by_country from anon, authenticated;

insert into public.min_age_by_country (country, min_age, basis) values
  ('AU', 16, 'Online Safety Amendment (Social Media Minimum Age) Act 2024'),
  ('AT', 14, 'GDPR Art. 8'), ('BE', 13, 'GDPR Art. 8'), ('BG', 14, 'GDPR Art. 8'),
  ('HR', 16, 'GDPR Art. 8'), ('CY', 14, 'GDPR Art. 8'), ('CZ', 15, 'GDPR Art. 8'),
  ('DK', 13, 'GDPR Art. 8'), ('EE', 13, 'GDPR Art. 8'), ('FI', 13, 'GDPR Art. 8'),
  ('FR', 15, 'GDPR Art. 8'), ('DE', 16, 'GDPR Art. 8'), ('GR', 15, 'GDPR Art. 8'),
  ('HU', 16, 'GDPR Art. 8'), ('IE', 16, 'GDPR Art. 8'), ('IT', 14, 'GDPR Art. 8'),
  ('LV', 13, 'GDPR Art. 8'), ('LT', 14, 'GDPR Art. 8'), ('LU', 16, 'GDPR Art. 8'),
  ('MT', 13, 'GDPR Art. 8'), ('NL', 16, 'GDPR Art. 8'), ('PL', 16, 'GDPR Art. 8'),
  ('PT', 13, 'GDPR Art. 8'), ('RO', 16, 'GDPR Art. 8'), ('SK', 16, 'GDPR Art. 8'),
  ('SI', 15, 'GDPR Art. 8'), ('ES', 14, 'GDPR Art. 8'), ('SE', 13, 'GDPR Art. 8'),
  ('IS', 13, 'GDPR Art. 8 (EEA)'), ('LI', 16, 'GDPR Art. 8 (EEA)'), ('NO', 13, 'GDPR Art. 8 (EEA)'),
  ('GB', 13, 'UK GDPR Art. 8'),
  ('KR', 14, 'Personal Information Protection Act, consent age'),
  ('CN', 14, 'PIPL Art. 31, consent age')
on conflict (country) do update set min_age = excluded.min_age, basis = excluded.basis;

-- Switches the product can flip without a deploy. Teen sign-ups stay closed until the
-- teen/adult wall (Phase 2) is live.
create table if not exists public.app_flags (
  key text primary key,
  enabled boolean not null,
  updated_at timestamptz not null default now()
);
alter table public.app_flags enable row level security;
revoke all on public.app_flags from anon, authenticated;
insert into public.app_flags (key, enabled) values ('teen_signups_open', false)
on conflict (key) do nothing;

-- The version of each document a person must have accepted. Bumping one sends every
-- member back through the accept screen. Must match LEGAL_VERSION in src/lib/legal.ts.
create table if not exists public.legal_documents (
  document text primary key check (document in ('terms', 'privacy', 'guidelines')),
  current_version text not null,
  updated_at timestamptz not null default now()
);
alter table public.legal_documents enable row level security;
revoke all on public.legal_documents from anon, authenticated;
insert into public.legal_documents (document, current_version) values
  ('terms', '2026-09-28'), ('privacy', '2026-09-28'), ('guidelines', '2026-09-28')
on conflict (document) do nothing;

-- ---------------------------------------------------------------------------
-- The private half of a profile. Owner-readable, never writable from the API: there is
-- no insert/update policy, so the only writers are the definer functions below, and a
-- birthdate cannot be edited to move between tiers. Corrections go through support or,
-- later, a verification result.
-- ---------------------------------------------------------------------------
create table if not exists public.profile_private (
  user_id uuid primary key references auth.users (id) on delete cascade,
  birthdate date not null,
  country text not null check (country ~ '^[A-Z]{2}$'),
  created_at timestamptz not null default now()
);
alter table public.profile_private enable row level security;
revoke all on public.profile_private from anon, authenticated;
grant select on public.profile_private to authenticated;
drop policy if exists "profile_private: owner reads" on public.profile_private;
create policy "profile_private: owner reads" on public.profile_private
  for select to authenticated using ((select auth.uid()) = user_id);

-- What each person accepted, when, and from which country. Append-only evidence.
create table if not exists public.legal_acceptances (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  document text not null references public.legal_documents (document),
  version text not null,
  country text,
  accepted_at timestamptz not null default now(),
  unique (user_id, document, version)
);
alter table public.legal_acceptances enable row level security;
revoke all on public.legal_acceptances from anon, authenticated;
grant select on public.legal_acceptances to authenticated;
drop policy if exists "legal_acceptances: owner reads" on public.legal_acceptances;
create policy "legal_acceptances: owner reads" on public.legal_acceptances
  for select to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Age helpers. `fun_age_tier` is the single definition of the line Phase 2 enforces.
-- ---------------------------------------------------------------------------
create or replace function public.fun_min_age(p_country text)
returns smallint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select m.min_age from public.min_age_by_country m where m.country = upper(btrim(p_country))),
    13
  )::smallint;
$$;

create or replace function public.fun_age_years(p_birthdate date)
returns integer
language sql
stable
set search_path = ''
as $$
  select extract(year from age(current_date, p_birthdate))::integer;
$$;

create or replace function public.fun_age_tier(p_birthdate date)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_birthdate is null then null
    when public.fun_age_years(p_birthdate) >= 18 then 'adult'
    else 'teen'
  end;
$$;

revoke all on function public.fun_min_age(text) from public, anon, authenticated;
revoke all on function public.fun_age_years(date) from public, anon, authenticated;
revoke all on function public.fun_age_tier(date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The one place the rules are applied, for both the sign-up trigger and the
-- setup screen. Raises a FUN_* code the client maps to a sentence.
-- ---------------------------------------------------------------------------
create or replace function public._fun_apply_account_setup(
  p_uid uuid,
  p_birthdate date,
  p_gender text,
  p_country text,
  p_accepted jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_country text := upper(btrim(coalesce(p_country, '')));
  v_accepted jsonb := coalesce(p_accepted, '{}'::jsonb);
  v_existing_country text;
  v_age integer;
  v_doc record;
begin
  select pp.country into v_existing_country from public.profile_private pp where pp.user_id = p_uid;

  -- Birthdate and country are set once. On a later call they are ignored, not rejected,
  -- so the accept-new-terms path can reuse this without re-sending them.
  if v_existing_country is null then
    if p_birthdate is null or v_country = '' then
      raise exception 'FUN_SETUP_INCOMPLETE';
    end if;
    if v_country !~ '^[A-Z]{2}$' then
      raise exception 'FUN_INVALID_COUNTRY';
    end if;
    if p_birthdate > current_date or p_birthdate < current_date - interval '120 years' then
      raise exception 'FUN_INVALID_BIRTHDATE';
    end if;
    v_age := public.fun_age_years(p_birthdate);
    if v_age < public.fun_min_age(v_country) then
      raise exception 'FUN_UNDER_MIN_AGE';
    end if;
    if v_age < 18 and not coalesce(
      (select f.enabled from public.app_flags f where f.key = 'teen_signups_open'), false
    ) then
      raise exception 'FUN_TEEN_SIGNUPS_CLOSED';
    end if;
    insert into public.profile_private (user_id, birthdate, country)
    values (p_uid, p_birthdate, v_country);
    v_existing_country := v_country;
  end if;

  if p_gender is not null then
    if p_gender not in ('man', 'woman', 'nonbinary') then
      raise exception 'FUN_INVALID_GENDER';
    end if;
    update public.profiles set gender = p_gender where id = p_uid;
  end if;

  -- Only the version the person was shown counts. A stale one means the page they read
  -- is older than the document now in force.
  for v_doc in select d.document, d.current_version from public.legal_documents d loop
    if v_accepted ? v_doc.document then
      if (v_accepted ->> v_doc.document) is distinct from v_doc.current_version then
        raise exception 'FUN_STALE_LEGAL_VERSION';
      end if;
      insert into public.legal_acceptances (user_id, document, version, country)
      values (p_uid, v_doc.document, v_doc.current_version, v_existing_country)
      on conflict (user_id, document, version) do nothing;
    end if;
  end loop;
end;
$$;

revoke all on function public._fun_apply_account_setup(uuid, date, text, text, jsonb)
  from public, anon, authenticated;

create or replace function public.fun_account_setup_complete(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
      select 1
      from public.profile_private pp
      join public.profiles p on p.id = pp.user_id
      where pp.user_id = p_uid and p.gender is not null
    )
    and not exists (
      select 1 from public.legal_documents d
      where not exists (
        select 1 from public.legal_acceptances a
        where a.user_id = p_uid and a.document = d.document and a.version = d.current_version
      )
    );
$$;
revoke all on function public.fun_account_setup_complete(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Sign-up: the same rules, applied at insert. A raise here aborts the auth.users
-- insert, so a refused sign-up leaves no account behind.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (id, display_name, onboarding_completed)
  values (new.id, 'Player', false)
  on conflict (id) do nothing;

  if v_meta ? 'birthdate' then
    perform public._fun_apply_account_setup(
      new.id,
      (v_meta ->> 'birthdate')::date,
      nullif(v_meta ->> 'gender', ''),
      v_meta ->> 'country',
      coalesce(v_meta -> 'accepted', '{}'::jsonb)
    );
    -- The answers now live in their own tables. Auth metadata is copied into every
    -- session token, so a birthdate left there would travel with every request.
    update auth.users
    set raw_user_meta_data = raw_user_meta_data - 'birthdate' - 'gender' - 'country' - 'accepted'
    where id = new.id;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- The client's three calls.
-- ---------------------------------------------------------------------------

-- What the sign-up form needs to explain a refusal before the server makes it.
-- Named get_guest_* because guests call it (see CLAUDE.md: guests execute only those).
create or replace function public.get_guest_signup_rules()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'default_min_age', 13,
    'min_age_by_country',
      coalesce((select jsonb_object_agg(m.country, m.min_age) from public.min_age_by_country m), '{}'::jsonb),
    'teen_signups_open',
      coalesce((select f.enabled from public.app_flags f where f.key = 'teen_signups_open'), false)
  );
$$;
revoke all on function public.get_guest_signup_rules() from public;
grant execute on function public.get_guest_signup_rules() to anon, authenticated;

create or replace function public.get_my_account_status()
returns table (
  has_birthdate boolean,
  has_gender boolean,
  missing_documents text[],
  age_tier text,
  teen_signups_open boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    pp.user_id is not null,
    p.gender is not null,
    coalesce(
      (select array_agg(d.document order by d.document)
       from public.legal_documents d
       where not exists (
         select 1 from public.legal_acceptances a
         where a.user_id = me.uid and a.document = d.document and a.version = d.current_version
       )),
      '{}'::text[]
    ),
    public.fun_age_tier(pp.birthdate),
    coalesce((select f.enabled from public.app_flags f where f.key = 'teen_signups_open'), false)
  from (select auth.uid() as uid) me
  left join public.profiles p on p.id = me.uid
  left join public.profile_private pp on pp.user_id = me.uid
  where me.uid is not null;
$$;
revoke all on function public.get_my_account_status() from public, anon;
grant execute on function public.get_my_account_status() to authenticated;

create or replace function public.complete_account_setup(
  p_birthdate date default null,
  p_gender text default null,
  p_country text default null,
  p_accepted jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'FUN_NOT_SIGNED_IN' using errcode = '42501';
  end if;
  perform public._fun_apply_account_setup(v_uid, p_birthdate, p_gender, p_country, p_accepted);
end;
$$;
revoke all on function public.complete_account_setup(date, text, text, jsonb) from public, anon;
grant execute on function public.complete_account_setup(date, text, text, jsonb) to authenticated;
