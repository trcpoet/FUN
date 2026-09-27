-- A client-chosen id on every message, so an optimistic bubble can be matched to
-- the row that comes back.
--
-- Without it, reconciling a pending bubble means matching on body plus timestamp,
-- which mis-merges two identical "ok"s sent seconds apart — the pending one
-- disappears onto the wrong row and the real one is never drawn.
--
-- The partial unique index buys idempotency for free: a retry over a flaky
-- connection raises 23505, which the client can treat as success rather than
-- sending the message twice. That is what makes "Failed — tap to retry" safe.
--
-- `edited_at` / `deleted_at` are added here rather than in a later migration
-- because three nullable columns cost one catalogue update and no table rewrite,
-- and because a message the sender deleted should stop rendering long before
-- there is UI to delete one.
--
-- Additive: existing rows get NULL, and a deployed client that never sends a
-- client_id is unaffected.

alter table public.game_messages     add column if not exists client_id  text;
alter table public.game_messages     add column if not exists edited_at  timestamptz;
alter table public.game_messages     add column if not exists deleted_at timestamptz;

alter table public.dm_messages       add column if not exists client_id  text;
alter table public.dm_messages       add column if not exists edited_at  timestamptz;
alter table public.dm_messages       add column if not exists deleted_at timestamptz;

alter table public.map_note_comments add column if not exists client_id  text;
alter table public.map_note_comments add column if not exists edited_at  timestamptz;
alter table public.map_note_comments add column if not exists deleted_at timestamptz;

-- Scoped to the sender, not global: two people may generate the same client id
-- and neither should be able to block the other's send.
create unique index if not exists game_messages_client_id_uniq
  on public.game_messages (user_id, client_id) where client_id is not null;
create unique index if not exists dm_messages_client_id_uniq
  on public.dm_messages (user_id, client_id) where client_id is not null;
create unique index if not exists map_note_comments_client_id_uniq
  on public.map_note_comments (user_id, client_id) where client_id is not null;
