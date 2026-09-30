-- What a share link may say about a game, before anyone signs in.
--
-- `/g/<token>` links currently unfurl as the same static card everywhere,
-- because a crawler hitting that route gets the SPA shell. This is the data
-- behind a real preview.
--
-- The projection is the whole point, and it is the app's existing rule applied
-- to a new surface: a share preview says **what** is happening, **where**,
-- **when** and **how many** are in — never **who**. No `created_by`, no host
-- name, no participant names, no `id`, no coordinates, and no `description`
-- (the host writes that freely and it is not worth handing to a crawler).
-- `location_label` is the same human label a guest already reads off the map.
--
-- Granted to `anon` because the callers are unauthenticated: Facebook, iMessage,
-- WhatsApp and Slack fetch the page with no session. Enumeration is not a
-- concern — `games.invite_token` is a v4 uuid, so guessing one is 122 bits of
-- work — and the token is already the credential: whoever holds it can redeem
-- it and join, at which point they see everything anyway. Showing them the
-- sport and the day first is strictly less than that.
--
-- Read by `api/invite-preview.ts` with the ANON key, not the service role, so
-- that endpoint cannot return more than a signed-out visitor could.

create or replace function public.get_invite_preview(p_token uuid)
returns table (
  title             text,
  sport             text,
  starts_at         timestamptz,
  ends_at           timestamptz,
  status            text,
  visibility        text,
  spots_needed      int,
  participant_count int,
  spots_remaining   int,
  location_label    text
)
language sql
stable
security definer
set search_path = public
as $$
  select g.title,
         g.sport,
         g.starts_at,
         g.ends_at,
         g.status,
         g.visibility,
         g.spots_needed,
         g.participant_count,
         greatest(0, coalesce(g.spots_needed, 0) - coalesce(g.participant_count, 0))::int,
         g.location_label
  from public.games g
  where g.invite_token = p_token
  limit 1;
$$;

revoke all on function public.get_invite_preview(uuid) from public;
grant execute on function public.get_invite_preview(uuid) to anon, authenticated;
