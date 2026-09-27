-- Save a venue.
--
-- The card offers Directions and Share, and nothing that says "I want to come
-- back to this one". Every other write in the app already has a home — games,
-- notes, reviews, comments, photos — so this is the gap.
--
-- Deliberately a table rather than a client-side list: a saved venue that lives
-- in localStorage is lost the moment someone opens the app on a different
-- phone, which is exactly when they would want it.
--
-- `venue_id` is text, not uuid: `osm_sports_venues.id` is an OSM identifier like
-- "way/642660826". No foreign key to that table on purpose — the OSM importer
-- deletes and reinserts rows on a re-import, and a cascade there would silently
-- wipe people's saves. An orphan save is harmless; the read joins and drops it.
--
-- Additive. Ships before the client that reads it.

create table if not exists public.saved_venues (
  user_id    uuid not null references auth.users(id) on delete cascade,
  venue_id   text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, venue_id)
);

-- The PK covers "is this one saved" (user_id first). This covers the reverse
-- question, for a future "12 people saved this".
create index if not exists saved_venues_venue_idx on public.saved_venues (venue_id);

comment on table public.saved_venues is
  'Venues a member bookmarked. venue_id is an OSM id (text) with no FK — the OSM '
  'importer replaces rows and a cascade would erase saves.';

alter table public.saved_venues enable row level security;

drop policy if exists "saved_venues: read own"  on public.saved_venues;
drop policy if exists "saved_venues: write own" on public.saved_venues;

-- Your saves are yours. Nobody else reads them, not even to count.
create policy "saved_venues: read own"
  on public.saved_venues as permissive for select to authenticated
  using (user_id = (select auth.uid()));

create policy "saved_venues: write own"
  on public.saved_venues as permissive for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.saved_venues from public, anon;
grant select, insert, delete on public.saved_venues to authenticated;
grant all on public.saved_venues to service_role;

-- ---------------------------------------------------------------------------
-- Toggle, returning the state AFTER the toggle.
-- Same shape as toggle_game_like, so the existing optimistic LikeButton pattern
-- in feed/LikeButton.tsx applies unchanged.
-- ---------------------------------------------------------------------------

create or replace function public.toggle_saved_venue(p_venue_id text)
returns boolean
language plpgsql
security invoker
set search_path to 'public'
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_n   int;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if coalesce(btrim(p_venue_id), '') = '' then
    raise exception 'missing_venue' using errcode = '22023';
  end if;

  delete from public.saved_venues
   where user_id = v_uid and venue_id = p_venue_id;
  get diagnostics v_n = row_count;
  if v_n > 0 then return false; end if;

  insert into public.saved_venues (user_id, venue_id)
  values (v_uid, p_venue_id)
  on conflict do nothing;
  return true;
end $function$;

revoke execute on function public.toggle_saved_venue(text) from public, anon;
grant execute on function public.toggle_saved_venue(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The list, joined to the venue so Profile can render rows without a second read.
-- Projects the lean map columns only — the same nine `get_venues_in_bbox`
-- settled on, for the same reason.
-- ---------------------------------------------------------------------------

create or replace function public.get_my_saved_venues(p_limit int default 100)
returns table (
  venue_id   text,
  saved_at   timestamptz,
  name       text,
  sport      text,
  leisure    text,
  lat        double precision,
  lng        double precision
)
language sql
stable
security invoker
set search_path to 'public'
as $function$
  select
    s.venue_id,
    s.created_at as saved_at,
    v.name,
    v.sport,
    v.leisure,
    v.lat,
    v.lng
  from public.saved_venues s
  -- Inner join: a save whose venue vanished from a re-import is not a row worth
  -- showing. It costs nothing to leave behind and would render as a blank card.
  join public.osm_sports_venues v on v.id = s.venue_id
  where s.user_id = (select auth.uid())
  order by s.created_at desc
  limit greatest(1, least(500, coalesce(p_limit, 100)));
$function$;

revoke execute on function public.get_my_saved_venues(int) from public, anon;
grant execute on function public.get_my_saved_venues(int) to authenticated, service_role;

/** Which of these venue ids has the viewer saved? One round-trip for a list. */
create or replace function public.get_saved_venue_ids(p_venue_ids text[])
returns table (venue_id text)
language sql
stable
security invoker
set search_path to 'public'
as $function$
  select s.venue_id
    from public.saved_venues s
   where s.user_id = (select auth.uid())
     and s.venue_id = any(p_venue_ids);
$function$;

revoke execute on function public.get_saved_venue_ids(text[]) from public, anon;
grant execute on function public.get_saved_venue_ids(text[]) to authenticated, service_role;

notify pgrst, 'reload schema';

-- Verification (as a member, then as anon):
--   select public.toggle_saved_venue('way/642660826');   -- true
--   select public.toggle_saved_venue('way/642660826');   -- false
--   select public.toggle_saved_venue('way/642660826');   -- true again
--   select * from public.get_my_saved_venues();          -- one row, joined to the venue
--   select * from public.get_saved_venue_ids(array['way/642660826','way/1']);
--   -- as anon: every one of the above is 42501, and `select * from saved_venues` is denied.
--   -- as another member: get_my_saved_venues() returns none of the first member's rows.
