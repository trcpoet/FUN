-- FUN sports map — production schema baseline
--
-- GENERATED FILE. Do not hand-edit; regenerate with:
--     node scripts/dump-schema.mjs > supabase/schema.sql
--
-- Captured from the linked Supabase project via Postgres introspection
-- (`supabase db dump` needs Docker, which this machine does not have).
--
-- This is the BASE. Apply supabase/migrations/*.sql in filename order on top of it.
-- Extension-owned objects (PostGIS, pg_trgm) are intentionally excluded — the
-- `create extension` statements below bring them back.
--
-- Generated: 2026-09-28T16:04:17.676Z

set search_path = public;

-- ======================================================================
-- Extensions
-- ======================================================================

create extension if not exists pg_cron;

create extension if not exists pg_net;

create extension if not exists pg_stat_statements;

create extension if not exists pg_trgm;

create extension if not exists pgcrypto;

create extension if not exists postgis;

create extension if not exists supabase_vault;

create extension if not exists "uuid-ossp";

-- ======================================================================
-- Tables
-- ======================================================================

create table if not exists public.app_flags (
  key text not null,
  enabled boolean not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.athlete_endorsements (
  id uuid default gen_random_uuid() not null,
  game_id uuid not null,
  athlete_id uuid not null,
  endorser_id uuid not null,
  rating integer not null,
  tags text[] default '{}'::text[] not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.badges (
  id uuid default gen_random_uuid() not null,
  slug text not null,
  name text not null,
  description text,
  criteria jsonb,
  created_at timestamp with time zone default now()
);

create table if not exists public.chat_reads (
  thread_kind text not null,
  thread_id uuid not null,
  user_id uuid not null,
  last_read_at timestamp with time zone default now() not null
);

create table if not exists public.dm_messages (
  id uuid default gen_random_uuid() not null,
  thread_id uuid not null,
  user_id uuid not null,
  body text not null,
  created_at timestamp with time zone default now() not null,
  client_id text,
  edited_at timestamp with time zone,
  deleted_at timestamp with time zone
);

create table if not exists public.dm_thread_members (
  thread_id uuid not null,
  user_id uuid not null,
  joined_at timestamp with time zone default now() not null
);

create table if not exists public.dm_threads (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.feed_media_post_comments (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  post_id uuid not null,
  user_id uuid not null,
  body text not null
);

create table if not exists public.feed_media_post_likes (
  post_id uuid not null,
  user_id uuid not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.feed_media_posts (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  body text,
  storage_path text not null,
  created_at timestamp with time zone default now() not null,
  visibility text default 'public'::text not null
);

create table if not exists public.game_chat_invites (
  id uuid default gen_random_uuid() not null,
  game_id uuid not null,
  invitee_user_id uuid not null,
  invited_by_user_id uuid not null,
  status text default 'pending'::text not null,
  created_at timestamp with time zone default now() not null,
  responded_at timestamp with time zone
);

create table if not exists public.game_comment_likes (
  comment_id uuid not null,
  user_id uuid not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.game_comments (
  id uuid default gen_random_uuid() not null,
  game_id uuid not null,
  user_id uuid not null,
  body text not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.game_likes (
  game_id uuid not null,
  user_id uuid not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.game_messages (
  id uuid default gen_random_uuid() not null,
  game_id uuid not null,
  user_id uuid not null,
  body text not null,
  created_at timestamp with time zone default now() not null,
  client_id text,
  edited_at timestamp with time zone,
  deleted_at timestamp with time zone
);

create table if not exists public.game_outcome_reports (
  game_id uuid not null,
  user_id uuid not null,
  outcome text not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.game_participants (
  id uuid default gen_random_uuid() not null,
  game_id uuid not null,
  user_id uuid not null,
  joined_at timestamp with time zone default now(),
  role text default 'player'::text not null,
  confirmed_result boolean default false not null,
  chat_hidden_at timestamp with time zone
);

create table if not exists public.game_poll_votes (
  poll_id uuid not null,
  user_id uuid not null,
  choice text not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.game_polls (
  id uuid default gen_random_uuid() not null,
  game_id uuid not null,
  created_by uuid not null,
  kind text default 'rematch'::text not null,
  question text,
  created_at timestamp with time zone default now() not null,
  closed_at timestamp with time zone
);

create table if not exists public.game_results (
  id uuid default gen_random_uuid() not null,
  game_id uuid not null,
  winner_team_or_user text,
  score jsonb,
  confirmed_by_host boolean default false not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.games (
  id uuid default gen_random_uuid() not null,
  title text not null,
  sport text not null,
  spots_needed integer default 2 not null,
  starts_at timestamp with time zone,
  location geography(Point,4326) not null,
  created_by uuid,
  created_at timestamp with time zone default now(),
  status text default 'open'::text not null,
  updated_at timestamp with time zone default now() not null,
  location_label text,
  description text,
  requirements jsonb default '{}'::jsonb not null,
  live_started_at timestamp with time zone,
  ended_at timestamp with time zone,
  participant_count integer default 0,
  lat double precision,
  lng double precision,
  duration_minutes integer default 90 not null,
  ends_at timestamp with time zone,
  visibility text default 'public'::text not null,
  invite_token uuid default gen_random_uuid() not null
);

create table if not exists public.legal_acceptances (
  id bigint not null,
  user_id uuid not null,
  document text not null,
  version text not null,
  country text,
  accepted_at timestamp with time zone default now() not null
);

create table if not exists public.legal_documents (
  document text not null,
  current_version text not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.map_note_comment_likes (
  comment_id uuid not null,
  user_id uuid not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.map_note_comments (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  note_id uuid not null,
  user_id uuid not null,
  body text not null,
  client_id text,
  edited_at timestamp with time zone,
  deleted_at timestamp with time zone
);

create table if not exists public.map_note_likes (
  note_id uuid not null,
  user_id uuid not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.map_notes (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  created_by uuid not null,
  lat double precision not null,
  lng double precision not null,
  body text not null,
  visibility text default 'public'::text not null,
  place_name text
);

create table if not exists public.min_age_by_country (
  country text not null,
  min_age smallint not null,
  basis text not null
);

create table if not exists public.notifications (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  type text not null,
  payload jsonb default '{}'::jsonb,
  is_read boolean default false not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.osm_sports_venues (
  id text not null,
  lat double precision not null,
  lng double precision not null,
  name text,
  sport text,
  leisure text,
  osm_type text not null,
  osm_id bigint not null,
  imported_at timestamp with time zone default now() not null,
  surface text,
  lit text,
  access text,
  opening_hours text,
  website text,
  operator text,
  wikidata text,
  hero_image_url text,
  wikidata_label text,
  wikidata_description text,
  enriched_at timestamp with time zone,
  google_place_id text,
  google_photo_name text,
  photo_attributions jsonb,
  enrichment_source text,
  tags jsonb,
  photos jsonb,
  google_details jsonb,
  enrichment_version integer default 0 not null
);

create table if not exists public.profile_locations (
  profile_id uuid not null,
  lat double precision not null,
  lng double precision not null,
  updated_at timestamp with time zone default now() not null,
  location_geography geography(Point,4326),
  location_visibility text default 'ghost'::text not null
);

create table if not exists public.profile_private (
  user_id uuid not null,
  birthdate date not null,
  country text not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.profiles (
  id uuid not null,
  display_name text,
  avatar_url text,
  updated_at timestamp with time zone default now(),
  avatar_id text,
  onboarding_completed boolean default false not null,
  athlete_profile jsonb default '{}'::jsonb not null,
  display_name_search text generated always as (lower(TRIM(BOTH FROM COALESCE(display_name, ''::text)))) stored,
  handle_search text generated always as (lower(TRIM(BOTH '@'::text FROM TRIM(BOTH FROM COALESCE((athlete_profile ->> 'handle'::text), ''::text))))) stored,
  sportsmanship_avg double precision,
  endorsement_count integer default 0,
  gender text,
  discoverable_for_matching boolean default false not null
);

create table if not exists public.push_notifications_sent (
  user_id uuid not null,
  game_id uuid not null,
  sent_at timestamp with time zone default now() not null
);

create table if not exists public.saved_venues (
  user_id uuid not null,
  venue_id text not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.status_comments (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  status_id uuid not null,
  user_id uuid not null,
  body text not null
);

create table if not exists public.status_likes (
  status_id uuid not null,
  user_id uuid not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.status_updates (
  user_id uuid not null,
  body text not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.user_badges (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  badge_id uuid not null,
  awarded_at timestamp with time zone default now() not null
);

create table if not exists public.user_follows (
  follower_id uuid not null,
  followed_id uuid not null,
  created_at timestamp with time zone default now() not null,
  status text default 'accepted'::text not null
);

create table if not exists public.user_push_tokens (
  token text not null,
  user_id uuid not null,
  platform text default 'ios'::text not null,
  created_at timestamp with time zone default now() not null,
  last_seen_at timestamp with time zone default now() not null
);

create table if not exists public.user_stats (
  user_id uuid not null,
  games_played_total integer default 0 not null,
  games_played_by_sport jsonb default '{}'::jsonb not null,
  current_streak_days integer default 0 not null,
  longest_streak_days integer default 0 not null,
  xp integer default 0 not null,
  level integer default 1 not null,
  last_game_date date,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.user_statuses (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  body text not null,
  created_at timestamp with time zone default now() not null,
  expires_at timestamp with time zone not null
);

create table if not exists public.venue_comment_likes (
  comment_id uuid not null,
  user_id uuid not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.venue_comments (
  id uuid default gen_random_uuid() not null,
  venue_id text not null,
  user_id uuid not null,
  body text not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.venue_coverage (
  tile_x integer not null,
  tile_y integer not null,
  warmed_at timestamp with time zone default now() not null,
  venue_count integer default 0 not null,
  import_version integer default 0 not null
);

create table if not exists public.venue_photo_reports (
  photo_id uuid not null,
  user_id uuid not null,
  reason text default 'other'::text not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.venue_photos (
  id uuid default gen_random_uuid() not null,
  venue_id text not null,
  user_id uuid not null,
  storage_path text not null,
  caption text,
  status text default 'visible'::text not null,
  report_count integer default 0 not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.venue_reviews (
  id uuid default gen_random_uuid() not null,
  venue_id text not null,
  user_id uuid not null,
  rating smallint not null,
  body text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- ======================================================================
-- Constraints
-- ======================================================================

alter table public.app_flags add constraint app_flags_pkey PRIMARY KEY (key);

alter table public.athlete_endorsements add constraint athlete_endorsements_pkey PRIMARY KEY (id);

alter table public.badges add constraint badges_pkey PRIMARY KEY (id);

alter table public.chat_reads add constraint chat_reads_pkey PRIMARY KEY (thread_kind, thread_id, user_id);

alter table public.dm_messages add constraint dm_messages_pkey PRIMARY KEY (id);

alter table public.dm_thread_members add constraint dm_thread_members_pkey PRIMARY KEY (thread_id, user_id);

alter table public.dm_threads add constraint dm_threads_pkey PRIMARY KEY (id);

alter table public.feed_media_post_comments add constraint feed_media_post_comments_pkey PRIMARY KEY (id);

alter table public.feed_media_post_likes add constraint feed_media_post_likes_pkey PRIMARY KEY (post_id, user_id);

alter table public.feed_media_posts add constraint feed_media_posts_pkey PRIMARY KEY (id);

alter table public.game_chat_invites add constraint game_chat_invites_pkey PRIMARY KEY (id);

alter table public.game_comment_likes add constraint game_comment_likes_pkey PRIMARY KEY (comment_id, user_id);

alter table public.game_comments add constraint game_comments_pkey PRIMARY KEY (id);

alter table public.game_likes add constraint game_likes_pkey PRIMARY KEY (game_id, user_id);

alter table public.game_messages add constraint game_messages_pkey PRIMARY KEY (id);

alter table public.game_outcome_reports add constraint game_outcome_reports_pkey PRIMARY KEY (game_id, user_id);

alter table public.game_participants add constraint game_participants_pkey PRIMARY KEY (id);

alter table public.game_poll_votes add constraint game_poll_votes_pkey PRIMARY KEY (poll_id, user_id);

alter table public.game_polls add constraint game_polls_pkey PRIMARY KEY (id);

alter table public.game_results add constraint game_results_pkey PRIMARY KEY (id);

alter table public.games add constraint games_pkey PRIMARY KEY (id);

alter table public.legal_acceptances add constraint legal_acceptances_pkey PRIMARY KEY (id);

alter table public.legal_documents add constraint legal_documents_pkey PRIMARY KEY (document);

alter table public.map_note_comment_likes add constraint map_note_comment_likes_pkey PRIMARY KEY (comment_id, user_id);

alter table public.map_note_comments add constraint map_note_comments_pkey PRIMARY KEY (id);

alter table public.map_note_likes add constraint map_note_likes_pkey PRIMARY KEY (note_id, user_id);

alter table public.map_notes add constraint map_notes_pkey PRIMARY KEY (id);

alter table public.min_age_by_country add constraint min_age_by_country_pkey PRIMARY KEY (country);

alter table public.notifications add constraint notifications_pkey PRIMARY KEY (id);

alter table public.osm_sports_venues add constraint osm_sports_venues_pkey PRIMARY KEY (id);

alter table public.profile_locations add constraint profile_locations_pkey PRIMARY KEY (profile_id);

alter table public.profile_private add constraint profile_private_pkey PRIMARY KEY (user_id);

alter table public.profiles add constraint profiles_pkey PRIMARY KEY (id);

alter table public.push_notifications_sent add constraint push_notifications_sent_pkey PRIMARY KEY (user_id, game_id);

alter table public.saved_venues add constraint saved_venues_pkey PRIMARY KEY (user_id, venue_id);

alter table public.spatial_ref_sys add constraint spatial_ref_sys_pkey PRIMARY KEY (srid);

alter table public.status_comments add constraint status_comments_pkey PRIMARY KEY (id);

alter table public.status_likes add constraint status_likes_pkey PRIMARY KEY (status_id, user_id);

alter table public.status_updates add constraint status_updates_pkey PRIMARY KEY (user_id);

alter table public.user_badges add constraint user_badges_pkey PRIMARY KEY (id);

alter table public.user_follows add constraint user_follows_pkey PRIMARY KEY (follower_id, followed_id);

alter table public.user_push_tokens add constraint user_push_tokens_pkey PRIMARY KEY (token);

alter table public.user_stats add constraint user_stats_pkey PRIMARY KEY (user_id);

alter table public.user_statuses add constraint user_statuses_pkey PRIMARY KEY (id);

alter table public.venue_comment_likes add constraint venue_comment_likes_pkey PRIMARY KEY (comment_id, user_id);

alter table public.venue_comments add constraint venue_comments_pkey PRIMARY KEY (id);

alter table public.venue_coverage add constraint venue_coverage_pkey PRIMARY KEY (tile_x, tile_y);

alter table public.venue_photo_reports add constraint venue_photo_reports_pkey PRIMARY KEY (photo_id, user_id);

alter table public.venue_photos add constraint venue_photos_pkey PRIMARY KEY (id);

alter table public.venue_reviews add constraint venue_reviews_pkey PRIMARY KEY (id);

alter table public.athlete_endorsements add constraint athlete_endorsements_game_id_athlete_id_endorser_id_key UNIQUE (game_id, athlete_id, endorser_id);

alter table public.badges add constraint badges_slug_key UNIQUE (slug);

alter table public.game_chat_invites add constraint game_chat_invites_game_id_invitee_user_id_key UNIQUE (game_id, invitee_user_id);

alter table public.game_participants add constraint game_participants_game_id_user_id_key UNIQUE (game_id, user_id);

alter table public.game_results add constraint game_results_game_id_key UNIQUE (game_id);

alter table public.legal_acceptances add constraint legal_acceptances_user_id_document_version_key UNIQUE (user_id, document, version);

alter table public.user_badges add constraint user_badges_user_id_badge_id_key UNIQUE (user_id, badge_id);

alter table public.venue_photos add constraint venue_photos_storage_path_key UNIQUE (storage_path);

alter table public.venue_reviews add constraint venue_reviews_one_per_user UNIQUE (venue_id, user_id);

alter table public.athlete_endorsements add constraint athlete_endorsements_not_self CHECK ((athlete_id <> endorser_id));

alter table public.athlete_endorsements add constraint athlete_endorsements_rating_check CHECK (((rating >= 1) AND (rating <= 5)));

alter table public.chat_reads add constraint chat_reads_thread_kind_check CHECK ((thread_kind = ANY (ARRAY['game'::text, 'dm'::text, 'note'::text])));

alter table public.dm_messages add constraint dm_messages_body_len CHECK (((char_length(TRIM(BOTH FROM body)) > 0) AND (char_length(body) <= 2000)));

alter table public.feed_media_posts add constraint feed_media_posts_visibility_check CHECK ((visibility = ANY (ARRAY['public'::text, 'squad'::text, 'private'::text])));

alter table public.game_chat_invites add constraint game_chat_invites_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'denied'::text, 'revoked'::text])));

alter table public.game_messages add constraint game_messages_body_len CHECK (((char_length(TRIM(BOTH FROM body)) > 0) AND (char_length(body) <= 2000)));

alter table public.game_outcome_reports add constraint game_outcome_reports_outcome_check CHECK ((outcome = ANY (ARRAY['played'::text, 'no_show'::text, 'missed_it'::text])));

alter table public.game_participants add constraint game_participants_role_check CHECK ((role = ANY (ARRAY['host'::text, 'player'::text, 'substitute'::text])));

alter table public.game_poll_votes add constraint game_poll_votes_choice_check CHECK ((choice = ANY (ARRAY['in'::text, 'out'::text])));

alter table public.game_polls add constraint game_polls_kind_check CHECK ((kind = 'rematch'::text));

alter table public.games add constraint games_duration_minutes_range CHECK (((duration_minutes >= 15) AND (duration_minutes <= 480)));

alter table public.games add constraint games_status_check CHECK ((status = ANY (ARRAY['open'::text, 'full'::text, 'live'::text, 'completed'::text, 'cancelled'::text])));

alter table public.games add constraint games_visibility_valid CHECK ((visibility = ANY (ARRAY['public'::text, 'friends_only'::text, 'invite_only'::text])));

alter table public.legal_documents add constraint legal_documents_document_check CHECK ((document = ANY (ARRAY['terms'::text, 'privacy'::text, 'guidelines'::text])));

alter table public.map_notes add constraint map_notes_visibility_valid CHECK ((visibility = ANY (ARRAY['public'::text, 'friends'::text, 'private'::text])));

alter table public.min_age_by_country add constraint min_age_by_country_country_check CHECK ((country ~ '^[A-Z]{2}$'::text));

alter table public.min_age_by_country add constraint min_age_by_country_min_age_check CHECK (((min_age >= 13) AND (min_age <= 18)));

alter table public.profile_locations add constraint profile_locations_visibility_valid CHECK ((location_visibility = ANY (ARRAY['ghost'::text, 'close_friends'::text, 'public'::text])));

alter table public.profile_private add constraint profile_private_country_check CHECK ((country ~ '^[A-Z]{2}$'::text));

alter table public.profiles add constraint profiles_gender_check CHECK (((gender IS NULL) OR (gender = ANY (ARRAY['man'::text, 'woman'::text, 'nonbinary'::text]))));

alter table public.spatial_ref_sys add constraint spatial_ref_sys_srid_check CHECK (((srid > 0) AND (srid <= 998999)));

alter table public.status_updates add constraint status_updates_body_len CHECK (((char_length(TRIM(BOTH FROM body)) > 0) AND (char_length(body) <= 280)));

alter table public.user_follows add constraint user_follows_check CHECK ((follower_id <> followed_id));

alter table public.user_follows add constraint user_follows_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text])));

alter table public.user_push_tokens add constraint user_push_tokens_platform_check CHECK ((platform = ANY (ARRAY['ios'::text, 'android'::text, 'web'::text])));

alter table public.venue_comments add constraint venue_comments_body_len CHECK ((length(body) <= 2000));

alter table public.venue_photo_reports add constraint venue_photo_reports_reason_valid CHECK ((reason = ANY (ARRAY['not_this_place'::text, 'offensive'::text, 'spam'::text, 'private'::text, 'other'::text])));

alter table public.venue_photos add constraint venue_photos_caption_len CHECK (((caption IS NULL) OR (length(caption) <= 200)));

alter table public.venue_photos add constraint venue_photos_status_valid CHECK ((status = ANY (ARRAY['visible'::text, 'hidden'::text, 'removed'::text])));

alter table public.venue_reviews add constraint venue_reviews_body_len CHECK (((body IS NULL) OR (length(body) <= 2000)));

alter table public.venue_reviews add constraint venue_reviews_rating_range CHECK (((rating >= 1) AND (rating <= 5)));

alter table public.athlete_endorsements add constraint athlete_endorsements_athlete_id_fkey FOREIGN KEY (athlete_id) REFERENCES profiles(id) ON DELETE CASCADE;

alter table public.athlete_endorsements add constraint athlete_endorsements_endorser_id_fkey FOREIGN KEY (endorser_id) REFERENCES profiles(id) ON DELETE CASCADE;

alter table public.athlete_endorsements add constraint athlete_endorsements_game_id_fkey FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE;

alter table public.chat_reads add constraint chat_reads_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.dm_messages add constraint dm_messages_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES dm_threads(id) ON DELETE CASCADE;

alter table public.dm_messages add constraint dm_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.dm_thread_members add constraint dm_thread_members_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES dm_threads(id) ON DELETE CASCADE;

alter table public.dm_thread_members add constraint dm_thread_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.feed_media_post_comments add constraint feed_media_post_comments_post_id_fkey FOREIGN KEY (post_id) REFERENCES feed_media_posts(id) ON DELETE CASCADE;

alter table public.feed_media_post_comments add constraint feed_media_post_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.feed_media_post_likes add constraint feed_media_post_likes_post_id_fkey FOREIGN KEY (post_id) REFERENCES feed_media_posts(id) ON DELETE CASCADE;

alter table public.feed_media_post_likes add constraint feed_media_post_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.feed_media_posts add constraint feed_media_posts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.game_chat_invites add constraint game_chat_invites_game_id_fkey FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE;

alter table public.game_chat_invites add constraint game_chat_invites_invited_by_user_id_fkey FOREIGN KEY (invited_by_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.game_chat_invites add constraint game_chat_invites_invitee_user_id_fkey FOREIGN KEY (invitee_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.game_comment_likes add constraint game_comment_likes_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES game_comments(id) ON DELETE CASCADE;

alter table public.game_comment_likes add constraint game_comment_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.game_comments add constraint game_comments_game_id_fkey FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE;

alter table public.game_comments add constraint game_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.game_likes add constraint game_likes_game_id_fkey FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE;

alter table public.game_likes add constraint game_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.game_messages add constraint game_messages_game_id_fkey FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE;

alter table public.game_messages add constraint game_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.game_outcome_reports add constraint game_outcome_reports_game_id_fkey FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE;

alter table public.game_outcome_reports add constraint game_outcome_reports_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.game_participants add constraint game_participants_game_id_fkey FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE;

alter table public.game_participants add constraint game_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.game_poll_votes add constraint game_poll_votes_poll_id_fkey FOREIGN KEY (poll_id) REFERENCES game_polls(id) ON DELETE CASCADE;

alter table public.game_poll_votes add constraint game_poll_votes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.game_polls add constraint game_polls_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.game_polls add constraint game_polls_game_id_fkey FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE;

alter table public.game_results add constraint game_results_game_id_fkey FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE;

alter table public.games add constraint games_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.legal_acceptances add constraint legal_acceptances_document_fkey FOREIGN KEY (document) REFERENCES legal_documents(document);

alter table public.legal_acceptances add constraint legal_acceptances_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.map_note_comment_likes add constraint map_note_comment_likes_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES map_note_comments(id) ON DELETE CASCADE;

alter table public.map_note_comment_likes add constraint map_note_comment_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.map_note_comments add constraint map_note_comments_note_id_fkey FOREIGN KEY (note_id) REFERENCES map_notes(id) ON DELETE CASCADE;

alter table public.map_note_comments add constraint map_note_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.map_note_likes add constraint map_note_likes_note_id_fkey FOREIGN KEY (note_id) REFERENCES map_notes(id) ON DELETE CASCADE;

alter table public.map_note_likes add constraint map_note_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.map_notes add constraint map_notes_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.notifications add constraint notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

alter table public.profile_locations add constraint profile_locations_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

alter table public.profile_private add constraint profile_private_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.profiles add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.push_notifications_sent add constraint push_notifications_sent_game_id_fkey FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE;

alter table public.push_notifications_sent add constraint push_notifications_sent_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.saved_venues add constraint saved_venues_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.status_comments add constraint status_comments_status_id_fkey FOREIGN KEY (status_id) REFERENCES user_statuses(id) ON DELETE CASCADE;

alter table public.status_comments add constraint status_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.status_likes add constraint status_likes_status_id_fkey FOREIGN KEY (status_id) REFERENCES user_statuses(id) ON DELETE CASCADE;

alter table public.status_likes add constraint status_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.status_updates add constraint status_updates_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

alter table public.user_badges add constraint user_badges_badge_id_fkey FOREIGN KEY (badge_id) REFERENCES badges(id) ON DELETE CASCADE;

alter table public.user_badges add constraint user_badges_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

alter table public.user_follows add constraint user_follows_followed_id_fkey FOREIGN KEY (followed_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.user_follows add constraint user_follows_follower_id_fkey FOREIGN KEY (follower_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.user_push_tokens add constraint user_push_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.user_stats add constraint user_stats_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

alter table public.user_statuses add constraint user_statuses_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.venue_comment_likes add constraint venue_comment_likes_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES venue_comments(id) ON DELETE CASCADE;

alter table public.venue_comment_likes add constraint venue_comment_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.venue_comments add constraint venue_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.venue_comments add constraint venue_comments_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES osm_sports_venues(id) ON DELETE CASCADE;

alter table public.venue_photo_reports add constraint venue_photo_reports_photo_id_fkey FOREIGN KEY (photo_id) REFERENCES venue_photos(id) ON DELETE CASCADE;

alter table public.venue_photo_reports add constraint venue_photo_reports_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.venue_photos add constraint venue_photos_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.venue_photos add constraint venue_photos_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES osm_sports_venues(id) ON DELETE CASCADE;

alter table public.venue_reviews add constraint venue_reviews_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.venue_reviews add constraint venue_reviews_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES osm_sports_venues(id) ON DELETE CASCADE;

-- ======================================================================
-- Indexes
-- ======================================================================

CREATE INDEX IF NOT EXISTS athlete_endorsements_athlete_idx ON public.athlete_endorsements USING btree (athlete_id, created_at DESC);

CREATE INDEX IF NOT EXISTS athlete_endorsements_endorser_idx ON public.athlete_endorsements USING btree (endorser_id, created_at DESC);

CREATE INDEX IF NOT EXISTS athlete_endorsements_game_idx ON public.athlete_endorsements USING btree (game_id);

CREATE INDEX IF NOT EXISTS chat_reads_thread_idx ON public.chat_reads USING btree (thread_kind, thread_id);

CREATE UNIQUE INDEX dm_messages_client_id_uniq ON public.dm_messages USING btree (user_id, client_id) WHERE (client_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS dm_messages_thread_created_idx ON public.dm_messages USING btree (thread_id, created_at DESC);

CREATE INDEX IF NOT EXISTS dm_messages_user_id_idx ON public.dm_messages USING btree (user_id);

CREATE INDEX IF NOT EXISTS dm_thread_members_user_idx ON public.dm_thread_members USING btree (user_id, thread_id);

CREATE INDEX IF NOT EXISTS feed_media_post_comments_post_created_idx ON public.feed_media_post_comments USING btree (post_id, created_at);

CREATE INDEX IF NOT EXISTS feed_media_post_comments_user_id_idx ON public.feed_media_post_comments USING btree (user_id);

CREATE INDEX IF NOT EXISTS feed_media_post_likes_post_idx ON public.feed_media_post_likes USING btree (post_id);

CREATE INDEX IF NOT EXISTS feed_media_post_likes_user_id_idx ON public.feed_media_post_likes USING btree (user_id);

CREATE INDEX IF NOT EXISTS feed_media_posts_created_idx ON public.feed_media_posts USING btree (created_at DESC);

CREATE INDEX IF NOT EXISTS feed_media_posts_user_id_idx ON public.feed_media_posts USING btree (user_id);

CREATE INDEX IF NOT EXISTS game_chat_invites_game_idx ON public.game_chat_invites USING btree (game_id);

CREATE INDEX IF NOT EXISTS game_chat_invites_invited_by_user_id_idx ON public.game_chat_invites USING btree (invited_by_user_id);

CREATE INDEX IF NOT EXISTS game_chat_invites_invitee_idx ON public.game_chat_invites USING btree (invitee_user_id, status);

CREATE INDEX IF NOT EXISTS game_comment_likes_user_idx ON public.game_comment_likes USING btree (user_id);

CREATE INDEX IF NOT EXISTS game_comments_game_idx ON public.game_comments USING btree (game_id, created_at);

CREATE INDEX IF NOT EXISTS game_comments_user_idx ON public.game_comments USING btree (user_id);

CREATE INDEX IF NOT EXISTS game_likes_user_idx ON public.game_likes USING btree (user_id);

CREATE UNIQUE INDEX game_messages_client_id_uniq ON public.game_messages USING btree (user_id, client_id) WHERE (client_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS game_messages_game_created_idx ON public.game_messages USING btree (game_id, created_at DESC);

CREATE INDEX IF NOT EXISTS game_messages_user_id_idx ON public.game_messages USING btree (user_id);

CREATE INDEX IF NOT EXISTS game_outcome_reports_game_idx ON public.game_outcome_reports USING btree (game_id);

CREATE INDEX IF NOT EXISTS game_participants_user_id_idx ON public.game_participants USING btree (user_id);

CREATE UNIQUE INDEX game_polls_one_open_per_game ON public.game_polls USING btree (game_id, kind) WHERE (closed_at IS NULL);

CREATE INDEX IF NOT EXISTS games_active_location_idx ON public.games USING gist (location) WHERE (status = ANY (ARRAY['open'::text, 'full'::text, 'live'::text]));

CREATE INDEX IF NOT EXISTS games_created_by_idx ON public.games USING btree (created_by);

CREATE INDEX IF NOT EXISTS games_ends_at_idx ON public.games USING btree (ends_at);

CREATE UNIQUE INDEX games_invite_token_idx ON public.games USING btree (invite_token);

CREATE INDEX IF NOT EXISTS games_location_idx ON public.games USING gist (location);

CREATE INDEX IF NOT EXISTS games_visibility_idx ON public.games USING btree (visibility);

CREATE INDEX IF NOT EXISTS map_note_comment_likes_comment_idx ON public.map_note_comment_likes USING btree (comment_id);

CREATE INDEX IF NOT EXISTS map_note_comment_likes_user_id_idx ON public.map_note_comment_likes USING btree (user_id);

CREATE UNIQUE INDEX map_note_comments_client_id_uniq ON public.map_note_comments USING btree (user_id, client_id) WHERE (client_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS map_note_comments_note_created_idx ON public.map_note_comments USING btree (note_id, created_at);

CREATE INDEX IF NOT EXISTS map_note_comments_user_idx ON public.map_note_comments USING btree (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS map_note_likes_note_idx ON public.map_note_likes USING btree (note_id);

CREATE INDEX IF NOT EXISTS map_note_likes_user_id_idx ON public.map_note_likes USING btree (user_id);

CREATE INDEX IF NOT EXISTS map_notes_created_at_idx ON public.map_notes USING btree (created_at DESC);

CREATE INDEX IF NOT EXISTS map_notes_created_by_idx ON public.map_notes USING btree (created_by);

CREATE INDEX IF NOT EXISTS map_notes_lat_lng_idx ON public.map_notes USING btree (lat, lng);

CREATE INDEX IF NOT EXISTS map_notes_visibility_idx ON public.map_notes USING btree (visibility);

CREATE INDEX IF NOT EXISTS notifications_user_created_idx ON public.notifications USING btree (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON public.notifications USING btree (user_id);

CREATE INDEX IF NOT EXISTS notifications_user_id_unread_idx ON public.notifications USING btree (user_id) WHERE (NOT is_read);

CREATE INDEX IF NOT EXISTS osm_sports_venues_lat_lng_idx ON public.osm_sports_venues USING btree (lat, lng);

CREATE INDEX IF NOT EXISTS profile_locations_location_geography_idx ON public.profile_locations USING gist (location_geography);

CREATE INDEX IF NOT EXISTS profile_locations_updated_at_idx ON public.profile_locations USING btree (updated_at);

CREATE INDEX IF NOT EXISTS profile_locations_visibility_updated_idx ON public.profile_locations USING btree (location_visibility, updated_at);

CREATE INDEX IF NOT EXISTS profiles_display_name_search_trgm_idx ON public.profiles USING gin (display_name_search gin_trgm_ops);

CREATE INDEX IF NOT EXISTS profiles_gender_idx ON public.profiles USING btree (gender);

CREATE INDEX IF NOT EXISTS profiles_handle_search_trgm_idx ON public.profiles USING gin (handle_search gin_trgm_ops) WHERE (length(handle_search) > 0);

CREATE INDEX IF NOT EXISTS push_notifications_sent_sent_at_idx ON public.push_notifications_sent USING btree (sent_at);

CREATE INDEX IF NOT EXISTS saved_venues_venue_idx ON public.saved_venues USING btree (venue_id);

CREATE INDEX IF NOT EXISTS status_comments_status_created_idx ON public.status_comments USING btree (status_id, created_at);

CREATE INDEX IF NOT EXISTS status_comments_user_id_idx ON public.status_comments USING btree (user_id);

CREATE INDEX IF NOT EXISTS status_likes_status_idx ON public.status_likes USING btree (status_id);

CREATE INDEX IF NOT EXISTS status_likes_user_id_idx ON public.status_likes USING btree (user_id);

CREATE INDEX IF NOT EXISTS status_updates_user_created_idx ON public.status_updates USING btree (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS user_badges_badge_id_idx ON public.user_badges USING btree (badge_id);

CREATE INDEX IF NOT EXISTS user_badges_user_id_idx ON public.user_badges USING btree (user_id);

CREATE INDEX IF NOT EXISTS user_follows_followed_idx ON public.user_follows USING btree (followed_id);

CREATE INDEX IF NOT EXISTS user_follows_followed_status_idx ON public.user_follows USING btree (followed_id, status);

CREATE INDEX IF NOT EXISTS user_push_tokens_user_id_idx ON public.user_push_tokens USING btree (user_id);

CREATE INDEX IF NOT EXISTS user_statuses_created_at_idx ON public.user_statuses USING btree (created_at DESC);

CREATE INDEX IF NOT EXISTS user_statuses_user_idx ON public.user_statuses USING btree (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS venue_comment_likes_user_id_idx ON public.venue_comment_likes USING btree (user_id);

CREATE INDEX IF NOT EXISTS venue_comments_user_id_idx ON public.venue_comments USING btree (user_id);

CREATE INDEX IF NOT EXISTS venue_comments_venue_created_idx ON public.venue_comments USING btree (venue_id, created_at DESC);

CREATE INDEX IF NOT EXISTS venue_coverage_tile_idx ON public.venue_coverage USING btree (tile_x, tile_y, warmed_at);

CREATE INDEX IF NOT EXISTS venue_photo_reports_user_id_idx ON public.venue_photo_reports USING btree (user_id);

CREATE INDEX IF NOT EXISTS venue_photos_user_id_idx ON public.venue_photos USING btree (user_id);

CREATE INDEX IF NOT EXISTS venue_photos_venue_created_idx ON public.venue_photos USING btree (venue_id, created_at DESC) WHERE (status = 'visible'::text);

CREATE INDEX IF NOT EXISTS venue_reviews_user_id_idx ON public.venue_reviews USING btree (user_id);

CREATE INDEX IF NOT EXISTS venue_reviews_venue_created_idx ON public.venue_reviews USING btree (venue_id, created_at DESC);

-- ======================================================================
-- Functions
-- ======================================================================

CREATE OR REPLACE FUNCTION public._athlete_sports_array(profile_json jsonb)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select coalesce(
    array(
      select distinct x
      from jsonb_array_elements_text(
        coalesce(nullif(profile_json->'primarySports', 'null'::jsonb), '[]'::jsonb)
        || coalesce(nullif(profile_json->'secondarySports', 'null'::jsonb), '[]'::jsonb)
      ) x
    ),
    array[]::text[]
  )
$function$;

CREATE OR REPLACE FUNCTION public._fun_apply_account_setup(p_uid uuid, p_birthdate date, p_gender text, p_country text, p_accepted jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.add_game_comment(p_game_id uuid, p_body text)
 RETURNS game_comments
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_uid  uuid := (select auth.uid());
  v_row  public.game_comments;
  v_body text := trim(coalesce(p_body, ''));
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if v_body = '' then raise exception 'empty_body' using errcode = '22023'; end if;
  if length(v_body) > 2000 then v_body := left(v_body, 2000); end if;
  insert into public.game_comments (game_id, user_id, body)
  values (p_game_id, v_uid, v_body)
  returning * into v_row;
  return v_row;
end $function$;

CREATE OR REPLACE FUNCTION public.add_note_comment(p_note_id uuid, p_body text, p_client_id text DEFAULT NULL::text)
 RETURNS map_note_comments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_row public.map_note_comments;
  v_body text := coalesce(p_body, '');
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;

  -- One error for "no such note" and for "not yours to see", so the RPC cannot
  -- be used to probe which note ids exist.
  if not public.map_note_visible_to(p_note_id, v_uid) then
    raise exception 'note_not_found' using errcode = '42501';
  end if;

  v_body := trim(v_body);
  if v_body = '' then
    raise exception 'empty_body' using errcode = '22023';
  end if;
  if length(v_body) > 2000 then
    v_body := left(v_body, 2000);
  end if;

  insert into public.map_note_comments (note_id, user_id, body, client_id)
  values (p_note_id, v_uid, v_body, nullif(trim(coalesce(p_client_id, '')), ''))
  returning * into v_row;

  return v_row;
end $function$;

CREATE OR REPLACE FUNCTION public.add_post_comment(p_post_id uuid, p_body text)
 RETURNS feed_media_post_comments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_row public.feed_media_post_comments;
  v_body text := trim(coalesce(p_body, ''));
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if v_body = '' then raise exception 'empty_body' using errcode = '22023'; end if;
  if length(v_body) > 2000 then v_body := left(v_body, 2000); end if;
  insert into public.feed_media_post_comments (post_id, user_id, body)
  values (p_post_id, v_uid, v_body)
  returning * into v_row;
  return v_row;
end $function$;

CREATE OR REPLACE FUNCTION public.add_status_comment(p_status_id uuid, p_body text)
 RETURNS status_comments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_row public.status_comments;
  v_body text := trim(coalesce(p_body, ''));
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if v_body = '' then
    raise exception 'empty_body' using errcode = '22023';
  end if;
  if length(v_body) > 2000 then
    v_body := left(v_body, 2000);
  end if;

  insert into public.status_comments (status_id, user_id, body)
  values (p_status_id, v_uid, v_body)
  returning * into v_row;

  return v_row;
end $function$;

CREATE OR REPLACE FUNCTION public.add_venue_comment(p_venue_id text, p_body text, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_name text DEFAULT NULL::text, p_sport text DEFAULT NULL::text, p_leisure text DEFAULT NULL::text)
 RETURNS venue_comments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid  uuid := (select auth.uid());
  v_row  public.venue_comments;
  v_body text := trim(coalesce(p_body, ''));
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if v_body = '' then
    raise exception 'empty_body' using errcode = '22023';
  end if;
  if length(v_body) > 2000 then
    v_body := left(v_body, 2000);
  end if;

  perform public.ensure_venue_row(p_venue_id, p_lat, p_lng, p_name, p_sport, p_leisure);

  insert into public.venue_comments (venue_id, user_id, body)
  values (p_venue_id, v_uid, v_body)
  returning * into v_row;

  return v_row;
end $function$;

CREATE OR REPLACE FUNCTION public.add_venue_photo(p_venue_id text, p_storage_path text, p_caption text DEFAULT NULL::text, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_name text DEFAULT NULL::text, p_sport text DEFAULT NULL::text, p_leisure text DEFAULT NULL::text)
 RETURNS venue_photos
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid     uuid := (select auth.uid());
  v_row     public.venue_photos;
  v_path    text := trim(coalesce(p_storage_path, ''));
  v_caption text := trim(coalesce(p_caption, ''));
  v_here    int;
  v_today   int;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if v_path = '' then
    raise exception 'empty_path' using errcode = '22023';
  end if;
  -- The uid segment must be the caller's own: storage RLS enforces this too,
  -- but rejecting here keeps orphan rows from ever being created.
  if v_path !~ ('^venues/' || v_uid::text || '/') then
    raise exception 'invalid_path' using errcode = '42501';
  end if;
  if length(v_caption) > 200 then
    v_caption := left(v_caption, 200);
  end if;

  select count(*) into v_here
    from public.venue_photos
   where venue_id = p_venue_id and user_id = v_uid and status <> 'removed';
  if v_here >= 5 then
    raise exception 'photo_limit_venue' using errcode = '22023';
  end if;

  select count(*) into v_today
    from public.venue_photos
   where user_id = v_uid and created_at > now() - interval '1 day';
  if v_today >= 20 then
    raise exception 'photo_limit_daily' using errcode = '22023';
  end if;

  perform public.ensure_venue_row(p_venue_id, p_lat, p_lng, p_name, p_sport, p_leisure);

  insert into public.venue_photos (venue_id, user_id, storage_path, caption)
  values (p_venue_id, v_uid, v_path, nullif(v_caption, ''))
  returning * into v_row;

  return v_row;
end $function$;

CREATE OR REPLACE FUNCTION public.archive_game_chat(p_game_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user  uuid;
  v_ended boolean;
  v_rows  int;
begin
  v_user := auth.uid();
  if v_user is null then
    return jsonb_build_object('success', false, 'error', 'Not authenticated');
  end if;

  -- Same definition of "over" the map uses: an explicit end state, a scheduled
  -- window that has closed, or an untimed game past the 3-day map TTL.
  select g.status in ('completed', 'cancelled')
         or (g.ends_at is not null and g.ends_at <= now())
         or (g.ends_at is null and g.starts_at is null and g.created_at <= now() - interval '3 days')
    into v_ended
    from public.games g
   where g.id = p_game_id;

  if v_ended is null then
    return jsonb_build_object('success', false, 'error', 'Game not found');
  end if;

  if not v_ended then
    return jsonb_build_object('success', false, 'error', 'You can archive this chat once the game has ended');
  end if;

  update public.game_participants
     set chat_hidden_at = now()
   where game_id = p_game_id
     and user_id = v_user;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return jsonb_build_object('success', false, 'error', 'Not in this game');
  end if;

  return jsonb_build_object('success', true, 'message', 'Chat archived');

exception when others then
  return jsonb_build_object('success', false, 'error', SQLERRM);
end;
$function$;

CREATE OR REPLACE FUNCTION public.can_dm(p_other_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_is_follow boolean;
  v_shared_game boolean;
begin
  if v_uid is null or p_other_user_id is null or v_uid = p_other_user_id then
    return v_uid is not null and v_uid = p_other_user_id;
  end if;

  -- Mutual-or-one-way follow.
  select exists(
    select 1 from public.user_follows
     where (follower_id = v_uid and followed_id = p_other_user_id)
        or (follower_id = p_other_user_id and followed_id = v_uid)
  ) into v_is_follow;

  if v_is_follow then
    return true;
  end if;

  -- At least one shared game (any status).
  select exists(
    select 1
      from public.game_participants p1
      join public.game_participants p2 on p1.game_id = p2.game_id
     where p1.user_id = v_uid
       and p2.user_id = p_other_user_id
  ) into v_shared_game;

  return coalesce(v_shared_game, false);
end $function$;

CREATE OR REPLACE FUNCTION public.can_view_game_for_gender(p_viewer_gender text, p_host_gender text, p_match_type text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select
    coalesce(nullif(trim(p_match_type), ''), 'Co-ed') <> 'Same gender'
    or (p_viewer_gender is not null and p_host_gender = p_viewer_gender);
$function$;

CREATE OR REPLACE FUNCTION public.chat_reads_touch_sender()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_kind   text;
  v_thread uuid;
begin
  if tg_table_name = 'game_messages' then
    v_kind := 'game'; v_thread := new.game_id;
  elsif tg_table_name = 'dm_messages' then
    v_kind := 'dm'; v_thread := new.thread_id;
  elsif tg_table_name = 'map_note_comments' then
    v_kind := 'note'; v_thread := new.note_id;
  else
    return new;
  end if;

  if new.user_id is null then return new; end if;

  insert into public.chat_reads (thread_kind, thread_id, user_id, last_read_at)
  values (v_kind, v_thread, new.user_id, new.created_at)
  on conflict (thread_kind, thread_id, user_id) do update
    set last_read_at = excluded.last_read_at
    where chat_reads.last_read_at < excluded.last_read_at;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.check_nearby_similar_games(p_sport text, p_lat double precision, p_lng double precision, p_starts_at timestamp with time zone, p_radius_km double precision DEFAULT 5.0)
 RETURNS TABLE(id uuid, title text, sport text, starts_at timestamp with time zone, status text, distance_km double precision)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    id, title, sport, starts_at, status,
    (st_distance(location, st_point(p_lng, p_lat)::geography) / 1000.0) as distance_km
  from public.games
  where sport = p_sport
    and status = 'open'
    and starts_at is not null
    and starts_at >= (p_starts_at - interval '2 hours')
    and starts_at <= (p_starts_at + interval '2 hours')
    and st_dwithin(location, st_point(p_lng, p_lat)::geography, p_radius_km * 1000.0)
  order by distance_km asc
  limit 5;
$function$;

CREATE OR REPLACE FUNCTION public.close_rematch_poll(p_poll_id uuid)
 RETURNS void
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
  update public.game_polls set closed_at = now()
   where id = p_poll_id and closed_at is null;
$function$;

CREATE OR REPLACE FUNCTION public.complete_account_setup(p_birthdate date DEFAULT NULL::date, p_gender text DEFAULT NULL::text, p_country text DEFAULT NULL::text, p_accepted jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'FUN_NOT_SIGNED_IN' using errcode = '42501';
  end if;
  perform public._fun_apply_account_setup(v_uid, p_birthdate, p_gender, p_country, p_accepted);
end;
$function$;

CREATE OR REPLACE FUNCTION public.complete_game(p_game_id uuid, p_winner_team_or_user text DEFAULT NULL::text, p_score jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_host_id uuid;
  v_sport text;
  v_participant record;
  v_games_total int;
  v_games_by_sport jsonb;
  v_cur_streak int;
  v_long_streak int;
  v_xp int;
  v_level int;
  v_last_date date;
  v_new_streak int;
  v_new_xp int;
  v_new_level int;
  v_new_games_by_sport jsonb;
  v_badge record;
begin
  select g.created_by, g.sport into v_host_id, v_sport
  from public.games g
  where g.id = p_game_id and g.status in ('open', 'full');
  if v_host_id is null then
    raise exception 'Game not found or already completed';
  end if;
  if auth.uid() is null or auth.uid() != v_host_id then
    raise exception 'Only the host can complete this game';
  end if;

  insert into public.game_results (game_id, winner_team_or_user, score, confirmed_by_host)
  values (p_game_id, p_winner_team_or_user, p_score, true)
  on conflict (game_id) do update set
    winner_team_or_user = excluded.winner_team_or_user,
    score = excluded.score,
    confirmed_by_host = true;
  update public.games set status = 'completed', updated_at = now() where id = p_game_id;

  for v_participant in
    select gp.user_id from public.game_participants gp where gp.game_id = p_game_id
  loop
    select
      coalesce(us.games_played_total, 0),
      coalesce(us.games_played_by_sport, '{}'::jsonb),
      coalesce(us.current_streak_days, 0),
      coalesce(us.longest_streak_days, 0),
      coalesce(us.xp, 0),
      coalesce(us.level, 1),
      us.last_game_date
    into v_games_total, v_games_by_sport, v_cur_streak, v_long_streak, v_xp, v_level, v_last_date
    from public.user_stats us
    where us.user_id = v_participant.user_id;

    if v_games_total is null then
      v_games_total := 0;
      v_games_by_sport := '{}'::jsonb;
      v_cur_streak := 0;
      v_long_streak := 0;
      v_xp := 0;
      v_level := 1;
      v_last_date := null;
    end if;

    if v_last_date is null then
      v_new_streak := 1;
    elsif v_last_date = current_date then
      v_new_streak := v_cur_streak;
    elsif v_last_date = current_date - 1 then
      v_new_streak := v_cur_streak + 1;
    else
      v_new_streak := 1;
    end if;

    v_new_xp := v_xp + 10;
    v_new_level := 1 + (v_new_xp / 100);
    v_new_games_by_sport := jsonb_set(
      coalesce(v_games_by_sport, '{}'::jsonb),
      array[v_sport],
      to_jsonb(coalesce((v_games_by_sport->>v_sport)::int, 0) + 1),
      true
    );

    insert into public.user_stats (
      user_id, games_played_total, games_played_by_sport,
      current_streak_days, longest_streak_days, xp, level, last_game_date, updated_at
    )
    values (
      v_participant.user_id,
      v_games_total + 1,
      v_new_games_by_sport,
      v_new_streak,
      greatest(v_long_streak, v_new_streak),
      v_new_xp,
      v_new_level,
      current_date,
      now()
    )
    on conflict (user_id) do update set
      games_played_total = public.user_stats.games_played_total + 1,
      games_played_by_sport = excluded.games_played_by_sport,
      current_streak_days = excluded.current_streak_days,
      longest_streak_days = excluded.longest_streak_days,
      xp = excluded.xp,
      level = excluded.level,
      last_game_date = excluded.last_game_date,
      updated_at = now();

    for v_badge in
      select b.id, b.slug from public.badges b
      where not exists (
        select 1 from public.user_badges ub
        where ub.user_id = v_participant.user_id and ub.badge_id = b.id
      )
    loop
      if v_badge.slug = 'first_game' and (v_games_total + 1) >= 1 then
        insert into public.user_badges (user_id, badge_id) values (v_participant.user_id, v_badge.id);
        insert into public.notifications (user_id, type, payload)
        values (v_participant.user_id, 'badge_earned', jsonb_build_object('badge_slug', v_badge.slug));
      elsif v_badge.slug = 'ten_games' and (v_games_total + 1) >= 10 then
        insert into public.user_badges (user_id, badge_id) values (v_participant.user_id, v_badge.id);
        insert into public.notifications (user_id, type, payload)
        values (v_participant.user_id, 'badge_earned', jsonb_build_object('badge_slug', v_badge.slug));
      elsif v_badge.slug = 'streak_7' and v_new_streak >= 7 then
        insert into public.user_badges (user_id, badge_id) values (v_participant.user_id, v_badge.id);
        insert into public.notifications (user_id, type, payload)
        values (v_participant.user_id, 'badge_earned', jsonb_build_object('badge_slug', v_badge.slug));
      end if;
    end loop;

    insert into public.notifications (user_id, type, payload)
    values (v_participant.user_id, 'game_completed', jsonb_build_object('game_id', p_game_id, 'sport', v_sport));
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_game(p_title text, p_sport text, p_spots_needed integer, p_lat double precision, p_lng double precision, p_starts_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_location_label text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_requirements jsonb DEFAULT NULL::jsonb, p_duration_minutes integer DEFAULT 90, p_visibility text DEFAULT 'public'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
  v_uid uuid := auth.uid();
  v_dur int := coalesce(p_duration_minutes, 90);
  v_vis text := coalesce(p_visibility, 'public');
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;

  if v_dur < 15 or v_dur > 480 then
    raise exception 'duration_out_of_range'
      using errcode = '22023',
            hint = 'duration_minutes must be between 15 and 480';
  end if;

  if v_vis not in ('public','friends_only','invite_only') then
    raise exception 'invalid_visibility' using errcode = '22023';
  end if;

  insert into public.games (
    title, sport, spots_needed, location, starts_at,
    location_label, description, requirements,
    duration_minutes, visibility, created_by, status
  ) values (
    coalesce(nullif(trim(p_title), ''), 'Pickup game'),
    p_sport,
    greatest(coalesce(p_spots_needed, 2), 2),
    -- location is the existing geography(point) column on games.
    -- Some deployments use a separate `geography` column; if your DB stores
    -- lat/lng directly, swap this for explicit `lat`/`lng` inserts.
    case
      when p_lat is not null and p_lng is not null
        then ('SRID=4326;POINT(' || p_lng || ' ' || p_lat || ')')::geography
      else null
    end,
    p_starts_at,
    p_location_label,
    nullif(trim(coalesce(p_description, '')), ''),
    p_requirements,
    v_dur,
    v_vis,
    v_uid,
    'open'
  )
  returning id into v_id;

  -- Auto-add host as participant. (Bypasses the visibility trigger because
  -- the host is always eligible per is_eligible_to_join_game.)
  insert into public.game_participants (game_id, user_id, role)
  values (v_id, v_uid, 'host')
  on conflict (game_id, user_id) do nothing;

  return v_id;
exception
  -- Older schemas use `lat`, `lng` columns (no `location` geography). Retry.
  when undefined_column then
    insert into public.games (
      title, sport, spots_needed, lat, lng, starts_at,
      location_label, description, requirements,
      duration_minutes, visibility, created_by, status
    ) values (
      coalesce(nullif(trim(p_title), ''), 'Pickup game'),
      p_sport,
      greatest(coalesce(p_spots_needed, 2), 2),
      p_lat, p_lng,
      p_starts_at,
      p_location_label,
      nullif(trim(coalesce(p_description, '')), ''),
      p_requirements,
      v_dur,
      v_vis,
      v_uid,
      'open'
    )
    returning id into v_id;

    insert into public.game_participants (game_id, user_id, role)
    values (v_id, v_uid, 'host')
    on conflict (game_id, user_id) do nothing;

    return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.create_map_note(p_lat double precision, p_lng double precision, p_body text, p_visibility text, p_place_name text DEFAULT NULL::text)
 RETURNS map_notes
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_note public.map_notes;
  v_vis text := coalesce(nullif(trim(p_visibility), ''), 'public');
  v_body text := coalesce(p_body, '');
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  v_body := trim(v_body);
  if v_body = '' then
    raise exception 'empty_body' using errcode = '22023';
  end if;
  if length(v_body) > 2000 then
    v_body := left(v_body, 2000);
  end if;
  if v_vis not in ('public','friends','private') then
    raise exception 'invalid_visibility' using errcode = '22023';
  end if;

  insert into public.map_notes (created_by, lat, lng, body, visibility, place_name)
  values (v_uid, p_lat, p_lng, v_body, v_vis, nullif(trim(p_place_name), ''))
  returning * into v_note;

  return v_note;
end $function$;

CREATE OR REPLACE FUNCTION public.create_rematch_poll(p_game_id uuid, p_question text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_id  uuid;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;

  select pl.id into v_id
    from public.game_polls pl
   where pl.game_id = p_game_id and pl.kind = 'rematch' and pl.closed_at is null;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.game_polls (game_id, created_by, kind, question)
  values (p_game_id, v_uid, 'rematch', nullif(btrim(coalesce(p_question, '')), ''))
  returning id into v_id;

  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.delete_game_comment(p_comment_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_n int;
begin
  if (select auth.uid()) is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  delete from public.game_comments
   where id = p_comment_id and user_id = (select auth.uid());
  get diagnostics v_n = row_count;
  return v_n > 0;
end $function$;

CREATE OR REPLACE FUNCTION public.delete_my_status(p_status_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  delete from public.user_statuses
   where id = p_status_id and user_id = v_uid;
end $function$;

CREATE OR REPLACE FUNCTION public.delete_push_token(p_token text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    return;
  end if;
  delete from public.user_push_tokens
   where token = trim(p_token)
     and user_id = v_uid;
end;
$function$;

CREATE OR REPLACE FUNCTION public.delete_venue_comment(p_comment_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_n   int;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  delete from public.venue_comments
   where id = p_comment_id and user_id = v_uid;
  get diagnostics v_n = row_count;
  return v_n > 0;
end $function$;

CREATE OR REPLACE FUNCTION public.delete_venue_photo(p_photo_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid  uuid := (select auth.uid());
  v_path text;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;

  delete from public.venue_photos
   where id = p_photo_id and user_id = v_uid
  returning storage_path into v_path;

  return v_path;  -- null when nothing matched
end $function$;

CREATE OR REPLACE FUNCTION public.delete_venue_review(p_venue_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_n   int;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  delete from public.venue_reviews
   where venue_id = p_venue_id and user_id = v_uid;
  get diagnostics v_n = row_count;
  return v_n > 0;
end $function$;

CREATE OR REPLACE FUNCTION public.end_game(p_game_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_host uuid;
  v_status text;
  v_starts_at timestamptz;
begin
  select created_by, status, starts_at into v_host, v_status, v_starts_at
  from public.games
  where id = p_game_id;

  if v_host is null then
    raise exception 'Game not found';
  end if;
  if auth.uid() is null or auth.uid() <> v_host then
    raise exception 'Only the host can end the game';
  end if;
  if v_status in ('completed', 'cancelled') then
    return;
  end if;

  if v_status <> 'live' and (v_starts_at is null or v_starts_at > now()) then
    delete from public.games where id = p_game_id and created_by = auth.uid();
    return;
  end if;

  update public.games
    set status = 'completed',
        ended_at = now(),
        ends_at = now(),
        updated_at = now()
  where id = p_game_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.endorse_athlete(p_athlete uuid, p_game uuid, p_rating integer, p_tags text[] DEFAULT '{}'::text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated to endorse';
  end if;
  if p_athlete is null or p_game is null then
    raise exception 'Missing athlete or game';
  end if;
  if p_athlete = auth.uid() then
    raise exception 'Cannot endorse yourself';
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Rating must be between 1 and 5';
  end if;

  if not exists (
    select 1
    from public.games g
    join public.game_participants me on me.game_id = g.id and me.user_id = auth.uid()
    join public.game_participants them on them.game_id = g.id and them.user_id = p_athlete
    where g.id = p_game and g.status = 'completed'
  ) then
    raise exception 'You can only endorse after playing a completed game together';
  end if;

  insert into public.athlete_endorsements (game_id, athlete_id, endorser_id, rating, tags, updated_at)
  values (p_game, p_athlete, auth.uid(), p_rating, coalesce(p_tags, '{}'::text[]), now())
  on conflict (game_id, athlete_id, endorser_id) do update set
    rating = excluded.rating,
    tags = excluded.tags,
    updated_at = now();
end;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_game_participants_visibility()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid;
begin
  -- Allow service-role / dataimport paths.
  v_actor := auth.uid();
  if v_actor is null then
    return NEW;
  end if;

  if not public.is_eligible_to_join_game(NEW.game_id, NEW.user_id) then
    raise exception 'not_eligible_for_visibility'
      using errcode = '42501',
            hint = 'This game''s visibility rules block you. Friends-only games require a mutual follow with the host or an approved invite. Invite-only games require a redeem token.';
  end if;
  return NEW;
end $function$;

CREATE OR REPLACE FUNCTION public.enqueue_notification(p_user_id uuid, p_type text, p_payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if p_user_id is null or p_type is null or length(trim(p_type)) = 0 then
    return;
  end if;
  insert into public.notifications (user_id, type, payload)
  values (p_user_id, p_type, coalesce(p_payload, '{}'::jsonb));
end $function$;

CREATE OR REPLACE FUNCTION public.ensure_venue_row(p_venue_id text, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_name text DEFAULT NULL::text, p_sport text DEFAULT NULL::text, p_leisure text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_type text;
  v_num  bigint;
begin
  -- Venue ids are always "<osm_type>/<osm_id>" (server/lib/osmVenueTags.ts).
  if p_venue_id is null or p_venue_id !~ '^(node|way|relation)/[0-9]+$' then
    raise exception 'invalid_venue_id' using errcode = '22023';
  end if;

  if exists (select 1 from public.osm_sports_venues where id = p_venue_id) then
    return;
  end if;

  -- No row yet, so we need usable geometry to create one. Refuse rather than
  -- invent a venue at (0,0).
  if p_lat is null or p_lng is null
     or p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then
    raise exception 'unknown_venue' using errcode = '23503';
  end if;

  v_type := split_part(p_venue_id, '/', 1);
  v_num  := split_part(p_venue_id, '/', 2)::bigint;

  insert into public.osm_sports_venues (id, lat, lng, name, sport, leisure, osm_type, osm_id)
  values (
    p_venue_id, p_lat, p_lng,
    nullif(trim(coalesce(p_name, '')), ''),
    nullif(trim(coalesce(p_sport, '')), ''),
    nullif(trim(coalesce(p_leisure, '')), ''),
    v_type, v_num
  )
  -- do nothing: a concurrent OSM import must always win over a client-seeded row.
  on conflict (id) do nothing;
end $function$;

CREATE OR REPLACE FUNCTION public.fun_account_setup_complete(p_uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.fun_age_tier(p_birthdate date)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select case
    when p_birthdate is null then null
    when public.fun_age_years(p_birthdate) >= 18 then 'adult'
    else 'teen'
  end;
$function$;

CREATE OR REPLACE FUNCTION public.fun_age_years(p_birthdate date)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select extract(year from age(current_date, p_birthdate))::integer;
$function$;

CREATE OR REPLACE FUNCTION public.fun_games_sync_lat_lng()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
begin
  -- If location is present, derive lat/lng
  if new.location is not null then
    new.lng := st_x(new.location::geometry);
    new.lat := st_y(new.location::geometry);
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fun_min_age(p_country text)
 RETURNS smallint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(
    (select m.min_age from public.min_age_by_country m where m.country = upper(btrim(p_country))),
    13
  )::smallint;
$function$;

CREATE OR REPLACE FUNCTION public.games_set_ends_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
begin
  if NEW.status in ('completed', 'cancelled') then
    return NEW;
  end if;

  if TG_OP = 'UPDATE' and NEW.ends_at is distinct from OLD.ends_at then
    return NEW;
  end if;
  if TG_OP = 'INSERT' and NEW.ends_at is not null then
    return NEW;
  end if;

  if NEW.starts_at is null then
    NEW.ends_at := null;
  else
    NEW.ends_at := NEW.starts_at + make_interval(mins => coalesce(NEW.duration_minutes, 90));
  end if;
  return NEW;
end $function$;

CREATE OR REPLACE FUNCTION public.get_active_hosted_games_count(p_user_id uuid DEFAULT auth.uid())
 RETURNS integer
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select count(*)::int
  from public.games
  where created_by = coalesce(p_user_id, auth.uid())
    and status in ('open', 'full')
    and (
      (starts_at is not null and starts_at >= now() - interval '4 hours')
      or
      (starts_at is null and created_at >= now() - interval '24 hours')
    );
$function$;

CREATE OR REPLACE FUNCTION public.get_athlete_reputation(p_athlete uuid)
 RETURNS TABLE(sportsmanship_avg double precision, sportsmanship_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    coalesce(avg(e.rating)::double precision, 0) as sportsmanship_avg,
    coalesce(count(*)::int, 0) as sportsmanship_count
  from public.athlete_endorsements e
  where e.athlete_id = p_athlete;
$function$;

CREATE OR REPLACE FUNCTION public.get_follow_requests()
 RETURNS TABLE(follower_id uuid, display_name text, avatar_url text, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select uf.follower_id, p.display_name, p.avatar_url, uf.created_at
    from public.user_follows uf
    join public.profiles p on p.id = uf.follower_id
   where uf.followed_id = auth.uid() and uf.status = 'pending'
   order by uf.created_at desc;
$function$;

CREATE OR REPLACE FUNCTION public.get_game_comments_with_likes(p_game_id uuid)
 RETURNS TABLE(id uuid, created_at timestamp with time zone, game_id uuid, user_id uuid, body text, like_count integer, liked_by_me boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select
    c.id,
    c.created_at,
    c.game_id,
    c.user_id,
    c.body,
    coalesce(l.cnt, 0) as like_count,
    exists (
      select 1 from public.game_comment_likes mine
       where mine.comment_id = c.id and mine.user_id = (select auth.uid())
    ) as liked_by_me
  from public.game_comments c
  left join (
    select comment_id, count(*)::int as cnt
      from public.game_comment_likes
     group by comment_id
  ) l on l.comment_id = c.id
  where c.game_id = p_game_id
  order by c.created_at asc;
$function$;

CREATE OR REPLACE FUNCTION public.get_game_invite_token(p_game_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_token uuid;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;

  select g.invite_token into v_token
    from public.games g
   where g.id = p_game_id
     and (
       g.created_by = v_uid
       or exists (
         select 1 from public.game_participants gp
          where gp.game_id = g.id and gp.user_id = v_uid
       )
     );

  return v_token; -- null when the caller is not in the game: no error, no oracle
end $function$;

CREATE OR REPLACE FUNCTION public.get_game_lat_lng(p_game_id uuid)
 RETURNS TABLE(lat double precision, lng double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    st_y(g.location::geometry)::double precision as lat,
    st_x(g.location::geometry)::double precision as lng
  from public.games g
  where g.id = p_game_id
  limit 1;
$function$;

CREATE OR REPLACE FUNCTION public.get_game_outcome_summary(p_game_id uuid)
 RETURNS TABLE(my_outcome text, played_count integer, no_show_count integer, missed_count integer, total_reports integer, participants integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if (select auth.uid()) is null or not public.viewer_is_game_participant(p_game_id) then
    return;
  end if;

  return query
  select
    (select r2.outcome from public.game_outcome_reports r2
      where r2.game_id = p_game_id and r2.user_id = (select auth.uid())),
    coalesce(count(*) filter (where r.outcome = 'played'), 0)::int,
    coalesce(count(*) filter (where r.outcome = 'no_show'), 0)::int,
    coalesce(count(*) filter (where r.outcome = 'missed_it'), 0)::int,
    coalesce(count(r.*), 0)::int,
    (select count(*)::int from public.game_participants gp where gp.game_id = p_game_id)
  from public.game_outcome_reports r
  where r.game_id = p_game_id;
end $function$;

CREATE OR REPLACE FUNCTION public.get_game_social_counts(p_game_ids uuid[])
 RETURNS TABLE(game_id uuid, comment_count integer, like_count integer, liked_by_me boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select
    g.id as game_id,
    coalesce(c.cnt, 0) as comment_count,
    coalesce(l.cnt, 0) as like_count,
    coalesce(l.mine, false) as liked_by_me
  from public.games g
  left join (
    select gc.game_id, count(*)::int as cnt
      from public.game_comments gc
     where gc.game_id = any(p_game_ids)
     group by gc.game_id
  ) c on c.game_id = g.id
  left join (
    select gl.game_id,
           count(*)::int as cnt,
           bool_or(gl.user_id = (select auth.uid())) as mine
      from public.game_likes gl
     where gl.game_id = any(p_game_ids)
     group by gl.game_id
  ) l on l.game_id = g.id
  where g.id = any(p_game_ids);
$function$;

CREATE OR REPLACE FUNCTION public.get_games_at_venue(p_lat double precision, p_lng double precision, p_radius_m double precision DEFAULT 150, p_include_completed boolean DEFAULT true, p_limit integer DEFAULT 30)
 RETURNS TABLE(id uuid, title text, sport text, starts_at timestamp with time zone, ends_at timestamp with time zone, ended_at timestamp with time zone, status text, spots_needed integer, participant_count integer, distance_m double precision, is_past boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select
    g.id,
    g.title,
    g.sport,
    g.starts_at,
    g.ends_at,
    g.ended_at,
    g.status,
    g.spots_needed,
    coalesce(part.cnt, 0)::int as participant_count,
    st_distance(g.location, st_point(p_lng, p_lat)::geography) as distance_m,
    (
      g.status in ('completed', 'cancelled')
      or g.ended_at is not null
      or (g.ends_at is not null and g.ends_at <= now())
    ) as is_past
  from public.games g
  left join lateral (
    select count(*)::int as cnt
      from public.game_participants gp
     where gp.game_id = g.id and gp.role != 'substitute'
  ) part on true
  where st_dwithin(
          g.location,
          st_point(p_lng, p_lat)::geography,
          greatest(10.0, least(2000.0, coalesce(p_radius_m, 150.0)))
        )
    and (
      coalesce(p_include_completed, true)
      or g.status not in ('completed', 'cancelled')
    )
  order by coalesce(g.starts_at, g.created_at) desc
  limit greatest(1, least(100, coalesce(p_limit, 30)));
$function$;

CREATE OR REPLACE FUNCTION public.get_games_nearby(lat double precision, lng double precision, radius_km double precision DEFAULT 10)
 RETURNS TABLE(id uuid, title text, sport text, spots_needed integer, starts_at timestamp with time zone, created_by uuid, created_at timestamp with time zone, status text, location_label text, description text, requirements jsonb, participant_count integer, substitute_count integer, spots_remaining integer, distance_km double precision, lat double precision, lng double precision, live_started_at timestamp with time zone, ended_at timestamp with time zone, visibility text, ends_at timestamp with time zone, duration_minutes integer, host_name text, host_avatar_url text, host_sportsmanship double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with viewer as (
    select p.gender from public.profiles p where p.id = auth.uid()
  )
  select
    g.id, g.title, g.sport, g.spots_needed, g.starts_at, g.created_by, g.created_at,
    g.status, g.location_label, g.description,
    coalesce(g.requirements, '{}'::jsonb)                          as requirements,
    coalesce(part.player_cnt, 0)::int                              as participant_count,
    coalesce(part.sub_cnt, 0)::int                                 as substitute_count,
    greatest(g.spots_needed - coalesce(part.player_cnt, 0), 0)::int as spots_remaining,
    (st_distance(g.location, st_point(lng, lat)::geography) / 1000.0) as distance_km,
    st_y(g.location::geometry)                                     as lat,
    st_x(g.location::geometry)                                     as lng,
    g.live_started_at, g.ended_at, g.visibility, g.ends_at, g.duration_minutes,
    host.display_name                                              as host_name,
    host.avatar_url                                                as host_avatar_url,
    host.sportsmanship_avg                                         as host_sportsmanship
  from public.games g
  left join lateral (
    select
      count(*) filter (where gp.role != 'substitute')::int as player_cnt,
      count(*) filter (where gp.role  = 'substitute')::int as sub_cnt
    from public.game_participants gp
    where gp.game_id = g.id
  ) part on true
  left join public.profiles host on host.id = g.created_by
  where st_dwithin(g.location, st_point(lng, lat)::geography, radius_km * 1000.0)
    and g.status in ('open', 'full', 'live')
    and (
      g.status <> 'live'
      or (coalesce(g.live_started_at, g.updated_at, g.created_at) > now() - interval '24 hours')
    )
    and (
      (g.ends_at is not null and g.ends_at > now())
      or (g.ends_at is null and g.created_at > now() - interval '3 days')
    )
    and (
      g.live_started_at is null
      or g.live_started_at + make_interval(mins => coalesce(g.duration_minutes, 90)) > now()
    )
    and public.can_view_game_for_gender(
      (select gender from viewer),
      host.gender,
      g.requirements->>'matchType'
    )
  order by distance_km asc;
$function$;

CREATE OR REPLACE FUNCTION public.get_guest_game_comments(p_game_id uuid)
 RETURNS TABLE(id uuid, created_at timestamp with time zone, game_id uuid, user_id uuid, body text, like_count integer, liked_by_me boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    c.id,
    c.created_at,
    c.game_id,
    null::uuid as user_id,
    c.body,
    coalesce(l.cnt, 0) as like_count,
    false as liked_by_me
  from public.game_comments c
  left join (
    select comment_id, count(*)::int as cnt
      from public.game_comment_likes
     group by comment_id
  ) l on l.comment_id = c.id
  where c.game_id = p_game_id
    and exists (
      select 1 from public.games g
       where g.id = c.game_id
         and coalesce(g.visibility, 'public') = 'public'
         and g.status not in ('completed', 'cancelled')
    )
  order by c.created_at asc;
$function$;

CREATE OR REPLACE FUNCTION public.get_guest_games_at_venue(p_lat double precision, p_lng double precision, p_radius_m double precision DEFAULT 150, p_limit integer DEFAULT 30)
 RETURNS TABLE(id uuid, title text, sport text, starts_at timestamp with time zone, ends_at timestamp with time zone, ended_at timestamp with time zone, status text, spots_needed integer, participant_count integer, distance_m double precision, is_past boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    g.id, g.title, g.sport, g.starts_at, g.ends_at, g.ended_at, g.status,
    g.spots_needed,
    coalesce(part.cnt, 0)::int,
    st_distance(g.location, st_point(p_lng, p_lat)::geography),
    (
      g.status in ('completed', 'cancelled')
      or g.ended_at is not null
      or (g.ends_at is not null and g.ends_at <= now())
    )
  from public.games g
  left join lateral (
    select count(*)::int as cnt
      from public.game_participants gp
     where gp.game_id = g.id and gp.role != 'substitute'
  ) part on true
  where st_dwithin(
          g.location,
          st_point(p_lng, p_lat)::geography,
          greatest(10.0, least(2000.0, coalesce(p_radius_m, 150.0)))
        )
    and coalesce(g.visibility, 'public') = 'public'
    and public.can_view_game_for_gender(null, null, g.requirements->>'matchType')
  order by coalesce(g.starts_at, g.created_at) desc
  limit greatest(1, least(100, coalesce(p_limit, 30)));
$function$;

CREATE OR REPLACE FUNCTION public.get_guest_games_nearby(lat double precision, lng double precision, radius_km double precision DEFAULT 10)
 RETURNS TABLE(id uuid, title text, sport text, spots_needed integer, starts_at timestamp with time zone, created_by uuid, created_at timestamp with time zone, status text, location_label text, description text, requirements jsonb, participant_count integer, substitute_count integer, spots_remaining integer, distance_km double precision, lat double precision, lng double precision, live_started_at timestamp with time zone, ended_at timestamp with time zone, visibility text, ends_at timestamp with time zone, duration_minutes integer, host_name text, host_avatar_url text, host_sportsmanship double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    g.id, g.title, g.sport, g.spots_needed, g.starts_at,
    null::uuid as created_by, -- the whole point: a guest never learns who hosts
    g.created_at, g.status, g.location_label, g.description, g.requirements,
    g.participant_count, g.substitute_count, g.spots_remaining, g.distance_km,
    g.lat, g.lng, g.live_started_at, g.ended_at, g.visibility, g.ends_at,
    g.duration_minutes,
    -- Same promise as created_by, kept in SQL rather than in JSX. The client
    -- renders no host row because there is no host name, not because it checked.
    null::text as host_name,
    null::text as host_avatar_url,
    null::double precision as host_sportsmanship
  from public.get_games_nearby(lat, lng, radius_km) g
  where coalesce(g.visibility, 'public') = 'public';
$function$;

CREATE OR REPLACE FUNCTION public.get_guest_note_by_id(p_note_id uuid, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision)
 RETURNS TABLE(id uuid, created_at timestamp with time zone, created_by uuid, lat double precision, lng double precision, body text, visibility text, place_name text, distance_km double precision, comment_count integer, like_count integer, liked_by_me boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    n.id,
    n.created_at,
    null::uuid as created_by,
    n.lat,
    n.lng,
    n.body,
    n.visibility,
    n.place_name,
    n.distance_km,
    n.comment_count,
    n.like_count,
    false as liked_by_me
  from public.get_note_by_id(p_note_id, p_lat, p_lng) n
  where n.visibility = 'public';
$function$;

CREATE OR REPLACE FUNCTION public.get_guest_notes_nearby(p_lat double precision, p_lng double precision, p_radius_km double precision DEFAULT 10, p_limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, created_at timestamp with time zone, created_by uuid, lat double precision, lng double precision, body text, visibility text, place_name text, distance_km double precision, comment_count integer, like_count integer, liked_by_me boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    n.id,
    n.created_at,
    null::uuid as created_by,
    n.lat,
    n.lng,
    n.body,
    n.visibility,
    n.place_name,
    n.distance_km,
    n.comment_count,
    n.like_count,
    false as liked_by_me
  from public.get_notes_nearby(p_lat, p_lng, p_radius_km, p_limit) n
  where n.visibility = 'public';
$function$;

CREATE OR REPLACE FUNCTION public.get_guest_signup_rules()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'default_min_age', 13,
    'min_age_by_country',
      coalesce((select jsonb_object_agg(m.country, m.min_age) from public.min_age_by_country m), '{}'::jsonb),
    'teen_signups_open',
      coalesce((select f.enabled from public.app_flags f where f.key = 'teen_signups_open'), false)
  );
$function$;

CREATE OR REPLACE FUNCTION public.get_guest_venue_comments(p_venue_id text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, created_at timestamp with time zone, venue_id text, user_id uuid, body text, like_count integer, liked_by_me boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    c.id, c.created_at, c.venue_id,
    null::uuid as user_id,
    c.body, c.like_count,
    false as liked_by_me
  from public.get_venue_comments_with_likes(p_venue_id, p_limit, p_offset) c;
$function$;

CREATE OR REPLACE FUNCTION public.get_guest_venue_photos(p_venue_id text, p_limit integer DEFAULT 12)
 RETURNS TABLE(id uuid, created_at timestamp with time zone, venue_id text, user_id uuid, storage_path text, caption text, status text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    p.id, p.created_at, p.venue_id,
    null::uuid as user_id,
    p.storage_path, p.caption, p.status
  from public.get_venue_photos(p_venue_id, p_limit) p
  where p.status = 'visible';
$function$;

CREATE OR REPLACE FUNCTION public.get_guest_venue_reviews(p_venue_id text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, created_at timestamp with time zone, updated_at timestamp with time zone, venue_id text, user_id uuid, rating smallint, body text, is_mine boolean, total_count integer, avg_rating numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    r.id, r.created_at, r.updated_at, r.venue_id,
    null::uuid as user_id,
    r.rating, r.body,
    false as is_mine,
    r.total_count, r.avg_rating
  from public.get_venue_reviews(p_venue_id, p_limit, p_offset) r;
$function$;

CREATE OR REPLACE FUNCTION public.get_latest_status(p_user uuid)
 RETURNS TABLE(id uuid, body text, created_at timestamp with time zone, expires_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  select s.id, s.body, s.created_at, s.expires_at
    from public.user_statuses s
   where s.user_id = p_user
     and s.expires_at > now()
   order by s.created_at desc
   limit 1;
$function$;

CREATE OR REPLACE FUNCTION public.get_live_nearby(p_lat double precision, p_lng double precision, p_radius_km double precision DEFAULT 25, p_limit integer DEFAULT 40)
 RETURNS TABLE(kind text, id text, created_at timestamp with time zone, lat double precision, lng double precision, title text, body text, sport text, visibility text, comment_count integer, created_by uuid, like_count integer, liked_by_me boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  with cfg as (
    select
      coalesce(p_lat, 0.0) as qlat,
      coalesce(p_lng, 0.0) as qlng,
      greatest(0.5, least(100.0, coalesce(p_radius_km, 25.0))) as rkm,
      greatest(1, least(200, coalesce(p_limit, 40))) as lim
  ),
  viewer as (
    select p.gender from public.profiles p where p.id = auth.uid()
  ),
  note_likes as (
    select
      l.note_id,
      count(*)::int as cnt,
      bool_or(l.user_id = (select auth.uid())) as mine
      from public.map_note_likes l
     group by l.note_id
  ),
  note_comments as (
    select c.note_id, count(*)::int as cnt from public.map_note_comments c group by c.note_id
  ),
  notes as (
    select
      'note'::text as kind,
      n.id::text as id,
      n.created_at,
      n.lat,
      n.lng,
      null::text as title,
      n.body,
      null::text as sport,
      n.visibility,
      coalesce(nc.cnt, 0) as comment_count,
      n.created_by,
      coalesce(nl.cnt, 0) as like_count,
      coalesce(nl.mine, false) as liked_by_me
    from public.map_notes n
    left join note_likes nl on nl.note_id = n.id
    left join note_comments nc on nc.note_id = n.id
    -- Keep strict boundary behavior for Live: notes at exactly radius are excluded.
    where public.haversine_km((select qlat from cfg), (select qlng from cfg), n.lat, n.lng) < (select rkm from cfg)
  ),
  games as (
    select
      'game'::text as kind,
      g.id::text as id,
      g.created_at,
      g.lat,
      g.lng,
      g.title as title,
      g.description as body,
      g.sport,
      g.visibility::text as visibility,
      0::int as comment_count,
      g.created_by,
      0::int as like_count,
      -- Games have no like feature; false is the honest answer, not a placeholder.
      false as liked_by_me
    from public.games g
    left join public.profiles host on host.id = g.created_by
    where public.haversine_km((select qlat from cfg), (select qlng from cfg), g.lat, g.lng) <= (select rkm from cfg)
      and coalesce(g.status::text, '') not in ('completed','cancelled')
      -- Scheduled games expire at ends_at; unscheduled ones age out on the map TTL.
      and (
            (g.ends_at is not null and g.ends_at > now())
         or (g.ends_at is null and g.created_at > now() - interval '3 days')
      )
      -- A host-started game is over once its duration has run from the press.
      and (
            g.live_started_at is null
         or g.live_started_at + make_interval(mins => coalesce(g.duration_minutes, 90)) > now()
      )
      and public.can_view_game_for_gender(
        (select gender from viewer),
        host.gender,
        g.requirements->>'matchType'
      )
  )
  select * from (
    select * from notes
    union all
    select * from games
  ) u
  order by u.created_at desc
  limit (select lim from cfg);
$function$;

CREATE OR REPLACE FUNCTION public.get_my_account_status()
 RETURNS TABLE(has_birthdate boolean, has_gender boolean, missing_documents text[], age_tier text, teen_signups_open boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.get_my_dm_inbox()
 RETURNS TABLE(thread_id uuid, other_user_id uuid, display_name text, avatar_url text, last_message_body text, last_message_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with my_threads as (
    select m.thread_id
    from public.dm_thread_members m
    where m.user_id = auth.uid()
  ),
  others as (
    select
      mt.thread_id,
      om.user_id as other_user_id
    from my_threads mt
    join public.dm_thread_members om
      on om.thread_id = mt.thread_id
     and om.user_id <> auth.uid()
  )
  select
    o.thread_id,
    o.other_user_id,
    p.display_name,
    p.avatar_url,
    lm.body as last_message_body,
    lm.created_at as last_message_at
  from others o
  left join public.profiles p on p.id = o.other_user_id
  left join lateral (
    select m.body, m.created_at
    from public.dm_messages m
    where m.thread_id = o.thread_id
    order by m.created_at desc
    limit 1
  ) lm on true
  order by coalesce(lm.created_at, (select t.created_at from public.dm_threads t where t.id = o.thread_id)) desc nulls last;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_game_inbox()
 RETURNS TABLE(id uuid, title text, sport text, starts_at timestamp with time zone, ends_at timestamp with time zone, ended_at timestamp with time zone, live_started_at timestamp with time zone, duration_minutes integer, visibility text, invite_token uuid, created_by uuid, status text, location_label text, lat double precision, lng double precision, participant_count integer, spots_remaining integer, last_message_body text, last_message_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with my_games as (
    select gp.game_id, gp.chat_hidden_at
      from public.game_participants gp
     where gp.user_id = auth.uid()
  ),
  counts as (
    select gp.game_id, count(*)::int as cnt
      from public.game_participants gp
     where gp.game_id in (select game_id from my_games)
     group by gp.game_id
  ),
  last_msgs as (
    select distinct on (m.game_id)
           m.game_id,
           m.body  as last_message_body,
           m.created_at as last_message_at
      from public.game_messages m
     where m.game_id in (select game_id from my_games)
     order by m.game_id, m.created_at desc
  )
  select g.id,
         g.title,
         g.sport,
         g.starts_at,
         g.ends_at,
         g.ended_at,
         g.live_started_at,
         g.duration_minutes,
         g.visibility,
         g.invite_token,
         g.created_by,
         g.status::text,
         g.location_label,
         g.lat,
         g.lng,
         coalesce(c.cnt, 0) as participant_count,
         greatest(0, coalesce(g.spots_needed, 2) - coalesce(c.cnt, 0)) as spots_remaining,
         lm.last_message_body,
         lm.last_message_at
    from public.games g
    join my_games mg on mg.game_id = g.id
    left join counts c     on c.game_id  = g.id
    left join last_msgs lm on lm.game_id = g.id
   where mg.chat_hidden_at is null
      or coalesce(lm.last_message_at, '-infinity'::timestamptz) > mg.chat_hidden_at
   order by greatest(
              coalesce(lm.last_message_at, 'epoch'::timestamptz),
              coalesce(g.ends_at,         'epoch'::timestamptz),
              coalesce(g.starts_at,       'epoch'::timestamptz)
            ) desc nulls last,
            g.created_at desc;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_note_inbox()
 RETURNS TABLE(id uuid, body text, visibility text, created_at timestamp with time zone, created_by uuid, lat double precision, lng double precision, place_name text, comment_count integer, last_comment_body text, last_comment_at timestamp with time zone, is_author boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with mine as (
    -- Notes I authored.
    select n.id from public.map_notes n where n.created_by = auth.uid()
    union
    -- Notes I commented on.
    select c.note_id from public.map_note_comments c where c.user_id = auth.uid()
  ),
  counts as (
    select c.note_id, count(*)::int as cnt
      from public.map_note_comments c
     where c.note_id in (select id from mine)
     group by c.note_id
  ),
  last_c as (
    select distinct on (c.note_id)
           c.note_id, c.body, c.created_at
      from public.map_note_comments c
     where c.note_id in (select id from mine)
     order by c.note_id, c.created_at desc
  )
  select n.id,
         n.body,
         n.visibility,
         n.created_at,
         n.created_by,
         n.lat,
         n.lng,
         n.place_name,
         coalesce(c.cnt, 0) as comment_count,
         lc.body  as last_comment_body,
         lc.created_at as last_comment_at,
         (n.created_by = auth.uid()) as is_author
    from public.map_notes n
    join mine on mine.id = n.id
    left join counts c on c.note_id = n.id
    left join last_c lc on lc.note_id = n.id
   order by greatest(
              coalesce(lc.created_at, 'epoch'::timestamptz),
              coalesce(n.created_at,  'epoch'::timestamptz)
            ) desc nulls last;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_pending_invites()
 RETURNS TABLE(invite_id uuid, game_id uuid, game_title text, invitee_user_id uuid, invitee_display_name text, invitee_avatar_url text, invited_by_user_id uuid, invited_by_display_name text, status text, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select i.id,
         i.game_id,
         g.title,
         i.invitee_user_id,
         pi.display_name,
         pi.avatar_url,
         i.invited_by_user_id,
         pb.display_name,
         i.status,
         i.created_at
    from public.game_chat_invites i
    join public.games g on g.id = i.game_id
    left join public.profiles pi on pi.id = i.invitee_user_id
    left join public.profiles pb on pb.id = i.invited_by_user_id
   where g.created_by = auth.uid()
     and i.status = 'pending'
   order by i.created_at desc;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_saved_venues(p_limit integer DEFAULT 100)
 RETURNS TABLE(venue_id text, saved_at timestamp with time zone, name text, sport text, leisure text, lat double precision, lng double precision)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select
    s.venue_id,
    s.created_at as saved_at,
    v.name,
    v.sport,
    v.leisure,
    v.lat,
    v.lng
  from public.saved_venues s
  join public.osm_sports_venues v on v.id = s.venue_id
  where s.user_id = (select auth.uid())
  order by s.created_at desc
  limit greatest(1, least(500, coalesce(p_limit, 100)));
$function$;

CREATE OR REPLACE FUNCTION public.get_my_unread_counts()
 RETURNS TABLE(thread_kind text, thread_id uuid, unread_count integer, unread_capped boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with me as (select auth.uid() as uid),
  watermark as (
    select r.thread_kind, r.thread_id, r.last_read_at
    from public.chat_reads r, me
    where r.user_id = me.uid
  ),
  games as (
    select gp.game_id as tid from public.game_participants gp, me where gp.user_id = me.uid
  ),
  dms as (
    select tm.thread_id as tid from public.dm_thread_members tm, me where tm.user_id = me.uid
  ),
  notes as (
    select n.id as tid from public.map_notes n, me where n.created_by = me.uid
    union
    select c.note_id from public.map_note_comments c, me where c.user_id = me.uid
  )
  select 'game'::text, g.tid, x.n::int, x.n >= 100
  from games g, me
  cross join lateral (
    select count(*) as n from (
      select 1 from public.game_messages m
      where m.game_id = g.tid
        and m.user_id is distinct from me.uid
        and m.created_at > coalesce(
          (select w.last_read_at from watermark w where w.thread_kind = 'game' and w.thread_id = g.tid),
          '-infinity'::timestamptz)
      order by m.created_at desc limit 100
    ) s
  ) x
  where x.n > 0
  union all
  select 'dm'::text, d.tid, x.n::int, x.n >= 100
  from dms d, me
  cross join lateral (
    select count(*) as n from (
      select 1 from public.dm_messages m
      where m.thread_id = d.tid
        and m.user_id is distinct from me.uid
        and m.created_at > coalesce(
          (select w.last_read_at from watermark w where w.thread_kind = 'dm' and w.thread_id = d.tid),
          '-infinity'::timestamptz)
      order by m.created_at desc limit 100
    ) s
  ) x
  where x.n > 0
  union all
  select 'note'::text, nt.tid, x.n::int, x.n >= 100
  from notes nt, me
  cross join lateral (
    select count(*) as n from (
      select 1 from public.map_note_comments c
      where c.note_id = nt.tid
        and c.user_id is distinct from me.uid
        and c.created_at > coalesce(
          (select w.last_read_at from watermark w where w.thread_kind = 'note' and w.thread_id = nt.tid),
          '-infinity'::timestamptz)
      order by c.created_at desc limit 100
    ) s
  ) x
  where x.n > 0;
$function$;

CREATE OR REPLACE FUNCTION public.get_note_by_id(p_note_id uuid, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision)
 RETURNS TABLE(id uuid, created_at timestamp with time zone, created_by uuid, lat double precision, lng double precision, body text, visibility text, place_name text, distance_km double precision, comment_count integer, like_count integer, liked_by_me boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  select
    n.id,
    n.created_at,
    n.created_by,
    n.lat,
    n.lng,
    n.body,
    n.visibility,
    n.place_name,
    case
      when p_lat is null or p_lng is null then null::double precision
      else public.haversine_km(p_lat, p_lng, n.lat, n.lng)
    end as distance_km,
    (select count(*)::int from public.map_note_comments c where c.note_id = n.id) as comment_count,
    (select count(*)::int from public.map_note_likes l where l.note_id = n.id) as like_count,
    exists (
      select 1
        from public.map_note_likes ml
       where ml.note_id = n.id
         and ml.user_id = (select auth.uid())
    ) as liked_by_me
  from public.map_notes n
  where n.id = p_note_id;
$function$;

CREATE OR REPLACE FUNCTION public.get_note_comments(p_note_id uuid)
 RETURNS TABLE(id uuid, created_at timestamp with time zone, note_id uuid, user_id uuid, body text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  select c.id, c.created_at, c.note_id, c.user_id, c.body
    from public.map_note_comments c
   where c.note_id = p_note_id
   order by c.created_at asc;
$function$;

CREATE OR REPLACE FUNCTION public.get_note_comments_with_likes(p_note_id uuid, p_limit integer DEFAULT 50, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(id uuid, created_at timestamp with time zone, note_id uuid, user_id uuid, body text, like_count integer, liked_by_me boolean, author_name text, author_avatar_url text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  -- Newest page first, then flipped back to reading order. The read was
  -- previously unbounded; a thread is now capped and pageable like the other two.
  --
  -- The cursor is inclusive (`<=`), matching the message fetchers: two rows can
  -- share a created_at to the microsecond and an exclusive cursor would skip one
  -- of them forever. The caller drops the repeated boundary row by id.
  with page as (
    select c.*
      from public.map_note_comments c
     where c.note_id = p_note_id
       and (p_before is null or c.created_at <= p_before)
     order by c.created_at desc, c.id desc
     limit greatest(1, least(coalesce(p_limit, 50), 200))
  )
  select p.id, p.created_at, p.note_id, p.user_id, p.body,
         coalesce(l.cnt, 0) as like_count,
         exists (
           select 1 from public.map_note_comment_likes mine
            where mine.comment_id = p.id and mine.user_id = auth.uid()
         ) as liked_by_me,
         pr.display_name, pr.avatar_url
    from page p
    left join (
      select comment_id, count(*)::int as cnt
        from public.map_note_comment_likes
       group by comment_id
    ) l on l.comment_id = p.id
    left join public.profiles pr on pr.id = p.user_id
   order by p.created_at asc, p.id asc;
$function$;

CREATE OR REPLACE FUNCTION public.get_notes_nearby(p_lat double precision, p_lng double precision, p_radius_km double precision DEFAULT 10, p_limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, created_at timestamp with time zone, created_by uuid, lat double precision, lng double precision, body text, visibility text, place_name text, distance_km double precision, comment_count integer, like_count integer, liked_by_me boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  with bounds as (
    select
      greatest(0.5, least(100.0, coalesce(p_radius_km, 10.0))) as rkm,
      coalesce(p_lat, 0.0) as qlat,
      coalesce(p_lng, 0.0) as qlng
  ),
  box as (
    select
      rkm,
      qlat,
      qlng,
      (rkm / 111.0) as dlat,
      (rkm / (111.0 * greatest(0.2, cos(radians(qlat))))) as dlng
    from bounds
  ),
  comments as (
    select note_id, count(*)::int as cnt
      from public.map_note_comments
     group by note_id
  ),
  -- One pass for both the public count and the viewer's own state. `bool_or`
  -- is null for an anonymous viewer (uid is null, so every comparison is
  -- null), which coalesces to false below.
  likes as (
    select
      note_id,
      count(*)::int as cnt,
      bool_or(user_id = (select auth.uid())) as mine
      from public.map_note_likes
     group by note_id
  )
  select
    n.id,
    n.created_at,
    n.created_by,
    n.lat,
    n.lng,
    n.body,
    n.visibility,
    n.place_name,
    public.haversine_km((select qlat from box), (select qlng from box), n.lat, n.lng) as distance_km,
    coalesce(c.cnt, 0) as comment_count,
    coalesce(l.cnt, 0) as like_count,
    coalesce(l.mine, false) as liked_by_me
  from public.map_notes n
  left join comments c on c.note_id = n.id
  left join likes l on l.note_id = n.id
  where
    n.lat between (select qlat - dlat from box) and (select qlat + dlat from box)
    and n.lng between (select qlng - dlng from box) and (select qlng + dlng from box)
    and public.haversine_km((select qlat from box), (select qlng from box), n.lat, n.lng) <= (select rkm from box)
  order by n.created_at desc
  limit greatest(1, least(200, coalesce(p_limit, 50)));
$function$;

CREATE OR REPLACE FUNCTION public.get_or_create_dm_thread(p_other uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me uuid := auth.uid();
  tid uuid;
begin
  if me is null then
    raise exception 'Not signed in';
  end if;
  if p_other is null or p_other = me then
    raise exception 'Invalid user';
  end if;

  select t.id into tid
  from public.dm_threads t
  join public.dm_thread_members a on a.thread_id = t.id and a.user_id = me
  join public.dm_thread_members b on b.thread_id = t.id and b.user_id = p_other
  limit 1;

  if tid is not null then
    return tid;
  end if;

  insert into public.dm_threads default values returning id into tid;
  insert into public.dm_thread_members (thread_id, user_id) values (tid, me);
  insert into public.dm_thread_members (thread_id, user_id) values (tid, p_other);
  return tid;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_post_comments(p_post_id uuid)
 RETURNS TABLE(id uuid, created_at timestamp with time zone, post_id uuid, user_id uuid, body text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select c.id, c.created_at, c.post_id, c.user_id, c.body
    from public.feed_media_post_comments c
   where c.post_id = p_post_id
   order by c.created_at asc;
$function$;

CREATE OR REPLACE FUNCTION public.get_profiles_nearby(lat double precision, lng double precision, radius_km double precision DEFAULT 5, limit_count integer DEFAULT 50)
 RETURNS TABLE(profile_id uuid, display_name text, avatar_url text, avatar_id text, sportsmanship double precision, status_body text, status_expires_at timestamp with time zone, lat double precision, lng double precision, distance_km double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    p.id as profile_id,
    p.display_name,
    p.avatar_url,
    p.avatar_id,
    p.sportsmanship_avg as sportsmanship,
    st.body as status_body,
    null::timestamptz as status_expires_at,
    pl.lat,
    pl.lng,
    (st_distance(pl.location_geography, st_point(lng, lat)::geography) / 1000.0) as distance_km
  FROM public.profile_locations pl
  JOIN public.profiles p ON p.id = pl.profile_id
  JOIN auth.users u ON u.id = p.id
  LEFT JOIN LATERAL (
    SELECT s.body
    FROM public.status_updates s
    WHERE s.user_id = p.id
    ORDER BY s.created_at DESC
    LIMIT 1
  ) st ON true
  WHERE st_dwithin(
      pl.location_geography,
      st_point(lng, lat)::geography,
      radius_km * 1000.0
    )
    -- STALE CHECK: others must be active within 45m; self always shown if in radius.
    AND (
      p.id = auth.uid()
      OR
      pl.updated_at > now() - interval '45 minutes'
    )
    -- PRIVACY RULES (onboarding / anonymous)
    AND (
      p.id = auth.uid()
      OR
      (
        NOT coalesce(u.is_anonymous, false)
        AND coalesce(p.onboarding_completed, false) = true
        AND EXISTS (
          SELECT 1
          FROM auth.users caller_u
          JOIN public.profiles caller_p ON caller_p.id = caller_u.id
          WHERE caller_u.id = auth.uid()
            AND NOT coalesce(caller_u.is_anonymous, false)
            AND coalesce(caller_p.onboarding_completed, false) = true
        )
      )
    )
    -- PRESENCE VISIBILITY (Ghost / Close-friends / Public)
    AND (
      p.id = auth.uid()
      OR pl.location_visibility = 'public'
      OR (
        pl.location_visibility = 'close_friends'
        AND EXISTS (
          SELECT 1 FROM public.user_follows uf
          WHERE (uf.follower_id = auth.uid() AND uf.followed_id = p.id)
             OR (uf.follower_id = p.id AND uf.followed_id = auth.uid())
        )
      )
    )
  ORDER BY pl.location_geography <-> st_point(lng, lat)::geography
  LIMIT limit_count;
$function$;

CREATE OR REPLACE FUNCTION public.get_push_targets(p_since timestamp with time zone, p_radius_km double precision DEFAULT 15, p_limit integer DEFAULT 500)
 RETURNS TABLE(token text, platform text, user_id uuid, game_id uuid, game_title text, sport text, distance_km double precision)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    t.token,
    t.platform,
    pl.profile_id as user_id,
    g.id          as game_id,
    g.title       as game_title,
    g.sport,
    (st_distance(pl.location_geography, g.location) / 1000.0) as distance_km
  from public.games g
  join public.profiles host
    on host.id = g.created_by
  join public.profile_locations pl
    on st_dwithin(pl.location_geography, g.location, p_radius_km * 1000.0)
  join public.profiles viewer
    on viewer.id = pl.profile_id
  join public.user_push_tokens t
    on t.user_id = pl.profile_id
  where g.created_at > p_since
    -- Only public games. Broadcasting a friends-only or invite-only game would announce to the
    -- neighbourhood precisely what its host chose to keep off the map.
    and coalesce(g.visibility, 'public') = 'public'
    and g.status in ('open', 'full')
    and (g.starts_at is null or g.starts_at > now())
    -- Never notify the host about their own game, nor anyone already on the roster.
    and g.created_by <> pl.profile_id
    and not exists (
      select 1 from public.game_participants gp
      where gp.game_id = g.id and gp.user_id = pl.profile_id
    )
    and not exists (
      select 1 from public.push_notifications_sent s
      where s.user_id = pl.profile_id and s.game_id = g.id
    )
    -- The safety rule, applied exactly as get_games_nearby applies it.
    and public.can_view_game_for_gender(
      viewer.gender,
      host.gender,
      g.requirements->>'matchType'
    )
    -- A location six months stale is not "near" anyone. Far longer than the map's 45 minutes,
    -- because this asks "is this your area", not "are you standing here right now".
    and pl.updated_at > now() - interval '7 days'
  order by g.created_at desc, distance_km asc
  limit p_limit;
$function$;

CREATE OR REPLACE FUNCTION public.get_rateable_teammates(p_game_id uuid)
 RETURNS TABLE(user_id uuid, display_name text, avatar_url text, my_rating integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    p.id,
    p.display_name,
    p.avatar_url,
    e.rating
  from public.game_participants gp
  join public.profiles p on p.id = gp.user_id
  left join public.athlete_endorsements e
    on e.game_id = p_game_id
   and e.athlete_id = gp.user_id
   and e.endorser_id = (select auth.uid())
  where gp.game_id = p_game_id
    and gp.user_id <> (select auth.uid())
    and public.viewer_is_game_participant(p_game_id)
  order by p.display_name nulls last;
$function$;

CREATE OR REPLACE FUNCTION public.get_recent_statuses(p_limit integer DEFAULT 40)
 RETURNS TABLE(id uuid, user_id uuid, body text, created_at timestamp with time zone, expires_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  select s.id, s.user_id, s.body, s.created_at, s.expires_at
    from public.user_statuses s
   where s.expires_at > now()
   order by s.created_at desc
   limit greatest(1, least(200, coalesce(p_limit, 40)));
$function$;

CREATE OR REPLACE FUNCTION public.get_rematch_poll(p_game_id uuid)
 RETURNS TABLE(poll_id uuid, created_by uuid, question text, created_at timestamp with time zone, closed_at timestamp with time zone, in_count integer, out_count integer, my_choice text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select
    pl.id,
    pl.created_by,
    pl.question,
    pl.created_at,
    pl.closed_at,
    coalesce(count(*) filter (where v.choice = 'in'), 0)::int,
    coalesce(count(*) filter (where v.choice = 'out'), 0)::int,
    max(v.choice) filter (where v.user_id = (select auth.uid()))
  from public.game_polls pl
  left join public.game_poll_votes v on v.poll_id = pl.id
  where pl.game_id = p_game_id
    and pl.kind = 'rematch'
    and pl.closed_at is null
  group by pl.id, pl.created_by, pl.question, pl.created_at, pl.closed_at
  order by pl.created_at desc
  limit 1;
$function$;

CREATE OR REPLACE FUNCTION public.get_saved_venue_ids(p_venue_ids text[])
 RETURNS TABLE(venue_id text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select s.venue_id
    from public.saved_venues s
   where s.user_id = (select auth.uid())
     and s.venue_id = any(p_venue_ids);
$function$;

CREATE OR REPLACE FUNCTION public.get_shared_completed_games(p_other uuid)
 RETURNS TABLE(game_id uuid, title text, sport text, starts_at timestamp with time zone, completed_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    g.id as game_id,
    g.title,
    g.sport,
    g.starts_at,
    g.updated_at as completed_at
  from public.games g
  join public.game_participants me
    on me.game_id = g.id
   and me.user_id = auth.uid()
  join public.game_participants them
    on them.game_id = g.id
   and them.user_id = p_other
  where auth.uid() is not null
    and p_other is not null
    and g.status = 'completed'
  order by coalesce(g.starts_at, g.updated_at, g.created_at) desc nulls last
  limit 25;
$function$;

CREATE OR REPLACE FUNCTION public.get_similar_athletes(lat double precision, lng double precision, radius_km double precision DEFAULT 5, limit_count integer DEFAULT 20)
 RETURNS TABLE(profile_id uuid, display_name text, avatar_url text, avatar_id text, sportsmanship double precision, shared_sports text[], availability text, distance_km double precision, final_score double precision)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_my_sports text[];
  v_my_availability text;
  -- Resolved here, outside any FROM clause: no column named lat/lng is in
  -- scope, so these can only be the parameters.
  v_origin geography := st_point(lng, lat)::geography;
begin
  if v_uid is null then
    return;
  end if;

  select public._athlete_sports_array(p.athlete_profile), p.athlete_profile->>'availability'
    into v_my_sports, v_my_availability
  from public.profiles p
  where p.id = v_uid;

  return query
  select
    p.id as profile_id,
    p.display_name,
    p.avatar_url,
    p.avatar_id,
    p.sportsmanship_avg as sportsmanship,
    array(
      select distinct x
      from unnest(public._athlete_sports_array(p.athlete_profile)) x
      where x = any(coalesce(v_my_sports, array[]::text[]))
    ) as shared_sports,
    p.athlete_profile->>'availability' as availability,
    (st_distance(pl.location_geography, v_origin) / 1000.0) as distance_km,
    (
      -- sports/skill overlap: fraction of MY sports the candidate also plays
      0.5 * (
        case
          when coalesce(array_length(v_my_sports, 1), 0) = 0 then 0.0
          else (
            select count(*)::double precision
            from unnest(public._athlete_sports_array(p.athlete_profile)) x
            where x = any(v_my_sports)
          ) / array_length(v_my_sports, 1)
        end
      )
      +
      -- availability overlap: exact match wins, "open_to_games" is broadly
      -- compatible, "busy" on either side kills it, unknown = small credit
      0.5 * (
        case
          when v_my_availability is null or p.athlete_profile->>'availability' is null then 0.3
          when p.athlete_profile->>'availability' = v_my_availability then 1.0
          when v_my_availability = 'busy' or p.athlete_profile->>'availability' = 'busy' then 0.0
          when v_my_availability = 'open_to_games' or p.athlete_profile->>'availability' = 'open_to_games' then 0.6
          else 0.3
        end
      )
    ) as final_score
  from public.profile_locations pl
  join public.profiles p on p.id = pl.profile_id
  join auth.users u on u.id = p.id
  where p.id <> v_uid
    and coalesce(p.discoverable_for_matching, false) = true
    and not coalesce(u.is_anonymous, false)
    and st_dwithin(
      pl.location_geography,
      v_origin,
      radius_km * 1000.0
    )
  order by final_score desc, distance_km asc
  limit limit_count;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_status_comments(p_status_id uuid)
 RETURNS TABLE(id uuid, created_at timestamp with time zone, status_id uuid, user_id uuid, body text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  select c.id, c.created_at, c.status_id, c.user_id, c.body
    from public.status_comments c
   where c.status_id = p_status_id
   order by c.created_at asc;
$function$;

CREATE OR REPLACE FUNCTION public.get_suggested_games(p_lat double precision, p_lng double precision, p_radius_km double precision DEFAULT 25, p_limit integer DEFAULT 20)
 RETURNS TABLE(id uuid, title text, sport text, spots_needed integer, starts_at timestamp with time zone, created_by uuid, created_at timestamp with time zone, status text, location_label text, description text, requirements jsonb, participant_count integer, substitute_count integer, spots_remaining integer, distance_km double precision, lat double precision, lng double precision, live_started_at timestamp with time zone, ended_at timestamp with time zone, visibility text, ends_at timestamp with time zone, duration_minutes integer, match_score double precision, sport_match boolean, host_sportsmanship double precision, host_name text, host_avatar_url text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid    uuid := auth.uid();
  v_origin geography := st_point(p_lng, p_lat)::geography;
  v_radius double precision := greatest(1.0, least(200.0, coalesce(p_radius_km, 25.0)));
  v_limit  int := greatest(1, least(100, coalesce(p_limit, 20)));
  v_gender text;
  v_primary   text[];
  v_secondary text[];
begin
  if v_uid is null then
    return;
  end if;

  select
    p.gender,
    coalesce(array(select distinct x from jsonb_array_elements_text(
      coalesce(nullif(p.athlete_profile->'primarySports', 'null'::jsonb), '[]'::jsonb)) x), array[]::text[]),
    coalesce(array(select distinct x from jsonb_array_elements_text(
      coalesce(nullif(p.athlete_profile->'secondarySports', 'null'::jsonb), '[]'::jsonb)) x), array[]::text[])
    into v_gender, v_primary, v_secondary
  from public.profiles p where p.id = v_uid;

  return query
  with candidates as (
    select
      g.*,
      coalesce(part.player_cnt, 0)::int as p_cnt,
      coalesce(part.sub_cnt, 0)::int    as s_cnt,
      (st_distance(g.location, v_origin) / 1000.0) as dist_km,
      host.sportsmanship_avg as host_trust,
      host.display_name      as host_nm,
      host.avatar_url        as host_av
    from public.games g
    left join lateral (
      select
        count(*) filter (where gp.role != 'substitute')::int as player_cnt,
        count(*) filter (where gp.role  = 'substitute')::int as sub_cnt
      from public.game_participants gp
      where gp.game_id = g.id
    ) part on true
    left join public.profiles host on host.id = g.created_by
    where st_dwithin(g.location, v_origin, v_radius * 1000.0)
      and g.status in ('open', 'full', 'live')
      and (g.status <> 'live'
        or (coalesce(g.live_started_at, g.updated_at, g.created_at) > now() - interval '24 hours'))
      and ((g.ends_at is not null and g.ends_at > now())
        or (g.ends_at is null and g.created_at > now() - interval '3 days'))
      and (g.live_started_at is null
        or g.live_started_at + make_interval(mins => coalesce(g.duration_minutes, 90)) > now())
      and public.can_view_game_for_gender(v_gender, host.gender, g.requirements->>'matchType')
      and coalesce(g.created_by, '00000000-0000-0000-0000-000000000000'::uuid) <> v_uid
      and not exists (
        select 1 from public.game_participants gp
         where gp.game_id = g.id and gp.user_id = v_uid
      )
  ),
  scored as (
    select
      c.*,
      (lower(btrim(c.sport)) = any(select lower(btrim(x)) from unnest(v_primary) x))   as is_primary,
      (lower(btrim(c.sport)) = any(select lower(btrim(x)) from unnest(v_secondary) x)) as is_secondary,
      case when c.starts_at is null then null::double precision
           else extract(epoch from (c.starts_at - now())) / 3600.0 end as hours_out
    from candidates c
  )
  select
    s.id, s.title, s.sport, s.spots_needed, s.starts_at, s.created_by, s.created_at,
    s.status, s.location_label, s.description, coalesce(s.requirements, '{}'::jsonb),
    s.p_cnt, s.s_cnt, greatest(s.spots_needed - s.p_cnt, 0)::int, s.dist_km,
    st_y(s.location::geometry), st_x(s.location::geometry),
    s.live_started_at, s.ended_at, s.visibility, s.ends_at, s.duration_minutes,
    (
        0.40 * (case when s.is_primary then 1.0 when s.is_secondary then 0.7 else 0.0 end)
      + 0.25 * (case
            when s.hours_out is null then 0.5
            when s.hours_out < 0 then 0.55
            when s.hours_out <= 1 then 0.8 + 0.2 * s.hours_out
            when s.hours_out <= 12 then greatest(0.15, 1.0 - (s.hours_out - 1) / 13.0)
            else greatest(0.05, 0.15 - (s.hours_out - 12) / 400.0) end)
      + 0.20 * greatest(0.0, 1.0 - (s.dist_km / nullif(v_radius, 0)))
      + 0.10 * (case
            when greatest(s.spots_needed - s.p_cnt, 0) = 0 then 0.15
            when s.spots_needed <= 0 then 0.5
            else 0.4 + 0.6 * (greatest(s.spots_needed - s.p_cnt, 0)::double precision / s.spots_needed) end)
      + 0.05 * ((coalesce(s.host_trust, 3.0) - 1.0) / 4.0)
    )::double precision as match_score,
    (s.is_primary or s.is_secondary) as sport_match,
    s.host_trust, s.host_nm, s.host_av
  from scored s
  order by match_score desc, s.dist_km asc
  limit v_limit;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_thread_read_receipts(p_kind text, p_thread_id uuid)
 RETURNS TABLE(user_id uuid, display_name text, avatar_url text, last_read_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select r.user_id, p.display_name, p.avatar_url, r.last_read_at
  from public.chat_reads r
  left join public.profiles p on p.id = r.user_id
  where r.thread_kind = p_kind
    and r.thread_id = p_thread_id
    and r.user_id is distinct from auth.uid()
    and (
      (p_kind = 'game' and public.viewer_is_game_participant(p_thread_id))
      or (p_kind = 'dm' and public.viewer_is_dm_thread_member(p_thread_id))
    )
  order by r.last_read_at desc
  limit 50;
$function$;

CREATE OR REPLACE FUNCTION public.get_unified_feed(p_lat double precision, p_lng double precision, p_map_radius_km double precision DEFAULT 120, p_limit integer DEFAULT 80)
 RETURNS TABLE(kind text, id text, created_at timestamp with time zone, lat double precision, lng double precision, title text, body text, sport text, visibility text, comment_count integer, created_by uuid, like_count integer, liked_by_me boolean, game jsonb)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  with cfg as (
    select
      coalesce(p_lat, 0.0) as qlat,
      coalesce(p_lng, 0.0) as qlng,
      greatest(1.0, least(300.0, coalesce(p_map_radius_km, 120.0))) as rkm,
      greatest(1, least(200, coalesce(p_limit, 80))) as lim
  ),
  viewer as (
    select p.gender from public.profiles p where p.id = auth.uid()
  ),
  note_likes as (
    select
      l.note_id,
      count(*)::int as cnt,
      bool_or(l.user_id = (select auth.uid())) as mine
      from public.map_note_likes l
     group by l.note_id
  ),
  note_comments as (
    select c.note_id, count(*)::int as cnt from public.map_note_comments c group by c.note_id
  ),
  status_likes_c as (
    select
      l.status_id,
      count(*)::int as cnt,
      bool_or(l.user_id = (select auth.uid())) as mine
      from public.status_likes l
     group by l.status_id
  ),
  status_comments_c as (
    select c.status_id, count(*)::int as cnt from public.status_comments c group by c.status_id
  ),
  game_likes_c as (
    select
      l.game_id,
      count(*)::int as cnt,
      bool_or(l.user_id = (select auth.uid())) as mine
      from public.game_likes l
     group by l.game_id
  ),
  game_comments_c as (
    select c.game_id, count(*)::int as cnt from public.game_comments c group by c.game_id
  ),
  notes as (
    select
      'note'::text as kind,
      n.id::text as id,
      n.created_at,
      n.lat,
      n.lng,
      null::text as title,
      n.body,
      null::text as sport,
      n.visibility,
      coalesce(nc.cnt, 0) as comment_count,
      n.created_by,
      coalesce(nl.cnt, 0) as like_count,
      coalesce(nl.mine, false) as liked_by_me,
      null::jsonb as game
    from public.map_notes n
    left join note_likes nl on nl.note_id = n.id
    left join note_comments nc on nc.note_id = n.id
    where public.haversine_km((select qlat from cfg), (select qlng from cfg), n.lat, n.lng) <= (select rkm from cfg)
  ),
  games as (
    select
      'game'::text as kind,
      g.id::text as id,
      g.created_at,
      g.lat,
      g.lng,
      g.title as title,
      g.description as body,
      g.sport,
      g.visibility::text as visibility,
      coalesce(gc.cnt, 0) as comment_count,
      g.created_by,
      coalesce(gl.cnt, 0) as like_count,
      coalesce(gl.mine, false) as liked_by_me,
      jsonb_build_object(
        'starts_at',         g.starts_at,
        'ends_at',           g.ends_at,
        'ended_at',          g.ended_at,
        'live_started_at',   g.live_started_at,
        'duration_minutes',  g.duration_minutes,
        'status',            g.status,
        'location_label',    g.location_label,
        'spots_needed',      g.spots_needed,
        'participant_count', coalesce(part.player_cnt, 0),
        'substitute_count',  coalesce(part.sub_cnt, 0),
        'spots_remaining',   greatest(g.spots_needed - coalesce(part.player_cnt, 0), 0),
        'distance_km',       public.haversine_km((select qlat from cfg), (select qlng from cfg), g.lat, g.lng),
        'requirements',      coalesce(g.requirements, '{}'::jsonb),
        'joined_by_me',      exists (
                               select 1 from public.game_participants gp
                                where gp.game_id = g.id and gp.user_id = (select auth.uid())
                             )
      ) as game
    from public.games g
    left join lateral (
      select
        count(*) filter (where gp.role != 'substitute')::int as player_cnt,
        count(*) filter (where gp.role  = 'substitute')::int as sub_cnt
      from public.game_participants gp
      where gp.game_id = g.id
    ) part on true
    left join public.profiles host on host.id = g.created_by
    left join game_likes_c gl on gl.game_id = g.id
    left join game_comments_c gc on gc.game_id = g.id
    where public.haversine_km((select qlat from cfg), (select qlng from cfg), g.lat, g.lng) <= (select rkm from cfg)
      and coalesce(g.status::text, '') not in ('completed','cancelled')
      and (g.ends_at is null or g.ends_at > now())
      and (g.ends_at is not null or g.created_at > now() - interval '3 days')
      and public.can_view_game_for_gender(
        (select gender from viewer),
        host.gender,
        g.requirements->>'matchType'
      )
  ),
  statuses as (
    select
      'status'::text as kind,
      s.id::text as id,
      s.created_at,
      null::double precision as lat,
      null::double precision as lng,
      null::text as title,
      s.body,
      null::text as sport,
      'public'::text as visibility,
      coalesce(sc.cnt, 0) as comment_count,
      s.user_id as created_by,
      coalesce(slc.cnt, 0) as like_count,
      coalesce(slc.mine, false) as liked_by_me,
      null::jsonb as game
    from public.get_recent_statuses(80) s
    left join status_likes_c slc on slc.status_id = s.id
    left join status_comments_c sc on sc.status_id = s.id
  )
  select *
    from (
      select * from notes
      union all
      select * from games
      union all
      select * from statuses
    ) u
   order by u.created_at desc
   limit (select lim from cfg);
$function$;

CREATE OR REPLACE FUNCTION public.get_venue_comments_with_likes(p_venue_id text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, created_at timestamp with time zone, venue_id text, user_id uuid, body text, like_count integer, liked_by_me boolean)
 LANGUAGE sql
 STABLE
AS $function$
  select
    c.id,
    c.created_at,
    c.venue_id,
    c.user_id,
    c.body,
    coalesce(l.cnt, 0) as like_count,
    exists (
      select 1
        from public.venue_comment_likes mine
       where mine.comment_id = c.id
         and mine.user_id = (select auth.uid())
    ) as liked_by_me
  from public.venue_comments c
  left join (
    select comment_id, count(*)::int as cnt
      from public.venue_comment_likes
     group by comment_id
  ) l on l.comment_id = c.id
  where c.venue_id = p_venue_id
  order by c.created_at desc
  limit greatest(1, least(200, coalesce(p_limit, 50)))
  offset greatest(0, coalesce(p_offset, 0));
$function$;

CREATE OR REPLACE FUNCTION public.get_venue_photos(p_venue_id text, p_limit integer DEFAULT 30)
 RETURNS TABLE(id uuid, created_at timestamp with time zone, venue_id text, user_id uuid, storage_path text, caption text, status text)
 LANGUAGE sql
 STABLE
AS $function$
  select p.id, p.created_at, p.venue_id, p.user_id, p.storage_path, p.caption, p.status
    from public.venue_photos p
   where p.venue_id = p_venue_id
     and (p.status = 'visible' or p.user_id = (select auth.uid()))
   order by p.created_at desc
   limit greatest(1, least(100, coalesce(p_limit, 30)));
$function$;

CREATE OR REPLACE FUNCTION public.get_venue_reviews(p_venue_id text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, created_at timestamp with time zone, updated_at timestamp with time zone, venue_id text, user_id uuid, rating smallint, body text, is_mine boolean, total_count integer, avg_rating numeric)
 LANGUAGE sql
 STABLE
AS $function$
  with stats as (
    select count(*)::int as total_count,
           round(avg(rating)::numeric, 2) as avg_rating
      from public.venue_reviews
     where venue_id = p_venue_id
  )
  select
    r.id, r.created_at, r.updated_at, r.venue_id, r.user_id, r.rating, r.body,
    (r.user_id = (select auth.uid())) as is_mine,
    s.total_count,
    s.avg_rating
  from public.venue_reviews r
  cross join stats s
  where r.venue_id = p_venue_id
  -- Your own review floats to the top so editing it is always one tap away.
  order by (r.user_id = (select auth.uid())) desc, r.created_at desc
  limit greatest(1, least(100, coalesce(p_limit, 20)))
  offset greatest(0, coalesce(p_offset, 0));
$function$;

CREATE OR REPLACE FUNCTION public.get_venues_in_bbox(p_min_lat double precision, p_min_lng double precision, p_max_lat double precision, p_max_lng double precision, p_limit integer DEFAULT 1000)
 RETURNS TABLE(id text, lat double precision, lng double precision, name text, sport text, leisure text, osm_type text, osm_id bigint, access text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with anchor as (
    select
      (p_min_lat + p_max_lat) / 2.0 as clat,
      (p_min_lng + p_max_lng) / 2.0 as clng
  )
  select
    v.id, v.lat, v.lng, v.name, v.sport, v.leisure, v.osm_type, v.osm_id, v.access
  from public.osm_sports_venues v, anchor a
  where v.lat between p_min_lat and p_max_lat
    and v.lng between p_min_lng and p_max_lng
    and coalesce(lower(btrim(v.access)) not in ('private', 'no'), true)
    and not coalesce(
      lower(btrim(v.leisure)) = 'swimming_pool'
      and btrim(coalesce(v.name, '')) = ''
      and (
        v.access is null
        or lower(btrim(v.access)) not in
             ('yes', 'public', 'permissive', 'customers', 'members', 'membership', 'permit')
      ),
      false
    )
  order by
    ((v.lng - a.clng) * cos(radians(a.clat))) ^ 2 + (v.lat - a.clat) ^ 2
  limit greatest(1, least(coalesce(p_limit, 1000), 5000));
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.haversine_km(p_lat1 double precision, p_lng1 double precision, p_lat2 double precision, p_lng2 double precision)
 RETURNS double precision
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  select 2 * 6371 * asin(
    sqrt(
      power(sin(radians((p_lat2 - p_lat1) / 2)), 2)
      + cos(radians(p_lat1)) * cos(radians(p_lat2))
      * power(sin(radians((p_lng2 - p_lng1) / 2)), 2)
    )
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_eligible_to_join_game(p_game_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_visibility text;
  v_host uuid;
  v_is_host_follow boolean;
  v_is_host_followed boolean;
  v_has_invite boolean;
begin
  select visibility, created_by into v_visibility, v_host
    from public.games where id = p_game_id;

  if v_visibility is null then
    return false;
  end if;

  -- Host always eligible.
  if v_host = p_user_id then
    return true;
  end if;

  if v_visibility = 'public' then
    return true;
  end if;

  if v_visibility = 'friends_only' then
    -- Mutuals: host follows user OR user follows host.
    select exists(select 1 from public.user_follows
                  where follower_id = v_host and followed_id = p_user_id)
      into v_is_host_follow;
    select exists(select 1 from public.user_follows
                  where follower_id = p_user_id and followed_id = v_host)
      into v_is_host_followed;

    if v_is_host_follow or v_is_host_followed then
      return true;
    end if;

    -- Approved chat invite from any joined player.
    select exists(select 1 from public.game_chat_invites
                  where game_id = p_game_id
                    and invitee_user_id = p_user_id
                    and status = 'approved')
      into v_has_invite;

    return coalesce(v_has_invite, false);
  end if;

  if v_visibility = 'invite_only' then
    -- Only approved invite (incl. host invites) lets people in.
    select exists(select 1 from public.game_chat_invites
                  where game_id = p_game_id
                    and invitee_user_id = p_user_id
                    and status = 'approved')
      into v_has_invite;
    return coalesce(v_has_invite, false);
  end if;

  return false;
end $function$;

CREATE OR REPLACE FUNCTION public.is_game_visible_on_map(p_game_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  select coalesce(
    (select status not in ('completed','cancelled')
       and (ends_at is null or ends_at > now())
       from public.games where id = p_game_id),
    false
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_squad(p_viewer uuid, p_owner uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select p_viewer is not null and exists (
    select 1 from public.user_follows uf
     where uf.status = 'accepted'
       and ((uf.follower_id = p_viewer and uf.followed_id = p_owner)
         or (uf.follower_id = p_owner  and uf.followed_id = p_viewer))
  );
$function$;

CREATE OR REPLACE FUNCTION public.join_game(p_game_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_current_user_id uuid;
  v_spots_needed     int;
  v_player_count     int;  -- counts only host + player rows (not substitutes)
  v_is_full          bool;
  v_role             text;
begin
  v_current_user_id := auth.uid();
  if v_current_user_id is null then
    return jsonb_build_object('success', false, 'error', 'Not authenticated');
  end if;

  -- Lock the game row so two concurrent joins can't both see "1 spot left"
  select g.spots_needed
  into   v_spots_needed
  from   public.games g
  where  g.id = p_game_id
  for update;

  if v_spots_needed is null then
    return jsonb_build_object('success', false, 'error', 'Game not found');
  end if;

  -- Only count real participants (host + player), not people on the waitlist
  select count(*)
  into   v_player_count
  from   public.game_participants gp
  where  gp.game_id = p_game_id
    and  gp.role    != 'substitute';

  v_is_full := v_player_count >= v_spots_needed;

  -- Already in the game (any role)?
  if exists (
    select 1
    from   public.game_participants gp
    where  gp.game_id = p_game_id
      and  gp.user_id = v_current_user_id
  ) then
    return jsonb_build_object('success', false, 'error', 'Already joined this game');
  end if;

  -- Full → join as substitute (waitlist)
  if v_is_full then
    v_role := 'substitute';
  else
    v_role := 'player';
  end if;

  insert into public.game_participants (game_id, user_id, role, joined_at)
  values (p_game_id, v_current_user_id, v_role, now());

  -- If this player just filled the last real spot, mark the game 'full'
  if v_role = 'player' and (v_player_count + 1) >= v_spots_needed then
    update public.games
    set    status     = 'full',
           updated_at = now()
    where  id         = p_game_id
      and  status     = 'open';
  end if;

  return jsonb_build_object(
    'success',              true,
    'role',                 v_role,
    'message',              case when v_role = 'substitute'
                              then 'Added to waitlist'
                              else 'Joined game successfully'
                            end,
    'spots_needed',         v_spots_needed,
    'current_participants', v_player_count + case when v_role = 'player' then 1 else 0 end
  );

exception when unique_violation then
  return jsonb_build_object('success', false, 'error', 'Already joined this game');
when others then
  return jsonb_build_object('success', false, 'error', SQLERRM);
end;
$function$;

CREATE OR REPLACE FUNCTION public.leave_game(p_game_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_current_user_id uuid;
  v_their_role      text;
  v_next_sub_id     uuid;
  v_game_status     text;
begin
  v_current_user_id := auth.uid();
  if v_current_user_id is null then
    return jsonb_build_object('success', false, 'error', 'Not authenticated');
  end if;

  -- What role does the caller have?
  select role
  into   v_their_role
  from   public.game_participants
  where  game_id = p_game_id
    and  user_id = v_current_user_id;

  if v_their_role is null then
    return jsonb_build_object('success', false, 'error', 'Not in this game');
  end if;

  if v_their_role = 'host' then
    return jsonb_build_object('success', false, 'error', 'Hosts cannot leave — delete the game instead');
  end if;

  -- Grab current game status before we delete anything
  select status into v_game_status
  from   public.games
  where  id = p_game_id
  for update;

  -- Remove the caller
  delete from public.game_participants
  where  game_id = p_game_id
    and  user_id = v_current_user_id;

  -- Only bother promoting / updating status if they were a real player
  if v_their_role = 'player' then
    -- Is there a substitute waiting?
    select user_id
    into   v_next_sub_id
    from   public.game_participants
    where  game_id = p_game_id
      and  role    = 'substitute'
    order  by joined_at asc
    limit  1;

    if v_next_sub_id is not null then
      -- Promote them — game spot count stays the same, status stays 'full'
      update public.game_participants
      set    role = 'player'
      where  game_id = p_game_id
        and  user_id = v_next_sub_id;
    else
      -- No substitute: a spot opened up
      if v_game_status = 'full' then
        update public.games
        set    status     = 'open',
               updated_at = now()
        where  id = p_game_id;
      end if;
    end if;
  end if;

  return jsonb_build_object('success', true, 'message', 'Left game');

exception when others then
  return jsonb_build_object('success', false, 'error', SQLERRM);
end;
$function$;

CREATE OR REPLACE FUNCTION public.maintain_game_participant_count()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE public.games SET participant_count = participant_count + 1 WHERE id = NEW.game_id;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE public.games SET participant_count = participant_count - 1 WHERE id = OLD.game_id;
  END IF;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.maintain_profile_endorsement_stats()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
    UPDATE public.profiles
    SET 
      sportsmanship_avg = (SELECT avg(rating)::double precision FROM public.athlete_endorsements WHERE athlete_id = NEW.athlete_id),
      endorsement_count = (SELECT count(*)::int FROM public.athlete_endorsements WHERE athlete_id = NEW.athlete_id)
    WHERE id = NEW.athlete_id;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE public.profiles
    SET 
      sportsmanship_avg = (SELECT avg(rating)::double precision FROM public.athlete_endorsements WHERE athlete_id = OLD.athlete_id),
      endorsement_count = (SELECT count(*)::int FROM public.athlete_endorsements WHERE athlete_id = OLD.athlete_id)
    WHERE id = OLD.athlete_id;
  END IF;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.map_note_visible_to(p_note_id uuid, p_viewer uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.map_notes n
    where n.id = p_note_id
      and (
        n.visibility = 'public'
        or (p_viewer is not null and n.created_by = p_viewer)
        or (n.visibility = 'friends' and p_viewer is not null and (
              exists (select 1 from public.user_follows f
                       where f.follower_id = p_viewer and f.followed_id = n.created_by)
           or exists (select 1 from public.user_follows f
                       where f.follower_id = n.created_by and f.followed_id = p_viewer)))
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.mark_ended_games_completed()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_n int;
begin
  with upd as (
    update public.games
       set status = 'completed',
           ended_at = coalesce(ended_at, now())
     where ends_at is not null
       and ends_at <= now()
       and status in ('open','full','live')
     returning id
  )
  select count(*) from upd into v_n;
  return v_n;
end $function$;

CREATE OR REPLACE FUNCTION public.mark_thread_read(p_kind text, p_thread_id uuid, p_at timestamp with time zone DEFAULT now())
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_at  timestamptz;
  v_out timestamptz;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if p_kind not in ('game','dm','note') then
    raise exception 'Unknown thread kind: %', p_kind using errcode = '22023';
  end if;

  v_at := least(coalesce(p_at, now()), now());

  if p_kind = 'game' and not public.viewer_is_game_participant(p_thread_id) then
    raise exception 'Not a participant in this game' using errcode = '42501';
  elsif p_kind = 'dm' and not public.viewer_is_dm_thread_member(p_thread_id) then
    raise exception 'Not a member of this thread' using errcode = '42501';
  elsif p_kind = 'note'
        and not exists (select 1 from public.map_notes n where n.id = p_thread_id) then
    raise exception 'No such note' using errcode = '42501';
  end if;

  insert into public.chat_reads (thread_kind, thread_id, user_id, last_read_at)
  values (p_kind, p_thread_id, v_uid, v_at)
  on conflict (thread_kind, thread_id, user_id) do update
    set last_read_at = excluded.last_read_at
    where chat_reads.last_read_at < excluded.last_read_at;

  select last_read_at into v_out
    from public.chat_reads
   where thread_kind = p_kind and thread_id = p_thread_id and user_id = v_uid;
  return v_out;
end;
$function$;

CREATE OR REPLACE FUNCTION public.prune_push_token(p_token text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  delete from public.user_push_tokens where token = p_token;
$function$;

CREATE OR REPLACE FUNCTION public.record_push_sent(p_rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_count int;
begin
  insert into public.push_notifications_sent (user_id, game_id)
  select (r->>'user_id')::uuid, (r->>'game_id')::uuid
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r
  on conflict (user_id, game_id) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

CREATE OR REPLACE FUNCTION public.redeem_invite_token(p_token uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_game_id uuid;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;

  select id into v_game_id from public.games where invite_token = p_token;
  if v_game_id is null then
    raise exception 'invalid_token' using errcode = 'P0002';
  end if;

  -- Ensure an "approved" invite row exists for this user so the visibility
  -- trigger lets them join the game.
  insert into public.game_chat_invites
    (game_id, invitee_user_id, invited_by_user_id, status, responded_at)
  values
    (v_game_id, v_uid, v_uid, 'approved', now())
  on conflict (game_id, invitee_user_id) do update
    set status = 'approved',
        responded_at = now();

  return v_game_id;
end $function$;

CREATE OR REPLACE FUNCTION public.report_game_outcome(p_game_id uuid, p_outcome text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if p_outcome not in ('played', 'no_show', 'missed_it') then
    raise exception 'invalid_outcome' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.game_participants gp
     where gp.game_id = p_game_id and gp.user_id = v_uid
  ) then
    raise exception 'not_a_participant' using errcode = '42501';
  end if;

  insert into public.game_outcome_reports (game_id, user_id, outcome)
  values (p_game_id, v_uid, p_outcome)
  on conflict (game_id, user_id) do update
    set outcome = excluded.outcome, updated_at = now();

  update public.game_participants
     set confirmed_result = (p_outcome = 'played')
   where game_id = p_game_id and user_id = v_uid;
end $function$;

CREATE OR REPLACE FUNCTION public.report_venue_photo(p_photo_id uuid, p_reason text DEFAULT 'other'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid    uuid := (select auth.uid());
  v_reason text := coalesce(nullif(trim(coalesce(p_reason, '')), ''), 'other');
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if v_reason not in ('not_this_place', 'offensive', 'spam', 'private', 'other') then
    v_reason := 'other';
  end if;

  -- Idempotent: re-reporting is a no-op, so the trigger cannot be farmed.
  insert into public.venue_photo_reports (photo_id, user_id, reason)
  values (p_photo_id, v_uid, v_reason)
  on conflict (photo_id, user_id) do nothing;
end $function$;

CREATE OR REPLACE FUNCTION public.request_chat_invite(p_game_id uuid, p_invitee_user_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_host uuid;
  v_is_player boolean;
  v_invite_id uuid;
  v_visibility text;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;

  select created_by, visibility into v_host, v_visibility
    from public.games where id = p_game_id;
  if v_host is null then
    raise exception 'game_not_found' using errcode = 'P0002';
  end if;

  -- Caller must be host OR a current participant in the game.
  select exists(select 1 from public.game_participants
                 where game_id = p_game_id and user_id = v_uid)
    into v_is_player;
  if not v_is_player then
    raise exception 'not_a_participant' using errcode = '42501';
  end if;

  insert into public.game_chat_invites
    (game_id, invitee_user_id, invited_by_user_id, status)
  values
    (p_game_id, p_invitee_user_id, v_uid,
     case when v_uid = v_host then 'approved' else 'pending' end)
  on conflict (game_id, invitee_user_id) do update
    set status       = case when v_uid = v_host then 'approved' else excluded.status end,
        responded_at = case when v_uid = v_host then now()      else game_chat_invites.responded_at end
    returning id into v_invite_id;

  return v_invite_id;
end $function$;

CREATE OR REPLACE FUNCTION public.request_follow(p_target uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_private boolean;
  v_status text;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if v_uid = p_target then raise exception 'cannot_follow_self' using errcode = '22023'; end if;
  select coalesce((athlete_profile->>'is_private')::boolean, false) into v_private
    from public.profiles where id = p_target;
  v_status := case when coalesce(v_private, false) then 'pending' else 'accepted' end;
  insert into public.user_follows (follower_id, followed_id, status)
  values (v_uid, p_target, v_status)
  on conflict (follower_id, followed_id)
    do update set status = excluded.status
    where public.user_follows.status = 'pending';
  return v_status;
end $function$;

CREATE OR REPLACE FUNCTION public.respond_chat_invite(p_invite_id uuid, p_action text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_game_id uuid;
  v_host uuid;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if p_action not in ('approve','deny','revoke') then
    raise exception 'invalid_action' using errcode = '22023';
  end if;

  select i.game_id, g.created_by
    into v_game_id, v_host
    from public.game_chat_invites i
    join public.games g on g.id = i.game_id
   where i.id = p_invite_id;
  if v_game_id is null then
    raise exception 'invite_not_found' using errcode = 'P0002';
  end if;
  if v_host <> v_uid then
    raise exception 'host_only' using errcode = '42501';
  end if;

  update public.game_chat_invites
     set status = case p_action
                    when 'approve' then 'approved'
                    when 'deny'    then 'denied'
                    when 'revoke'  then 'revoked'
                  end,
         responded_at = now()
   where id = p_invite_id;

  return true;
end $function$;

CREATE OR REPLACE FUNCTION public.respond_follow_request(p_follower uuid, p_accept boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if p_accept then
    update public.user_follows set status = 'accepted'
     where follower_id = p_follower and followed_id = v_uid and status = 'pending';
  else
    delete from public.user_follows
     where follower_id = p_follower and followed_id = v_uid and status = 'pending';
  end if;
end $function$;

CREATE OR REPLACE FUNCTION public.save_push_token(p_token text, p_platform text DEFAULT 'ios'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if p_token is null or length(trim(p_token)) = 0 then
    raise exception 'empty_token' using errcode = '22023';
  end if;

  insert into public.user_push_tokens (token, user_id, platform)
  values (
    trim(p_token),
    v_uid,
    case when p_platform in ('ios', 'android', 'web') then p_platform else 'ios' end
  )
  on conflict (token) do update
    set user_id      = excluded.user_id,
        platform     = excluded.platform,
        last_seen_at = now();
end;
$function$;

CREATE OR REPLACE FUNCTION public.search_profiles(q text, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, radius_km double precision DEFAULT 80, limit_n integer DEFAULT 15, p_exclude uuid DEFAULT NULL::uuid)
 RETURNS TABLE(profile_id uuid, display_name text, avatar_url text, handle text, city text, favorite_sport text, distance_km double precision, rank_score double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with qn as (
    select nullif(trim(lower(coalesce(q, ''))), '') as n
  ),
  ref as (
    select case
      when p_lat is not null and p_lng is not null
      then st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography
      else null::geography
    end as g
  ),
  base as (
    select
      p.id as pid,
      p.display_name as dname,
      p.avatar_url as aurl,
      nullif(trim(both '@' from trim(coalesce(p.athlete_profile->>'handle', ''))), '') as h,
      nullif(trim(coalesce(p.athlete_profile->>'city', '')), '') as c,
      nullif(trim(coalesce(p.athlete_profile->>'favoriteSport', '')), '') as fs,
      p.display_name_search as dns,
      p.handle_search as hs,
      case
        when r.g is not null and pl.profile_id is not null
        then (
          st_distance(
            st_setsrid(st_makepoint(pl.lng, pl.lat), 4326)::geography,
            r.g
          ) / 1000.0
        )
        else null::double precision
      end as dist_km
    from public.profiles p
    join auth.users u on u.id = p.id
    cross join qn
    cross join ref r
    left join public.profile_locations pl on pl.profile_id = p.id
    where (p_exclude is null or p.id <> p_exclude)
      and not coalesce(u.is_anonymous, false)
      and (
        u.email_confirmed_at is not null
        or u.phone_confirmed_at is not null
        or coalesce((p.athlete_profile->>'verified')::boolean, false) = true
      )
      and qn.n is not null
      and length(qn.n) >= 2
      and (
        p.display_name_search % qn.n
        or (length(p.handle_search) > 0 and p.handle_search % qn.n)
        or p.display_name_search like qn.n || '%'
        or (length(p.handle_search) > 0 and p.handle_search like qn.n || '%')
        or p.display_name_search like '%' || qn.n || '%'
        or (length(p.handle_search) > 0 and p.handle_search like '%' || qn.n || '%')
      )
      and (
        r.g is null
        or pl.profile_id is null
        or st_dwithin(
          st_setsrid(st_makepoint(pl.lng, pl.lat), 4326)::geography,
          r.g,
          radius_km * 1000.0
        )
      )
  ),
  scored as (
    select
      b.*,
      greatest(
        case when b.dns = qn.n then 1.0::double precision else 0.0 end,
        case when length(b.hs) > 0 and b.hs = qn.n then 1.0::double precision else 0.0 end,
        similarity(b.dns, qn.n),
        case when length(b.hs) > 0 then similarity(b.hs, qn.n) else 0.0::double precision end
      ) as rnk,
      case
        when r.g is not null and b.dist_km is not null and b.dist_km <= 25 then 0.08::double precision
        when r.g is not null and b.dist_km is not null and b.dist_km <= 80 then 0.04::double precision
        else 0::double precision
      end as near_boost
    from base b
    cross join qn
    cross join ref r
  )
  select
    s.pid as profile_id,
    s.dname as display_name,
    s.aurl as avatar_url,
    s.h as handle,
    s.c as city,
    s.fs as favorite_sport,
    s.dist_km as distance_km,
    (s.rnk + s.near_boost)::double precision as rank_score
  from scored s
  order by rank_score desc, distance_km asc nulls last
  limit least(coalesce(nullif(limit_n, 0), 15), 25);
$function$;

CREATE OR REPLACE FUNCTION public.spatial_ref_sys_read_only()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if current_user in ('anon', 'authenticated') then
    raise exception 'spatial_ref_sys is read-only' using errcode = '42501';
  end if;
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.start_game(p_game_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_host uuid;
  v_status text;
begin
  select created_by, status into v_host, v_status
  from public.games
  where id = p_game_id;

  if v_host is null then
    raise exception 'Game not found';
  end if;
  if auth.uid() is null or auth.uid() <> v_host then
    raise exception 'Only the host can start the game';
  end if;
  if v_status in ('completed', 'cancelled') then
    raise exception 'Game already ended';
  end if;

  update public.games
    set status          = 'live',
        live_started_at = coalesce(live_started_at, now()),
        -- Never push a start time forward: a game already under way keeps its
        -- original start, an early start snaps back to now.
        starts_at       = least(coalesce(starts_at, now()), now()),
        ends_at         = now() + make_interval(mins => coalesce(duration_minutes, 90)),
        updated_at      = now()
  where id = p_game_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.toggle_game_comment_like(p_comment_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_n   int;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  delete from public.game_comment_likes
   where comment_id = p_comment_id and user_id = v_uid;
  get diagnostics v_n = row_count;
  if v_n > 0 then return false; end if;
  insert into public.game_comment_likes (comment_id, user_id)
  values (p_comment_id, v_uid)
  on conflict do nothing;
  return true;
end $function$;

CREATE OR REPLACE FUNCTION public.toggle_game_like(p_game_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_n   int;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  delete from public.game_likes where game_id = p_game_id and user_id = v_uid;
  get diagnostics v_n = row_count;
  if v_n > 0 then return false; end if;
  insert into public.game_likes (game_id, user_id)
  values (p_game_id, v_uid)
  on conflict do nothing;
  return true;
end $function$;

CREATE OR REPLACE FUNCTION public.toggle_saved_venue(p_venue_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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

CREATE OR REPLACE FUNCTION public.toggle_venue_comment_like(p_comment_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_n   int;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;

  delete from public.venue_comment_likes
   where comment_id = p_comment_id and user_id = v_uid;
  get diagnostics v_n = row_count;
  if v_n > 0 then
    return false;  -- was liked, now unliked
  end if;

  insert into public.venue_comment_likes (comment_id, user_id)
  values (p_comment_id, v_uid)
  on conflict do nothing;
  return true;
end $function$;

CREATE OR REPLACE FUNCTION public.trg_notify_game_invite()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_lat double precision;
  v_lng double precision;
  v_near boolean := true;
  v_has_geo boolean;
begin
  if NEW.status is distinct from 'pending' then
    return NEW;
  end if;
  select g.lat, g.lng into v_lat, v_lng
    from public.games g
   where g.id = NEW.game_id;
  select exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'profiles' and c.column_name = 'lat'
  ) and exists (
    select 1 from information_schema.columns c2
    where c2.table_schema = 'public' and c2.table_name = 'profiles' and c2.column_name = 'lng'
  ) into v_has_geo;

  if v_has_geo and v_lat is not null and v_lng is not null then
    select public.haversine_km(p.lat, p.lng, v_lat, v_lng) <= 50.0
      into v_near
      from public.profiles p
     where p.id = NEW.invitee_user_id;
    if not found then
      v_near := true;
    end if;
  end if;

  perform public.enqueue_notification(
    NEW.invitee_user_id,
    'game_invite',
    jsonb_build_object(
      'game_id', NEW.game_id,
      'invited_by', NEW.invited_by_user_id,
      'near_game', v_near
    )
  );
  return NEW;
end $function$;

CREATE OR REPLACE FUNCTION public.trg_notify_nearby_on_game()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if NEW.lat is null or NEW.lng is null or NEW.created_by is null then
    return NEW;
  end if;
  -- Best-effort: only if profiles expose lat/lng (optional columns).
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'lat'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'lng'
  ) then
    insert into public.notifications (user_id, type, payload)
    select p.id,
           'game_nearby',
           jsonb_build_object(
             'game_id', NEW.id,
             'title', NEW.title,
             'sport', NEW.sport,
             'lat', NEW.lat,
             'lng', NEW.lng,
             'created_by', NEW.created_by
           )
      from public.profiles p
     where p.id is distinct from NEW.created_by
       and p.lat is not null
       and p.lng is not null
       and public.haversine_km(p.lat, p.lng, NEW.lat, NEW.lng) <= 25.0;
  end if;
  return NEW;
end $function$;

CREATE OR REPLACE FUNCTION public.trg_notify_nearby_on_map_note()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if NEW.visibility <> 'public' then
    return NEW;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'lat'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'lng'
  ) then
    insert into public.notifications (user_id, type, payload)
    select p.id,
           'map_note_nearby',
           jsonb_build_object(
             'note_id', NEW.id,
             'lat', NEW.lat,
             'lng', NEW.lng,
             'created_by', NEW.created_by
           )
      from public.profiles p
     where p.id is distinct from NEW.created_by
       and p.lat is not null
       and p.lng is not null
       and public.haversine_km(p.lat, p.lng, NEW.lat, NEW.lng) <= 25.0;
  end if;
  return NEW;
end $function$;

CREATE OR REPLACE FUNCTION public.trg_notify_note_comment_liked()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_author uuid;
  v_note   uuid;
begin
  select c.user_id, c.note_id into v_author, v_note
    from public.map_note_comments c
   where c.id = NEW.comment_id;

  -- Skip self-likes and missing parent comments.
  if v_author is null or v_author = NEW.user_id then
    return NEW;
  end if;

  insert into public.notifications (user_id, type, payload)
  values (
    v_author,
    'note_comment_liked',
    jsonb_build_object(
      'note_id', v_note,
      'comment_id', NEW.comment_id,
      'actor_id', NEW.user_id
    )
  );

  return NEW;
end $function$;

CREATE OR REPLACE FUNCTION public.trg_notify_note_thread_participants()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.notifications (user_id, type, payload)
  select distinct x.uid,
         'note_new_activity',
         jsonb_build_object(
           'note_id', NEW.note_id,
           'comment_id', NEW.id,
           'actor_id', NEW.user_id
         )
    from (
      select n.created_by as uid
        from public.map_notes n
       where n.id = NEW.note_id
      union
      select c.user_id as uid
        from public.map_note_comments c
       where c.note_id = NEW.note_id
         and c.id is distinct from NEW.id
    ) x
   where x.uid is not null
     and x.uid is distinct from NEW.user_id;
  return NEW;
end $function$;

CREATE OR REPLACE FUNCTION public.trg_notify_on_follow()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.enqueue_notification(
    NEW.followed_id,
    'new_follower',
    jsonb_build_object('follower_id', NEW.follower_id)
  );
  return NEW;
end $function$;

CREATE OR REPLACE FUNCTION public.trg_venue_photo_report_applied()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.venue_photos
     set report_count = report_count + 1,
         status = case
                    when status = 'visible' and report_count + 1 >= 3 then 'hidden'
                    else status
                  end
   where id = NEW.photo_id;
  return NEW;
end $function$;

CREATE OR REPLACE FUNCTION public.unarchive_game_chat(p_game_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user uuid;
  v_rows int;
begin
  v_user := auth.uid();
  if v_user is null then
    return jsonb_build_object('success', false, 'error', 'Not authenticated');
  end if;

  update public.game_participants
     set chat_hidden_at = null
   where game_id = p_game_id
     and user_id = v_user;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return jsonb_build_object('success', false, 'error', 'Not in this game');
  end if;

  return jsonb_build_object('success', true, 'message', 'Chat restored');

exception when others then
  return jsonb_build_object('success', false, 'error', SQLERRM);
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_my_location(p_lat double precision, p_lng double precision)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Ensure profile exists
  INSERT INTO public.profiles (id, display_name)
  VALUES (auth.uid(), 'Player')
  ON CONFLICT (id) DO NOTHING;
  
  INSERT INTO public.profile_locations (profile_id, lat, lng, location_geography, updated_at)
  VALUES (auth.uid(), p_lat, p_lng, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography, now())
  ON CONFLICT (profile_id) DO UPDATE SET 
    lat = p_lat, 
    lng = p_lng, 
    location_geography = ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
    updated_at = now();
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_my_presence(p_lat double precision, p_lng double precision, p_mode text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if p_mode not in ('ghost','close_friends','public') then
    raise exception 'invalid_visibility' using errcode = '22023';
  end if;

  insert into public.profiles (id, display_name)
  values (v_uid, 'Player')
  on conflict (id) do nothing;

  insert into public.profile_locations
    (profile_id, lat, lng, location_geography, location_visibility, updated_at)
  values
    (v_uid, p_lat, p_lng,
     st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
     p_mode, now())
  on conflict (profile_id) do update set
    lat = excluded.lat,
    lng = excluded.lng,
    location_geography = excluded.location_geography,
    location_visibility = excluded.location_visibility,
    updated_at = now();
end;
$function$;

CREATE OR REPLACE FUNCTION public.upsert_my_status(p_body text)
 RETURNS user_statuses
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_row public.user_statuses;
  v_body text := trim(coalesce(p_body, ''));
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if v_body = '' then
    raise exception 'empty_body' using errcode = '22023';
  end if;
  if length(v_body) > 2000 then
    v_body := left(v_body, 2000);
  end if;

  insert into public.user_statuses (user_id, body, expires_at)
  values (v_uid, v_body, now() + interval '48 hours')
  returning * into v_row;

  return v_row;
end $function$;

CREATE OR REPLACE FUNCTION public.upsert_venue_review(p_venue_id text, p_rating integer, p_body text DEFAULT NULL::text, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_name text DEFAULT NULL::text, p_sport text DEFAULT NULL::text, p_leisure text DEFAULT NULL::text)
 RETURNS venue_reviews
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid  uuid := (select auth.uid());
  v_row  public.venue_reviews;
  v_body text := trim(coalesce(p_body, ''));
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'invalid_rating' using errcode = '22023';
  end if;
  if length(v_body) > 2000 then
    v_body := left(v_body, 2000);
  end if;

  perform public.ensure_venue_row(p_venue_id, p_lat, p_lng, p_name, p_sport, p_leisure);

  insert into public.venue_reviews (venue_id, user_id, rating, body)
  values (p_venue_id, v_uid, p_rating::smallint, nullif(v_body, ''))
  on conflict (venue_id, user_id) do update
    set rating     = excluded.rating,
        body       = excluded.body,
        updated_at = now()
  returning * into v_row;

  return v_row;
end $function$;

CREATE OR REPLACE FUNCTION public.viewer_is_dm_thread_member(p_thread_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.dm_thread_members m
    where m.thread_id = p_thread_id and m.user_id = auth.uid()
  );
$function$;

CREATE OR REPLACE FUNCTION public.viewer_is_game_participant(p_game_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
      from public.game_participants gp
     where gp.game_id = p_game_id
       and gp.user_id = (select auth.uid())
  );
$function$;

CREATE OR REPLACE FUNCTION public.vote_rematch_poll(p_poll_id uuid, p_choice text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if (select auth.uid()) is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if p_choice not in ('in', 'out') then
    raise exception 'invalid_choice' using errcode = '22023';
  end if;

  insert into public.game_poll_votes (poll_id, user_id, choice)
  values (p_poll_id, (select auth.uid()), p_choice)
  on conflict (poll_id, user_id) do update
    set choice = excluded.choice, updated_at = now();
end $function$;

-- ======================================================================
-- Triggers
-- ======================================================================

CREATE TRIGGER tr_maintain_profile_endorsement_stats AFTER INSERT OR DELETE OR UPDATE ON public.athlete_endorsements FOR EACH ROW EXECUTE FUNCTION maintain_profile_endorsement_stats();

CREATE TRIGGER dm_messages_touch_read AFTER INSERT ON public.dm_messages FOR EACH ROW EXECUTE FUNCTION chat_reads_touch_sender();

CREATE TRIGGER game_chat_invites_notify AFTER INSERT ON public.game_chat_invites FOR EACH ROW EXECUTE FUNCTION trg_notify_game_invite();

CREATE TRIGGER game_messages_touch_read AFTER INSERT ON public.game_messages FOR EACH ROW EXECUTE FUNCTION chat_reads_touch_sender();

CREATE TRIGGER tr_maintain_game_participant_count AFTER INSERT OR DELETE ON public.game_participants FOR EACH ROW EXECUTE FUNCTION maintain_game_participant_count();

CREATE TRIGGER trg_game_participants_visibility BEFORE INSERT ON public.game_participants FOR EACH ROW EXECUTE FUNCTION enforce_game_participants_visibility();

CREATE TRIGGER fun_games_sync_lat_lng BEFORE INSERT OR UPDATE OF location ON public.games FOR EACH ROW EXECUTE FUNCTION fun_games_sync_lat_lng();

CREATE TRIGGER games_notify_nearby_insert AFTER INSERT ON public.games FOR EACH ROW EXECUTE FUNCTION trg_notify_nearby_on_game();

CREATE TRIGGER trg_games_set_ends_at BEFORE INSERT OR UPDATE OF starts_at, duration_minutes ON public.games FOR EACH ROW EXECUTE FUNCTION games_set_ends_at();

CREATE TRIGGER map_note_comment_likes_notify AFTER INSERT ON public.map_note_comment_likes FOR EACH ROW EXECUTE FUNCTION trg_notify_note_comment_liked();

CREATE TRIGGER map_note_comments_notify_thread AFTER INSERT ON public.map_note_comments FOR EACH ROW EXECUTE FUNCTION trg_notify_note_thread_participants();

CREATE TRIGGER map_note_comments_touch_read AFTER INSERT ON public.map_note_comments FOR EACH ROW EXECUTE FUNCTION chat_reads_touch_sender();

CREATE TRIGGER map_notes_notify_nearby_insert AFTER INSERT ON public.map_notes FOR EACH ROW EXECUTE FUNCTION trg_notify_nearby_on_map_note();

CREATE TRIGGER spatial_ref_sys_read_only BEFORE INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.spatial_ref_sys FOR EACH STATEMENT EXECUTE FUNCTION spatial_ref_sys_read_only();

CREATE TRIGGER user_follows_notify_followed AFTER INSERT ON public.user_follows FOR EACH ROW EXECUTE FUNCTION trg_notify_on_follow();

CREATE TRIGGER venue_photo_reports_apply AFTER INSERT ON public.venue_photo_reports FOR EACH ROW EXECUTE FUNCTION trg_venue_photo_report_applied();

-- ======================================================================
-- Row Level Security
-- ======================================================================

alter table public.app_flags enable row level security;

alter table public.athlete_endorsements enable row level security;

alter table public.badges enable row level security;

alter table public.chat_reads enable row level security;

alter table public.dm_messages enable row level security;

alter table public.dm_thread_members enable row level security;

alter table public.dm_threads enable row level security;

alter table public.feed_media_post_comments enable row level security;

alter table public.feed_media_post_likes enable row level security;

alter table public.feed_media_posts enable row level security;

alter table public.game_chat_invites enable row level security;

alter table public.game_comment_likes enable row level security;

alter table public.game_comments enable row level security;

alter table public.game_likes enable row level security;

alter table public.game_messages enable row level security;

alter table public.game_outcome_reports enable row level security;

alter table public.game_participants enable row level security;

alter table public.game_poll_votes enable row level security;

alter table public.game_polls enable row level security;

alter table public.game_results enable row level security;

alter table public.games enable row level security;

alter table public.legal_acceptances enable row level security;

alter table public.legal_documents enable row level security;

alter table public.map_note_comment_likes enable row level security;

alter table public.map_note_comments enable row level security;

alter table public.map_note_likes enable row level security;

alter table public.map_notes enable row level security;

alter table public.min_age_by_country enable row level security;

alter table public.notifications enable row level security;

alter table public.osm_sports_venues enable row level security;

alter table public.profile_locations enable row level security;

alter table public.profile_private enable row level security;

alter table public.profiles enable row level security;

alter table public.push_notifications_sent enable row level security;

alter table public.saved_venues enable row level security;

alter table public.status_comments enable row level security;

alter table public.status_likes enable row level security;

alter table public.status_updates enable row level security;

alter table public.user_badges enable row level security;

alter table public.user_follows enable row level security;

alter table public.user_push_tokens enable row level security;

alter table public.user_stats enable row level security;

alter table public.user_statuses enable row level security;

alter table public.venue_comment_likes enable row level security;

alter table public.venue_comments enable row level security;

alter table public.venue_coverage enable row level security;

alter table public.venue_photo_reports enable row level security;

alter table public.venue_photos enable row level security;

alter table public.venue_reviews enable row level security;

-- ======================================================================
-- Policies
-- ======================================================================

create policy "athlete_endorsements: read own or shared game" on public.athlete_endorsements as PERMISSIVE for SELECT to authenticated using (((endorser_id = ( SELECT auth.uid() AS uid)) OR (athlete_id = ( SELECT auth.uid() AS uid)) OR viewer_is_game_participant(game_id)));

create policy athlete_endorsements_insert_games_only on public.athlete_endorsements as PERMISSIVE for INSERT to authenticated with check (((( SELECT auth.uid() AS uid) = endorser_id) AND (EXISTS ( SELECT 1
   FROM ((games g
     JOIN game_participants me ON (((me.game_id = g.id) AND (me.user_id = ( SELECT auth.uid() AS uid)))))
     JOIN game_participants them ON (((them.game_id = g.id) AND (them.user_id = athlete_endorsements.athlete_id))))
  WHERE ((g.id = athlete_endorsements.game_id) AND (g.status = 'completed'::text))))));

create policy athlete_endorsements_update_owner on public.athlete_endorsements as PERMISSIVE for UPDATE to authenticated using ((( SELECT auth.uid() AS uid) = endorser_id)) with check (((( SELECT auth.uid() AS uid) = endorser_id) AND (EXISTS ( SELECT 1
   FROM ((games g
     JOIN game_participants me ON (((me.game_id = g.id) AND (me.user_id = ( SELECT auth.uid() AS uid)))))
     JOIN game_participants them ON (((them.game_id = g.id) AND (them.user_id = athlete_endorsements.athlete_id))))
  WHERE ((g.id = athlete_endorsements.game_id) AND (g.status = 'completed'::text))))));

create policy "Badges readable by everyone" on public.badges as PERMISSIVE for SELECT to public using (true);

create policy "chat_reads: read own" on public.chat_reads as PERMISSIVE for SELECT to authenticated using ((user_id = auth.uid()));

create policy "chat_reads: read your dm thread" on public.chat_reads as PERMISSIVE for SELECT to authenticated using (((thread_kind = 'dm'::text) AND viewer_is_dm_thread_member(thread_id)));

create policy "chat_reads: read your game thread" on public.chat_reads as PERMISSIVE for SELECT to authenticated using (((thread_kind = 'game'::text) AND viewer_is_game_participant(thread_id)));

create policy "chat_reads: update own" on public.chat_reads as PERMISSIVE for UPDATE to authenticated using ((user_id = auth.uid())) with check ((user_id = auth.uid()));

create policy "chat_reads: write own" on public.chat_reads as PERMISSIVE for INSERT to authenticated with check ((user_id = auth.uid()));

create policy dm_messages_insert_members on public.dm_messages as PERMISSIVE for INSERT to authenticated with check (((( SELECT auth.uid() AS uid) = user_id) AND (EXISTS ( SELECT 1
   FROM dm_thread_members m
  WHERE ((m.thread_id = dm_messages.thread_id) AND (m.user_id = ( SELECT auth.uid() AS uid)))))));

create policy dm_messages_select_members on public.dm_messages as PERMISSIVE for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM dm_thread_members m
  WHERE ((m.thread_id = dm_messages.thread_id) AND (m.user_id = ( SELECT auth.uid() AS uid))))));

create policy dm_thread_members_insert_self on public.dm_thread_members as PERMISSIVE for INSERT to authenticated with check ((( SELECT auth.uid() AS uid) = user_id));

create policy dm_thread_members_select_self on public.dm_thread_members as PERMISSIVE for SELECT to authenticated using ((( SELECT auth.uid() AS uid) = user_id));

create policy dm_threads_select_members on public.dm_threads as PERMISSIVE for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM dm_thread_members m
  WHERE ((m.thread_id = dm_threads.id) AND (m.user_id = ( SELECT auth.uid() AS uid))))));

create policy "post_comments: delete own" on public.feed_media_post_comments as PERMISSIVE for DELETE to authenticated using ((( SELECT auth.uid() AS uid) = user_id));

create policy "post_comments: insert own" on public.feed_media_post_comments as PERMISSIVE for INSERT to authenticated with check ((( SELECT auth.uid() AS uid) = user_id));

create policy "post_comments: read" on public.feed_media_post_comments as PERMISSIVE for SELECT to authenticated using (true);

create policy "post_likes: delete own" on public.feed_media_post_likes as PERMISSIVE for DELETE to authenticated using ((( SELECT auth.uid() AS uid) = user_id));

create policy "post_likes: insert own" on public.feed_media_post_likes as PERMISSIVE for INSERT to authenticated with check ((( SELECT auth.uid() AS uid) = user_id));

create policy "post_likes: read" on public.feed_media_post_likes as PERMISSIVE for SELECT to authenticated using (true);

create policy "feed_media_posts: delete own" on public.feed_media_posts as PERMISSIVE for DELETE to authenticated using ((( SELECT auth.uid() AS uid) = user_id));

create policy "feed_media_posts: insert own" on public.feed_media_posts as PERMISSIVE for INSERT to authenticated with check ((( SELECT auth.uid() AS uid) = user_id));

create policy "feed_media_posts: visible" on public.feed_media_posts as PERMISSIVE for SELECT to authenticated using (((user_id = ( SELECT auth.uid() AS uid)) OR ((visibility = 'public'::text) AND (NOT COALESCE(( SELECT ((p.athlete_profile ->> 'is_private'::text))::boolean AS bool
   FROM profiles p
  WHERE (p.id = feed_media_posts.user_id)), false))) OR ((visibility = ANY (ARRAY['public'::text, 'squad'::text])) AND is_squad(( SELECT auth.uid() AS uid), user_id))));

create policy "game_chat_invites: insert via rpc only" on public.game_chat_invites as PERMISSIVE for INSERT to authenticated with check (false);

create policy "game_chat_invites: read participants" on public.game_chat_invites as PERMISSIVE for SELECT to authenticated using (((( SELECT auth.uid() AS uid) = invitee_user_id) OR (( SELECT auth.uid() AS uid) = invited_by_user_id) OR (EXISTS ( SELECT 1
   FROM games g
  WHERE ((g.id = game_chat_invites.game_id) AND (g.created_by = ( SELECT auth.uid() AS uid)))))));

create policy "game_comment_likes: delete own" on public.game_comment_likes as PERMISSIVE for DELETE to authenticated using ((user_id = ( SELECT auth.uid() AS uid)));

create policy "game_comment_likes: insert own" on public.game_comment_likes as PERMISSIVE for INSERT to authenticated with check (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM game_comments c
  WHERE (c.id = game_comment_likes.comment_id)))));

create policy "game_comment_likes: read" on public.game_comment_likes as PERMISSIVE for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM game_comments c
  WHERE (c.id = game_comment_likes.comment_id))));

create policy "game_comments: delete own" on public.game_comments as PERMISSIVE for DELETE to authenticated using ((user_id = ( SELECT auth.uid() AS uid)));

create policy "game_comments: insert own if can see game" on public.game_comments as PERMISSIVE for INSERT to authenticated with check (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM games g
  WHERE (g.id = game_comments.game_id)))));

create policy "game_comments: read if can see game" on public.game_comments as PERMISSIVE for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM games g
  WHERE (g.id = game_comments.game_id))));

create policy "game_likes: delete own" on public.game_likes as PERMISSIVE for DELETE to authenticated using ((user_id = ( SELECT auth.uid() AS uid)));

create policy "game_likes: insert own" on public.game_likes as PERMISSIVE for INSERT to authenticated with check (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM games g
  WHERE (g.id = game_likes.game_id)))));

create policy "game_likes: read" on public.game_likes as PERMISSIVE for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM games g
  WHERE (g.id = game_likes.game_id))));

create policy game_messages_insert_participants on public.game_messages as PERMISSIVE for INSERT to authenticated with check (((( SELECT auth.uid() AS uid) = user_id) AND (EXISTS ( SELECT 1
   FROM game_participants gp
  WHERE ((gp.game_id = game_messages.game_id) AND (gp.user_id = ( SELECT auth.uid() AS uid)))))));

create policy game_messages_select_participants on public.game_messages as PERMISSIVE for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM game_participants gp
  WHERE ((gp.game_id = game_messages.game_id) AND (gp.user_id = ( SELECT auth.uid() AS uid))))));

create policy "game_outcome_reports: read if in the game" on public.game_outcome_reports as PERMISSIVE for SELECT to authenticated using (viewer_is_game_participant(game_id));

create policy "game_outcome_reports: write own" on public.game_outcome_reports as PERMISSIVE for ALL to authenticated using ((user_id = ( SELECT auth.uid() AS uid))) with check (((user_id = ( SELECT auth.uid() AS uid)) AND viewer_is_game_participant(game_id)));

create policy "Authenticated users can join games" on public.game_participants as PERMISSIVE for INSERT to authenticated with check (true);

create policy "Users can delete own participation" on public.game_participants as PERMISSIVE for DELETE to authenticated using ((( SELECT auth.uid() AS uid) = user_id));

create policy "game_participants: readable when the game is" on public.game_participants as PERMISSIVE for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM games g
  WHERE (g.id = game_participants.game_id))));

create policy "game_poll_votes: read if in game" on public.game_poll_votes as PERMISSIVE for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM game_polls pl
  WHERE ((pl.id = game_poll_votes.poll_id) AND viewer_is_game_participant(pl.game_id)))));

create policy "game_poll_votes: write own" on public.game_poll_votes as PERMISSIVE for ALL to authenticated using ((user_id = ( SELECT auth.uid() AS uid))) with check (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM game_polls pl
  WHERE ((pl.id = game_poll_votes.poll_id) AND (pl.closed_at IS NULL) AND viewer_is_game_participant(pl.game_id))))));

create policy "game_polls: host closes" on public.game_polls as PERMISSIVE for UPDATE to authenticated using ((EXISTS ( SELECT 1
   FROM games g
  WHERE ((g.id = game_polls.game_id) AND (g.created_by = ( SELECT auth.uid() AS uid)))))) with check ((EXISTS ( SELECT 1
   FROM games g
  WHERE ((g.id = game_polls.game_id) AND (g.created_by = ( SELECT auth.uid() AS uid))))));

create policy "game_polls: host creates" on public.game_polls as PERMISSIVE for INSERT to authenticated with check (((created_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM games g
  WHERE ((g.id = game_polls.game_id) AND (g.created_by = ( SELECT auth.uid() AS uid)))))));

create policy "game_polls: read if in the game" on public.game_polls as PERMISSIVE for SELECT to authenticated using (viewer_is_game_participant(game_id));

create policy "Game results readable by everyone" on public.game_results as PERMISSIVE for SELECT to authenticated using (true);

create policy "Authenticated users can create games" on public.games as PERMISSIVE for INSERT to authenticated with check (true);

create policy "Hosts can delete own games" on public.games as PERMISSIVE for DELETE to authenticated using ((( SELECT auth.uid() AS uid) = created_by));

create policy "games: readable by viewers it is meant for" on public.games as PERMISSIVE for SELECT to authenticated using (((created_by = ( SELECT auth.uid() AS uid)) OR viewer_is_game_participant(id) OR (can_view_game_for_gender(( SELECT p.gender
   FROM profiles p
  WHERE (p.id = ( SELECT auth.uid() AS uid))), ( SELECT h.gender
   FROM profiles h
  WHERE (h.id = games.created_by)), (requirements ->> 'matchType'::text)) AND ((COALESCE(visibility, 'public'::text) = 'public'::text) OR is_eligible_to_join_game(id, ( SELECT auth.uid() AS uid))))));

create policy "legal_acceptances: owner reads" on public.legal_acceptances as PERMISSIVE for SELECT to authenticated using ((( SELECT auth.uid() AS uid) = user_id));

create policy "map_note_comment_likes: delete own" on public.map_note_comment_likes as PERMISSIVE for DELETE to authenticated using ((( SELECT auth.uid() AS uid) = user_id));

create policy "map_note_comment_likes: insert own" on public.map_note_comment_likes as PERMISSIVE for INSERT to authenticated with check ((( SELECT auth.uid() AS uid) = user_id));

create policy "map_note_comment_likes: read" on public.map_note_comment_likes as PERMISSIVE for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM map_note_comments c
  WHERE (c.id = map_note_comment_likes.comment_id))));

create policy "map_note_comments: delete own" on public.map_note_comments as PERMISSIVE for DELETE to authenticated using ((( SELECT auth.uid() AS uid) = user_id));

create policy "map_note_comments: insert own if can see note" on public.map_note_comments as PERMISSIVE for INSERT to authenticated with check (((( SELECT auth.uid() AS uid) = user_id) AND (EXISTS ( SELECT 1
   FROM map_notes n
  WHERE (n.id = map_note_comments.note_id)))));

create policy "map_note_comments: read if can see note" on public.map_note_comments as PERMISSIVE for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM map_notes n
  WHERE (n.id = map_note_comments.note_id))));

create policy "map_note_likes: delete own" on public.map_note_likes as PERMISSIVE for DELETE to authenticated using ((( SELECT auth.uid() AS uid) = user_id));

create policy "map_note_likes: insert own" on public.map_note_likes as PERMISSIVE for INSERT to authenticated with check ((( SELECT auth.uid() AS uid) = user_id));

create policy "map_note_likes: read" on public.map_note_likes as PERMISSIVE for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM map_notes n
  WHERE (n.id = map_note_likes.note_id))));

create policy "map_notes: delete own" on public.map_notes as PERMISSIVE for DELETE to authenticated using ((( SELECT auth.uid() AS uid) = created_by));

create policy "map_notes: insert own" on public.map_notes as PERMISSIVE for INSERT to authenticated with check ((( SELECT auth.uid() AS uid) = created_by));

create policy "map_notes: read visible" on public.map_notes as PERMISSIVE for SELECT to authenticated using (((visibility = 'public'::text) OR ((( SELECT auth.uid() AS uid) IS NOT NULL) AND (created_by = ( SELECT auth.uid() AS uid))) OR ((visibility = 'friends'::text) AND (( SELECT auth.uid() AS uid) IS NOT NULL) AND ((EXISTS ( SELECT 1
   FROM user_follows
  WHERE ((user_follows.follower_id = ( SELECT auth.uid() AS uid)) AND (user_follows.followed_id = map_notes.created_by)))) OR (EXISTS ( SELECT 1
   FROM user_follows
  WHERE ((user_follows.follower_id = map_notes.created_by) AND (user_follows.followed_id = ( SELECT auth.uid() AS uid)))))))));

create policy "map_notes: update own" on public.map_notes as PERMISSIVE for UPDATE to authenticated using ((( SELECT auth.uid() AS uid) = created_by)) with check ((( SELECT auth.uid() AS uid) = created_by));

create policy "notifications: read own" on public.notifications as PERMISSIVE for SELECT to authenticated using ((( SELECT auth.uid() AS uid) = user_id));

create policy "notifications: update own" on public.notifications as PERMISSIVE for UPDATE to authenticated using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));

create policy osm_sports_venues_public_read on public.osm_sports_venues as PERMISSIVE for SELECT to anon, authenticated using (true);

create policy "Profile locations: read own only" on public.profile_locations as PERMISSIVE for SELECT to authenticated using ((profile_id = ( SELECT auth.uid() AS uid)));

create policy "Users can insert own profile location" on public.profile_locations as PERMISSIVE for INSERT to authenticated with check ((( SELECT auth.uid() AS uid) = profile_id));

create policy "Users can update own profile location" on public.profile_locations as PERMISSIVE for UPDATE to authenticated using ((( SELECT auth.uid() AS uid) = profile_id)) with check ((( SELECT auth.uid() AS uid) = profile_id));

create policy "profile_private: owner reads" on public.profile_private as PERMISSIVE for SELECT to authenticated using ((( SELECT auth.uid() AS uid) = user_id));

create policy "Profiles are viewable by everyone" on public.profiles as PERMISSIVE for SELECT to authenticated using (true);

create policy "Users can insert own profile" on public.profiles as PERMISSIVE for INSERT to authenticated with check ((( SELECT auth.uid() AS uid) = id));

create policy "Users can update own profile" on public.profiles as PERMISSIVE for UPDATE to authenticated using ((( SELECT auth.uid() AS uid) = id)) with check ((( SELECT auth.uid() AS uid) = id));

create policy "saved_venues: read own" on public.saved_venues as PERMISSIVE for SELECT to authenticated using ((user_id = ( SELECT auth.uid() AS uid)));

create policy "saved_venues: write own" on public.saved_venues as PERMISSIVE for ALL to authenticated using ((user_id = ( SELECT auth.uid() AS uid))) with check ((user_id = ( SELECT auth.uid() AS uid)));

create policy "status_comments: delete own" on public.status_comments as PERMISSIVE for DELETE to authenticated using ((( SELECT auth.uid() AS uid) = user_id));

create policy "status_comments: insert own" on public.status_comments as PERMISSIVE for INSERT to authenticated with check ((( SELECT auth.uid() AS uid) = user_id));

create policy "status_comments: read" on public.status_comments as PERMISSIVE for SELECT to authenticated using (true);

create policy "status_likes: delete own" on public.status_likes as PERMISSIVE for DELETE to authenticated using ((( SELECT auth.uid() AS uid) = user_id));

create policy "status_likes: insert own" on public.status_likes as PERMISSIVE for INSERT to authenticated with check ((( SELECT auth.uid() AS uid) = user_id));

create policy "status_likes: read" on public.status_likes as PERMISSIVE for SELECT to authenticated using (true);

create policy status_updates_insert_owner on public.status_updates as PERMISSIVE for INSERT to authenticated with check ((( SELECT auth.uid() AS uid) = user_id));

create policy status_updates_select_public on public.status_updates as PERMISSIVE for SELECT to authenticated using (true);

create policy status_updates_update_owner on public.status_updates as PERMISSIVE for UPDATE to authenticated using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));

create policy "User badges readable by everyone" on public.user_badges as PERMISSIVE for SELECT to authenticated using (true);

create policy "user_follows: delete own" on public.user_follows as PERMISSIVE for DELETE to authenticated using ((( SELECT auth.uid() AS uid) = follower_id));

create policy "user_follows: insert own" on public.user_follows as PERMISSIVE for INSERT to authenticated with check ((( SELECT auth.uid() AS uid) = follower_id));

create policy "user_follows: read public" on public.user_follows as PERMISSIVE for SELECT to authenticated using (true);

create policy "Users delete own push tokens" on public.user_push_tokens as PERMISSIVE for DELETE to authenticated using ((( SELECT auth.uid() AS uid) = user_id));

create policy "Users read own push tokens" on public.user_push_tokens as PERMISSIVE for SELECT to authenticated using ((( SELECT auth.uid() AS uid) = user_id));

create policy "Users update own push tokens" on public.user_push_tokens as PERMISSIVE for UPDATE to authenticated using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));

create policy "Users write own push tokens" on public.user_push_tokens as PERMISSIVE for INSERT to authenticated with check ((( SELECT auth.uid() AS uid) = user_id));

create policy "User stats readable by owner" on public.user_stats as PERMISSIVE for SELECT to authenticated using ((( SELECT auth.uid() AS uid) = user_id));

create policy "user_statuses: delete own" on public.user_statuses as PERMISSIVE for DELETE to authenticated using ((( SELECT auth.uid() AS uid) = user_id));

create policy "user_statuses: insert own" on public.user_statuses as PERMISSIVE for INSERT to authenticated with check ((( SELECT auth.uid() AS uid) = user_id));

create policy "user_statuses: read non-expired" on public.user_statuses as PERMISSIVE for SELECT to authenticated using ((expires_at > now()));

create policy "venue_comment_likes: delete own" on public.venue_comment_likes as PERMISSIVE for DELETE to authenticated using ((( SELECT auth.uid() AS uid) = user_id));

create policy "venue_comment_likes: insert own" on public.venue_comment_likes as PERMISSIVE for INSERT to authenticated with check (((( SELECT auth.uid() AS uid) = user_id) AND (EXISTS ( SELECT 1
   FROM venue_comments c
  WHERE (c.id = venue_comment_likes.comment_id)))));

create policy "venue_comment_likes: read if comment exists" on public.venue_comment_likes as PERMISSIVE for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM venue_comments c
  WHERE (c.id = venue_comment_likes.comment_id))));

create policy "venue_comments: delete own" on public.venue_comments as PERMISSIVE for DELETE to authenticated using ((( SELECT auth.uid() AS uid) = user_id));

create policy "venue_comments: insert own" on public.venue_comments as PERMISSIVE for INSERT to authenticated with check ((( SELECT auth.uid() AS uid) = user_id));

create policy "venue_comments: read all" on public.venue_comments as PERMISSIVE for SELECT to authenticated using (true);

create policy venue_coverage_public_read on public.venue_coverage as PERMISSIVE for SELECT to anon, authenticated using (true);

create policy "venue_photo_reports: insert own" on public.venue_photo_reports as PERMISSIVE for INSERT to authenticated with check ((( SELECT auth.uid() AS uid) = user_id));

create policy "venue_photo_reports: read own" on public.venue_photo_reports as PERMISSIVE for SELECT to authenticated using ((( SELECT auth.uid() AS uid) = user_id));

create policy "venue_photos: delete own" on public.venue_photos as PERMISSIVE for DELETE to authenticated using ((( SELECT auth.uid() AS uid) = user_id));

create policy "venue_photos: insert own" on public.venue_photos as PERMISSIVE for INSERT to authenticated with check ((( SELECT auth.uid() AS uid) = user_id));

create policy "venue_photos: read visible or own" on public.venue_photos as PERMISSIVE for SELECT to authenticated using (((status = 'visible'::text) OR (user_id = ( SELECT auth.uid() AS uid))));

create policy "venue_reviews: delete own" on public.venue_reviews as PERMISSIVE for DELETE to authenticated using ((( SELECT auth.uid() AS uid) = user_id));

create policy "venue_reviews: insert own" on public.venue_reviews as PERMISSIVE for INSERT to authenticated with check ((( SELECT auth.uid() AS uid) = user_id));

create policy "venue_reviews: read all" on public.venue_reviews as PERMISSIVE for SELECT to authenticated using (true);

create policy "venue_reviews: update own" on public.venue_reviews as PERMISSIVE for UPDATE to authenticated using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));

-- ======================================================================
-- Comments
-- ======================================================================

comment on table public.game_comments is 'Public conversation on a game, for people deciding whether to join. Distinct from game_messages, which is the private thread for people who already have.';

comment on table public.game_outcome_reports is 'One answer per participant to "did it happen?", asked in the game chat once the game is over. The honest denominator for games-played over games-created.';

comment on table public.saved_venues is 'Venues a member bookmarked. venue_id is an OSM id (text) with no FK — the OSM importer replaces rows and a cascade would erase saves.';

comment on table public.venue_coverage is 'Which 0.1-degree tiles of osm_sports_venues have been imported. Distinguishes "never fetched" from "fetched, genuinely empty" so the client knows whether to trigger a warm.';

comment on column public.game_participants.chat_hidden_at is 'When this participant archived the game chat out of their own inbox. Null = visible. Cleared automatically by a newer message (see get_my_game_inbox).';

comment on column public.games.invite_token is 'Never granted to client roles. Read it through get_game_invite_token(), which answers only the host and the players who already joined.';

comment on column public.osm_sports_venues.google_photo_name is 'Places API (New) photo resource name — used by /api/venue-photo proxy.';

comment on column public.osm_sports_venues.enrichment_source is 'google | wikidata — which provider supplied hero_image_url.';

comment on column public.osm_sports_venues.tags is 'Whitelisted long-tail OSM tags (hoops, lanes, capacity, fee, covered, wheelchair, phone, image, wikimedia_commons, wikipedia, description, addr{...}). Display-only. Written by server/lib/osmVenueTags.ts buildOsmTagBag(). Deliberately NOT emitted into map GeoJSON properties — that path selects up to 8000 rows.';

comment on column public.osm_sports_venues.photos is 'Merged gallery, priority-ordered: [{source:"google"|"osm"|"wikimedia"|"wikidata", ref?, url?, attribution, attribution_url}]. Google entries carry a photo RESOURCE NAME in `ref`, never bytes and never a Google URL — they are served through /api/venue-photo?venueId=..&i=N so the API key stays server-side.';

comment on column public.osm_sports_venues.google_details is 'Google Places non-photo content (rating, userRatingCount, formattedAddress, phone, hours, editorialSummary, accessibility/parking, businessStatus, googleMapsUri) plus fetchedAt. SHORT 24h TTL per Places terms. NEVER contains review text — Google review text may not be commingled with first-party reviews, so it is not requested at all.';

comment on column public.osm_sports_venues.enrichment_version is 'Bumped in api/venue-enrich.ts (ENRICHMENT_VERSION) whenever the enrichment shape changes. Rows below the current value are treated as stale regardless of enriched_at.';

comment on column public.profiles.athlete_profile is 'Athlete-facing profile extensions (handle, sports, metrics, experience, highlights, trust UI). Validated in app.';

comment on column public.profiles.display_name_search is 'Lowercased display_name for trigram search; maintained by DB.';

comment on column public.profiles.handle_search is 'Lowercased @handle from athlete_profile JSON; maintained by DB.';

comment on column public.venue_coverage.import_version is 'Which Overpass token set this tile was imported under — VENUE_IMPORT_VERSION in server/lib/osmVenueQuery.ts, derived from the leisure+sport token lists. A row below the current value is stale regardless of warmed_at, so changing the tokens re-imports visited areas without a manual --force backfill. 0 = imported before this column existed.';

comment on function public.end_game(p_game_id uuid) is 'Host ends their own game: status=completed, ended_at=now(), ends_at=now(). Ending a game that has not started yet deletes it instead. The three timestamps are set together on purpose.';

comment on function public.games_set_ends_at() is 'Keeps games.ends_at = starts_at + duration_minutes, except when the statement set ends_at deliberately (start_game) or the game is already completed/cancelled. Fires BEFORE INSERT OR UPDATE OF starts_at, duration_minutes.';

comment on function public.get_games_at_venue(p_lat double precision, p_lng double precision, p_radius_m double precision, p_include_completed boolean, p_limit integer) is 'Games hosted within a radius of a point, newest first, past ones flagged. The venue card''s "played here" history.';

comment on function public.get_games_nearby(lat double precision, lng double precision, radius_km double precision) is 'Games near a point for a signed-in viewer, nearest first, gender- and TTL-filtered. Carries the host denormalised (name, avatar, sportsmanship) so a card can name the host without a second round-trip per pin.';

comment on function public.get_my_game_inbox() is 'Every game you hold a participant row for, newest activity first, regardless of date — the one surface that does not filter by time, so it returns the full lifecycle (status, ends_at, ended_at, live_started_at) and lets the client decide what is over. Rows you archived come back only when a newer message arrives.';

comment on function public.get_suggested_games(p_lat double precision, p_lng double precision, p_radius_km double precision, p_limit integer) is 'Games near a point, ranked for the caller: sport match 40%, time-to-start 25%, distance 20%, spots left 10%, host reputation 5%. Carries the host denormalised. Returns nothing for a guest — suggestions are personal.';

comment on function public.get_unified_feed(p_lat double precision, p_lng double precision, p_map_radius_km double precision, p_limit integer) is 'One feed of notes, games and statuses near a point, newest first. The `game` jsonb column carries everything a joinable game card renders (schedule, status, spots, venue, whether you are already in); notes and statuses leave it null. Games respect the same gender and TTL rules as the map.';

comment on function public.get_venues_in_bbox(p_min_lat double precision, p_min_lng double precision, p_max_lat double precision, p_max_lng double precision, p_limit integer) is 'Venues inside a bbox, nearest-first from the bbox centre, private and residential excluded. Projection is deliberately the nine columns the map draws with — the venue card reads the rest one row at a time through fetchVenueById. Do not widen it: every column here is multiplied by up to 1000 pins on every map load.';

-- ======================================================================
-- Grants — tables
-- ======================================================================

grant delete, insert, references, select, trigger, truncate, update on public.app_flags to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.athlete_endorsements to anon;

grant delete, insert, references, select, trigger, truncate, update on public.athlete_endorsements to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.athlete_endorsements to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.badges to anon;

grant delete, insert, references, select, trigger, truncate, update on public.badges to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.badges to service_role;

grant insert, select, update on public.chat_reads to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.chat_reads to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.dm_messages to anon;

grant delete, insert, references, select, trigger, truncate, update on public.dm_messages to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.dm_messages to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.dm_thread_members to anon;

grant delete, insert, references, select, trigger, truncate, update on public.dm_thread_members to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.dm_thread_members to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.dm_threads to anon;

grant delete, insert, references, select, trigger, truncate, update on public.dm_threads to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.dm_threads to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.feed_media_post_comments to anon;

grant delete, insert, references, select, trigger, truncate, update on public.feed_media_post_comments to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.feed_media_post_comments to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.feed_media_post_likes to anon;

grant delete, insert, references, select, trigger, truncate, update on public.feed_media_post_likes to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.feed_media_post_likes to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.feed_media_posts to anon;

grant delete, insert, references, select, trigger, truncate, update on public.feed_media_posts to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.feed_media_posts to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.game_chat_invites to anon;

grant delete, insert, references, select, trigger, truncate, update on public.game_chat_invites to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.game_chat_invites to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.game_comment_likes to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.game_comment_likes to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.game_comments to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.game_comments to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.game_likes to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.game_likes to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.game_messages to anon;

grant delete, insert, references, select, trigger, truncate, update on public.game_messages to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.game_messages to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.game_outcome_reports to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.game_outcome_reports to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.game_participants to anon;

grant delete, insert, references, select, trigger, truncate, update on public.game_participants to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.game_participants to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.game_poll_votes to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.game_poll_votes to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.game_polls to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.game_polls to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.game_results to anon;

grant delete, insert, references, select, trigger, truncate, update on public.game_results to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.game_results to service_role;

grant delete, insert, references, trigger, truncate, update on public.games to anon;

grant delete, insert, references, trigger, truncate, update on public.games to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.games to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.geography_columns to anon;

grant delete, insert, references, select, trigger, truncate, update on public.geography_columns to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.geography_columns to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.geometry_columns to anon;

grant delete, insert, references, select, trigger, truncate, update on public.geometry_columns to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.geometry_columns to service_role;

grant select on public.legal_acceptances to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.legal_acceptances to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.legal_documents to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.map_note_comment_likes to anon;

grant delete, insert, references, select, trigger, truncate, update on public.map_note_comment_likes to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.map_note_comment_likes to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.map_note_comments to anon;

grant delete, insert, references, select, trigger, truncate, update on public.map_note_comments to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.map_note_comments to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.map_note_likes to anon;

grant delete, insert, references, select, trigger, truncate, update on public.map_note_likes to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.map_note_likes to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.map_notes to anon;

grant delete, insert, references, select, trigger, truncate, update on public.map_notes to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.map_notes to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.min_age_by_country to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.notifications to anon;

grant delete, insert, references, select, trigger, truncate, update on public.notifications to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.notifications to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.osm_sports_venues to anon;

grant delete, insert, references, select, trigger, truncate, update on public.osm_sports_venues to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.osm_sports_venues to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.profile_locations to anon;

grant delete, insert, references, select, trigger, truncate, update on public.profile_locations to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.profile_locations to service_role;

grant select on public.profile_private to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.profile_private to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.profiles to anon;

grant delete, insert, references, select, trigger, truncate, update on public.profiles to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.profiles to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.push_notifications_sent to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.saved_venues to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.saved_venues to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.spatial_ref_sys to anon;

grant delete, insert, references, select, trigger, truncate, update on public.spatial_ref_sys to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.spatial_ref_sys to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.status_comments to anon;

grant delete, insert, references, select, trigger, truncate, update on public.status_comments to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.status_comments to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.status_likes to anon;

grant delete, insert, references, select, trigger, truncate, update on public.status_likes to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.status_likes to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.status_updates to anon;

grant delete, insert, references, select, trigger, truncate, update on public.status_updates to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.status_updates to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.user_badges to anon;

grant delete, insert, references, select, trigger, truncate, update on public.user_badges to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.user_badges to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.user_follows to anon;

grant delete, insert, references, select, trigger, truncate, update on public.user_follows to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.user_follows to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.user_push_tokens to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.user_push_tokens to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.user_stats to anon;

grant delete, insert, references, select, trigger, truncate, update on public.user_stats to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.user_stats to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.user_statuses to anon;

grant delete, insert, references, select, trigger, truncate, update on public.user_statuses to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.user_statuses to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.venue_comment_likes to anon;

grant delete, insert, references, select, trigger, truncate, update on public.venue_comment_likes to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.venue_comment_likes to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.venue_comments to anon;

grant delete, insert, references, select, trigger, truncate, update on public.venue_comments to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.venue_comments to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.venue_coverage to anon;

grant delete, insert, references, select, trigger, truncate, update on public.venue_coverage to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.venue_coverage to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.venue_photo_reports to anon;

grant delete, insert, references, select, trigger, truncate, update on public.venue_photo_reports to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.venue_photo_reports to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.venue_photos to anon;

grant delete, insert, references, select, trigger, truncate, update on public.venue_photos to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.venue_photos to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.venue_reviews to anon;

grant delete, insert, references, select, trigger, truncate, update on public.venue_reviews to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.venue_reviews to service_role;

-- ======================================================================
-- Grants — functions
-- ======================================================================

grant execute on function public._athlete_sports_array(profile_json jsonb) to authenticated;

grant execute on function public._athlete_sports_array(profile_json jsonb) to service_role;

grant execute on function public._fun_apply_account_setup(p_uid uuid, p_birthdate date, p_gender text, p_country text, p_accepted jsonb) to service_role;

grant execute on function public.add_game_comment(p_game_id uuid, p_body text) to authenticated;

grant execute on function public.add_game_comment(p_game_id uuid, p_body text) to service_role;

grant execute on function public.add_note_comment(p_note_id uuid, p_body text, p_client_id text) to authenticated;

grant execute on function public.add_note_comment(p_note_id uuid, p_body text, p_client_id text) to service_role;

grant execute on function public.add_post_comment(p_post_id uuid, p_body text) to authenticated;

grant execute on function public.add_post_comment(p_post_id uuid, p_body text) to service_role;

grant execute on function public.add_status_comment(p_status_id uuid, p_body text) to authenticated;

grant execute on function public.add_status_comment(p_status_id uuid, p_body text) to service_role;

grant execute on function public.add_venue_comment(p_venue_id text, p_body text, p_lat double precision, p_lng double precision, p_name text, p_sport text, p_leisure text) to authenticated;

grant execute on function public.add_venue_comment(p_venue_id text, p_body text, p_lat double precision, p_lng double precision, p_name text, p_sport text, p_leisure text) to service_role;

grant execute on function public.add_venue_photo(p_venue_id text, p_storage_path text, p_caption text, p_lat double precision, p_lng double precision, p_name text, p_sport text, p_leisure text) to authenticated;

grant execute on function public.add_venue_photo(p_venue_id text, p_storage_path text, p_caption text, p_lat double precision, p_lng double precision, p_name text, p_sport text, p_leisure text) to service_role;

grant execute on function public.archive_game_chat(p_game_id uuid) to authenticated;

grant execute on function public.archive_game_chat(p_game_id uuid) to service_role;

grant execute on function public.can_dm(p_other_user_id uuid) to authenticated;

grant execute on function public.can_dm(p_other_user_id uuid) to service_role;

grant execute on function public.can_view_game_for_gender(p_viewer_gender text, p_host_gender text, p_match_type text) to anon;

grant execute on function public.can_view_game_for_gender(p_viewer_gender text, p_host_gender text, p_match_type text) to authenticated;

grant execute on function public.can_view_game_for_gender(p_viewer_gender text, p_host_gender text, p_match_type text) to service_role;

grant execute on function public.chat_reads_touch_sender() to anon;

grant execute on function public.chat_reads_touch_sender() to authenticated;

grant execute on function public.chat_reads_touch_sender() to service_role;

grant execute on function public.check_nearby_similar_games(p_sport text, p_lat double precision, p_lng double precision, p_starts_at timestamp with time zone, p_radius_km double precision) to authenticated;

grant execute on function public.check_nearby_similar_games(p_sport text, p_lat double precision, p_lng double precision, p_starts_at timestamp with time zone, p_radius_km double precision) to service_role;

grant execute on function public.close_rematch_poll(p_poll_id uuid) to authenticated;

grant execute on function public.close_rematch_poll(p_poll_id uuid) to service_role;

grant execute on function public.complete_account_setup(p_birthdate date, p_gender text, p_country text, p_accepted jsonb) to authenticated;

grant execute on function public.complete_account_setup(p_birthdate date, p_gender text, p_country text, p_accepted jsonb) to service_role;

grant execute on function public.complete_game(p_game_id uuid, p_winner_team_or_user text, p_score jsonb) to authenticated;

grant execute on function public.complete_game(p_game_id uuid, p_winner_team_or_user text, p_score jsonb) to service_role;

grant execute on function public.create_game(p_title text, p_sport text, p_spots_needed integer, p_lat double precision, p_lng double precision, p_starts_at timestamp with time zone, p_location_label text, p_description text, p_requirements jsonb, p_duration_minutes integer, p_visibility text) to authenticated;

grant execute on function public.create_game(p_title text, p_sport text, p_spots_needed integer, p_lat double precision, p_lng double precision, p_starts_at timestamp with time zone, p_location_label text, p_description text, p_requirements jsonb, p_duration_minutes integer, p_visibility text) to service_role;

grant execute on function public.create_map_note(p_lat double precision, p_lng double precision, p_body text, p_visibility text, p_place_name text) to authenticated;

grant execute on function public.create_map_note(p_lat double precision, p_lng double precision, p_body text, p_visibility text, p_place_name text) to service_role;

grant execute on function public.create_rematch_poll(p_game_id uuid, p_question text) to authenticated;

grant execute on function public.create_rematch_poll(p_game_id uuid, p_question text) to service_role;

grant execute on function public.delete_game_comment(p_comment_id uuid) to authenticated;

grant execute on function public.delete_game_comment(p_comment_id uuid) to service_role;

grant execute on function public.delete_my_status(p_status_id uuid) to authenticated;

grant execute on function public.delete_my_status(p_status_id uuid) to service_role;

grant execute on function public.delete_push_token(p_token text) to authenticated;

grant execute on function public.delete_push_token(p_token text) to service_role;

grant execute on function public.delete_venue_comment(p_comment_id uuid) to authenticated;

grant execute on function public.delete_venue_comment(p_comment_id uuid) to service_role;

grant execute on function public.delete_venue_photo(p_photo_id uuid) to authenticated;

grant execute on function public.delete_venue_photo(p_photo_id uuid) to service_role;

grant execute on function public.delete_venue_review(p_venue_id text) to authenticated;

grant execute on function public.delete_venue_review(p_venue_id text) to service_role;

grant execute on function public.end_game(p_game_id uuid) to authenticated;

grant execute on function public.end_game(p_game_id uuid) to service_role;

grant execute on function public.endorse_athlete(p_athlete uuid, p_game uuid, p_rating integer, p_tags text[]) to authenticated;

grant execute on function public.endorse_athlete(p_athlete uuid, p_game uuid, p_rating integer, p_tags text[]) to service_role;

grant execute on function public.enforce_game_participants_visibility() to service_role;

grant execute on function public.enqueue_notification(p_user_id uuid, p_type text, p_payload jsonb) to service_role;

grant execute on function public.ensure_venue_row(p_venue_id text, p_lat double precision, p_lng double precision, p_name text, p_sport text, p_leisure text) to service_role;

grant execute on function public.fun_account_setup_complete(p_uid uuid) to service_role;

grant execute on function public.fun_age_tier(p_birthdate date) to service_role;

grant execute on function public.fun_age_years(p_birthdate date) to service_role;

grant execute on function public.fun_games_sync_lat_lng() to anon;

grant execute on function public.fun_games_sync_lat_lng() to authenticated;

grant execute on function public.fun_games_sync_lat_lng() to service_role;

grant execute on function public.fun_min_age(p_country text) to service_role;

grant execute on function public.games_set_ends_at() to anon;

grant execute on function public.games_set_ends_at() to authenticated;

grant execute on function public.games_set_ends_at() to service_role;

grant execute on function public.get_active_hosted_games_count(p_user_id uuid) to authenticated;

grant execute on function public.get_active_hosted_games_count(p_user_id uuid) to service_role;

grant execute on function public.get_athlete_reputation(p_athlete uuid) to authenticated;

grant execute on function public.get_athlete_reputation(p_athlete uuid) to service_role;

grant execute on function public.get_follow_requests() to authenticated;

grant execute on function public.get_follow_requests() to service_role;

grant execute on function public.get_game_comments_with_likes(p_game_id uuid) to authenticated;

grant execute on function public.get_game_comments_with_likes(p_game_id uuid) to service_role;

grant execute on function public.get_game_invite_token(p_game_id uuid) to authenticated;

grant execute on function public.get_game_invite_token(p_game_id uuid) to service_role;

grant execute on function public.get_game_lat_lng(p_game_id uuid) to authenticated;

grant execute on function public.get_game_lat_lng(p_game_id uuid) to service_role;

grant execute on function public.get_game_outcome_summary(p_game_id uuid) to authenticated;

grant execute on function public.get_game_outcome_summary(p_game_id uuid) to service_role;

grant execute on function public.get_game_social_counts(p_game_ids uuid[]) to authenticated;

grant execute on function public.get_game_social_counts(p_game_ids uuid[]) to service_role;

grant execute on function public.get_games_at_venue(p_lat double precision, p_lng double precision, p_radius_m double precision, p_include_completed boolean, p_limit integer) to authenticated;

grant execute on function public.get_games_at_venue(p_lat double precision, p_lng double precision, p_radius_m double precision, p_include_completed boolean, p_limit integer) to service_role;

grant execute on function public.get_games_nearby(lat double precision, lng double precision, radius_km double precision) to authenticated;

grant execute on function public.get_games_nearby(lat double precision, lng double precision, radius_km double precision) to service_role;

grant execute on function public.get_guest_game_comments(p_game_id uuid) to anon;

grant execute on function public.get_guest_game_comments(p_game_id uuid) to authenticated;

grant execute on function public.get_guest_game_comments(p_game_id uuid) to service_role;

grant execute on function public.get_guest_games_at_venue(p_lat double precision, p_lng double precision, p_radius_m double precision, p_limit integer) to anon;

grant execute on function public.get_guest_games_at_venue(p_lat double precision, p_lng double precision, p_radius_m double precision, p_limit integer) to authenticated;

grant execute on function public.get_guest_games_at_venue(p_lat double precision, p_lng double precision, p_radius_m double precision, p_limit integer) to service_role;

grant execute on function public.get_guest_games_nearby(lat double precision, lng double precision, radius_km double precision) to anon;

grant execute on function public.get_guest_games_nearby(lat double precision, lng double precision, radius_km double precision) to authenticated;

grant execute on function public.get_guest_games_nearby(lat double precision, lng double precision, radius_km double precision) to service_role;

grant execute on function public.get_guest_note_by_id(p_note_id uuid, p_lat double precision, p_lng double precision) to anon;

grant execute on function public.get_guest_note_by_id(p_note_id uuid, p_lat double precision, p_lng double precision) to authenticated;

grant execute on function public.get_guest_note_by_id(p_note_id uuid, p_lat double precision, p_lng double precision) to service_role;

grant execute on function public.get_guest_notes_nearby(p_lat double precision, p_lng double precision, p_radius_km double precision, p_limit integer) to anon;

grant execute on function public.get_guest_notes_nearby(p_lat double precision, p_lng double precision, p_radius_km double precision, p_limit integer) to authenticated;

grant execute on function public.get_guest_notes_nearby(p_lat double precision, p_lng double precision, p_radius_km double precision, p_limit integer) to service_role;

grant execute on function public.get_guest_signup_rules() to anon;

grant execute on function public.get_guest_signup_rules() to authenticated;

grant execute on function public.get_guest_signup_rules() to service_role;

grant execute on function public.get_guest_venue_comments(p_venue_id text, p_limit integer, p_offset integer) to anon;

grant execute on function public.get_guest_venue_comments(p_venue_id text, p_limit integer, p_offset integer) to authenticated;

grant execute on function public.get_guest_venue_comments(p_venue_id text, p_limit integer, p_offset integer) to service_role;

grant execute on function public.get_guest_venue_photos(p_venue_id text, p_limit integer) to anon;

grant execute on function public.get_guest_venue_photos(p_venue_id text, p_limit integer) to authenticated;

grant execute on function public.get_guest_venue_photos(p_venue_id text, p_limit integer) to service_role;

grant execute on function public.get_guest_venue_reviews(p_venue_id text, p_limit integer, p_offset integer) to anon;

grant execute on function public.get_guest_venue_reviews(p_venue_id text, p_limit integer, p_offset integer) to authenticated;

grant execute on function public.get_guest_venue_reviews(p_venue_id text, p_limit integer, p_offset integer) to service_role;

grant execute on function public.get_latest_status(p_user uuid) to authenticated;

grant execute on function public.get_latest_status(p_user uuid) to service_role;

grant execute on function public.get_live_nearby(p_lat double precision, p_lng double precision, p_radius_km double precision, p_limit integer) to authenticated;

grant execute on function public.get_live_nearby(p_lat double precision, p_lng double precision, p_radius_km double precision, p_limit integer) to service_role;

grant execute on function public.get_my_account_status() to authenticated;

grant execute on function public.get_my_account_status() to service_role;

grant execute on function public.get_my_dm_inbox() to authenticated;

grant execute on function public.get_my_dm_inbox() to service_role;

grant execute on function public.get_my_game_inbox() to authenticated;

grant execute on function public.get_my_game_inbox() to service_role;

grant execute on function public.get_my_note_inbox() to authenticated;

grant execute on function public.get_my_note_inbox() to service_role;

grant execute on function public.get_my_pending_invites() to authenticated;

grant execute on function public.get_my_pending_invites() to service_role;

grant execute on function public.get_my_saved_venues(p_limit integer) to authenticated;

grant execute on function public.get_my_saved_venues(p_limit integer) to service_role;

grant execute on function public.get_my_unread_counts() to authenticated;

grant execute on function public.get_my_unread_counts() to service_role;

grant execute on function public.get_note_by_id(p_note_id uuid, p_lat double precision, p_lng double precision) to authenticated;

grant execute on function public.get_note_by_id(p_note_id uuid, p_lat double precision, p_lng double precision) to service_role;

grant execute on function public.get_note_comments(p_note_id uuid) to authenticated;

grant execute on function public.get_note_comments(p_note_id uuid) to service_role;

grant execute on function public.get_note_comments_with_likes(p_note_id uuid, p_limit integer, p_before timestamp with time zone) to authenticated;

grant execute on function public.get_note_comments_with_likes(p_note_id uuid, p_limit integer, p_before timestamp with time zone) to service_role;

grant execute on function public.get_notes_nearby(p_lat double precision, p_lng double precision, p_radius_km double precision, p_limit integer) to authenticated;

grant execute on function public.get_notes_nearby(p_lat double precision, p_lng double precision, p_radius_km double precision, p_limit integer) to service_role;

grant execute on function public.get_or_create_dm_thread(p_other uuid) to authenticated;

grant execute on function public.get_or_create_dm_thread(p_other uuid) to service_role;

grant execute on function public.get_post_comments(p_post_id uuid) to authenticated;

grant execute on function public.get_post_comments(p_post_id uuid) to service_role;

grant execute on function public.get_profiles_nearby(lat double precision, lng double precision, radius_km double precision, limit_count integer) to authenticated;

grant execute on function public.get_profiles_nearby(lat double precision, lng double precision, radius_km double precision, limit_count integer) to service_role;

grant execute on function public.get_push_targets(p_since timestamp with time zone, p_radius_km double precision, p_limit integer) to service_role;

grant execute on function public.get_rateable_teammates(p_game_id uuid) to authenticated;

grant execute on function public.get_rateable_teammates(p_game_id uuid) to service_role;

grant execute on function public.get_recent_statuses(p_limit integer) to authenticated;

grant execute on function public.get_recent_statuses(p_limit integer) to service_role;

grant execute on function public.get_rematch_poll(p_game_id uuid) to authenticated;

grant execute on function public.get_rematch_poll(p_game_id uuid) to service_role;

grant execute on function public.get_saved_venue_ids(p_venue_ids text[]) to authenticated;

grant execute on function public.get_saved_venue_ids(p_venue_ids text[]) to service_role;

grant execute on function public.get_shared_completed_games(p_other uuid) to authenticated;

grant execute on function public.get_shared_completed_games(p_other uuid) to service_role;

grant execute on function public.get_similar_athletes(lat double precision, lng double precision, radius_km double precision, limit_count integer) to authenticated;

grant execute on function public.get_similar_athletes(lat double precision, lng double precision, radius_km double precision, limit_count integer) to service_role;

grant execute on function public.get_status_comments(p_status_id uuid) to authenticated;

grant execute on function public.get_status_comments(p_status_id uuid) to service_role;

grant execute on function public.get_suggested_games(p_lat double precision, p_lng double precision, p_radius_km double precision, p_limit integer) to authenticated;

grant execute on function public.get_suggested_games(p_lat double precision, p_lng double precision, p_radius_km double precision, p_limit integer) to service_role;

grant execute on function public.get_thread_read_receipts(p_kind text, p_thread_id uuid) to authenticated;

grant execute on function public.get_thread_read_receipts(p_kind text, p_thread_id uuid) to service_role;

grant execute on function public.get_unified_feed(p_lat double precision, p_lng double precision, p_map_radius_km double precision, p_limit integer) to authenticated;

grant execute on function public.get_unified_feed(p_lat double precision, p_lng double precision, p_map_radius_km double precision, p_limit integer) to service_role;

grant execute on function public.get_venue_comments_with_likes(p_venue_id text, p_limit integer, p_offset integer) to authenticated;

grant execute on function public.get_venue_comments_with_likes(p_venue_id text, p_limit integer, p_offset integer) to service_role;

grant execute on function public.get_venue_photos(p_venue_id text, p_limit integer) to authenticated;

grant execute on function public.get_venue_photos(p_venue_id text, p_limit integer) to service_role;

grant execute on function public.get_venue_reviews(p_venue_id text, p_limit integer, p_offset integer) to authenticated;

grant execute on function public.get_venue_reviews(p_venue_id text, p_limit integer, p_offset integer) to service_role;

grant execute on function public.get_venues_in_bbox(p_min_lat double precision, p_min_lng double precision, p_max_lat double precision, p_max_lng double precision, p_limit integer) to anon;

grant execute on function public.get_venues_in_bbox(p_min_lat double precision, p_min_lng double precision, p_max_lat double precision, p_max_lng double precision, p_limit integer) to authenticated;

grant execute on function public.get_venues_in_bbox(p_min_lat double precision, p_min_lng double precision, p_max_lat double precision, p_max_lng double precision, p_limit integer) to service_role;

grant execute on function public.handle_new_user() to service_role;

grant execute on function public.haversine_km(p_lat1 double precision, p_lng1 double precision, p_lat2 double precision, p_lng2 double precision) to anon;

grant execute on function public.haversine_km(p_lat1 double precision, p_lng1 double precision, p_lat2 double precision, p_lng2 double precision) to authenticated;

grant execute on function public.haversine_km(p_lat1 double precision, p_lng1 double precision, p_lat2 double precision, p_lng2 double precision) to service_role;

grant execute on function public.is_eligible_to_join_game(p_game_id uuid, p_user_id uuid) to authenticated;

grant execute on function public.is_eligible_to_join_game(p_game_id uuid, p_user_id uuid) to service_role;

grant execute on function public.is_game_visible_on_map(p_game_id uuid) to anon;

grant execute on function public.is_game_visible_on_map(p_game_id uuid) to authenticated;

grant execute on function public.is_game_visible_on_map(p_game_id uuid) to service_role;

grant execute on function public.is_squad(p_viewer uuid, p_owner uuid) to anon;

grant execute on function public.is_squad(p_viewer uuid, p_owner uuid) to authenticated;

grant execute on function public.is_squad(p_viewer uuid, p_owner uuid) to service_role;

grant execute on function public.join_game(p_game_id uuid) to authenticated;

grant execute on function public.join_game(p_game_id uuid) to service_role;

grant execute on function public.leave_game(p_game_id uuid) to authenticated;

grant execute on function public.leave_game(p_game_id uuid) to service_role;

grant execute on function public.maintain_game_participant_count() to anon;

grant execute on function public.maintain_game_participant_count() to authenticated;

grant execute on function public.maintain_game_participant_count() to service_role;

grant execute on function public.maintain_profile_endorsement_stats() to anon;

grant execute on function public.maintain_profile_endorsement_stats() to authenticated;

grant execute on function public.maintain_profile_endorsement_stats() to service_role;

grant execute on function public.map_note_visible_to(p_note_id uuid, p_viewer uuid) to authenticated;

grant execute on function public.map_note_visible_to(p_note_id uuid, p_viewer uuid) to service_role;

grant execute on function public.mark_ended_games_completed() to service_role;

grant execute on function public.mark_thread_read(p_kind text, p_thread_id uuid, p_at timestamp with time zone) to authenticated;

grant execute on function public.mark_thread_read(p_kind text, p_thread_id uuid, p_at timestamp with time zone) to service_role;

grant execute on function public.prune_push_token(p_token text) to service_role;

grant execute on function public.record_push_sent(p_rows jsonb) to service_role;

grant execute on function public.redeem_invite_token(p_token uuid) to authenticated;

grant execute on function public.redeem_invite_token(p_token uuid) to service_role;

grant execute on function public.report_game_outcome(p_game_id uuid, p_outcome text) to authenticated;

grant execute on function public.report_game_outcome(p_game_id uuid, p_outcome text) to service_role;

grant execute on function public.report_venue_photo(p_photo_id uuid, p_reason text) to authenticated;

grant execute on function public.report_venue_photo(p_photo_id uuid, p_reason text) to service_role;

grant execute on function public.request_chat_invite(p_game_id uuid, p_invitee_user_id uuid) to authenticated;

grant execute on function public.request_chat_invite(p_game_id uuid, p_invitee_user_id uuid) to service_role;

grant execute on function public.request_follow(p_target uuid) to authenticated;

grant execute on function public.request_follow(p_target uuid) to service_role;

grant execute on function public.respond_chat_invite(p_invite_id uuid, p_action text) to authenticated;

grant execute on function public.respond_chat_invite(p_invite_id uuid, p_action text) to service_role;

grant execute on function public.respond_follow_request(p_follower uuid, p_accept boolean) to authenticated;

grant execute on function public.respond_follow_request(p_follower uuid, p_accept boolean) to service_role;

grant execute on function public.save_push_token(p_token text, p_platform text) to authenticated;

grant execute on function public.save_push_token(p_token text, p_platform text) to service_role;

grant execute on function public.search_profiles(q text, p_lat double precision, p_lng double precision, radius_km double precision, limit_n integer, p_exclude uuid) to authenticated;

grant execute on function public.search_profiles(q text, p_lat double precision, p_lng double precision, radius_km double precision, limit_n integer, p_exclude uuid) to service_role;

grant execute on function public.spatial_ref_sys_read_only() to service_role;

grant execute on function public.start_game(p_game_id uuid) to authenticated;

grant execute on function public.start_game(p_game_id uuid) to service_role;

grant execute on function public.toggle_game_comment_like(p_comment_id uuid) to authenticated;

grant execute on function public.toggle_game_comment_like(p_comment_id uuid) to service_role;

grant execute on function public.toggle_game_like(p_game_id uuid) to authenticated;

grant execute on function public.toggle_game_like(p_game_id uuid) to service_role;

grant execute on function public.toggle_saved_venue(p_venue_id text) to authenticated;

grant execute on function public.toggle_saved_venue(p_venue_id text) to service_role;

grant execute on function public.toggle_venue_comment_like(p_comment_id uuid) to authenticated;

grant execute on function public.toggle_venue_comment_like(p_comment_id uuid) to service_role;

grant execute on function public.trg_notify_game_invite() to service_role;

grant execute on function public.trg_notify_nearby_on_game() to service_role;

grant execute on function public.trg_notify_nearby_on_map_note() to service_role;

grant execute on function public.trg_notify_note_comment_liked() to service_role;

grant execute on function public.trg_notify_note_thread_participants() to service_role;

grant execute on function public.trg_notify_on_follow() to service_role;

grant execute on function public.trg_venue_photo_report_applied() to service_role;

grant execute on function public.unarchive_game_chat(p_game_id uuid) to authenticated;

grant execute on function public.unarchive_game_chat(p_game_id uuid) to service_role;

grant execute on function public.update_my_location(p_lat double precision, p_lng double precision) to authenticated;

grant execute on function public.update_my_location(p_lat double precision, p_lng double precision) to service_role;

grant execute on function public.update_my_presence(p_lat double precision, p_lng double precision, p_mode text) to authenticated;

grant execute on function public.update_my_presence(p_lat double precision, p_lng double precision, p_mode text) to service_role;

grant execute on function public.upsert_my_status(p_body text) to authenticated;

grant execute on function public.upsert_my_status(p_body text) to service_role;

grant execute on function public.upsert_venue_review(p_venue_id text, p_rating integer, p_body text, p_lat double precision, p_lng double precision, p_name text, p_sport text, p_leisure text) to authenticated;

grant execute on function public.upsert_venue_review(p_venue_id text, p_rating integer, p_body text, p_lat double precision, p_lng double precision, p_name text, p_sport text, p_leisure text) to service_role;

grant execute on function public.viewer_is_dm_thread_member(p_thread_id uuid) to anon;

grant execute on function public.viewer_is_dm_thread_member(p_thread_id uuid) to authenticated;

grant execute on function public.viewer_is_dm_thread_member(p_thread_id uuid) to service_role;

grant execute on function public.viewer_is_game_participant(p_game_id uuid) to authenticated;

grant execute on function public.viewer_is_game_participant(p_game_id uuid) to service_role;

grant execute on function public.vote_rematch_poll(p_poll_id uuid, p_choice text) to authenticated;

grant execute on function public.vote_rematch_poll(p_poll_id uuid, p_choice text) to service_role;

-- ======================================================================
-- Realtime publication
-- ======================================================================

alter publication supabase_realtime add table public.chat_reads;

alter publication supabase_realtime add table public.dm_messages;

alter publication supabase_realtime add table public.game_messages;

alter publication supabase_realtime add table public.notifications;
