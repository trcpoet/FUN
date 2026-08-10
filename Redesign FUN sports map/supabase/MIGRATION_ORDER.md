# Migration order

## The rule

**`schema.sql` is the baseline. Migrations apply on top of it, in filename order.**

```
supabase/schema.sql            <- full production snapshot (tables, RLS, policies,
                                  functions, triggers, indexes, grants, realtime)
supabase/migrations/*.sql      <- incremental changes, applied in filename order
```

To rebuild from nothing:

```bash
psql "$DATABASE_URL" -f supabase/schema.sql
for f in supabase/migrations/*.sql; do psql "$DATABASE_URL" -f "$f"; done
```

## Why schema.sql exists

The migration folder contains **only incremental patches**. No migration creates
`public.games`, `public.profiles`, or `public.game_participants` — those tables (and
`game_results`, `user_stats`, `athlete_endorsements`, `status_updates`, `dm_*`,
`game_messages`, …) came from ad-hoc SQL Editor runs during early development and were
never captured as migrations.

Between 2026-07-23 and 2026-08-10 `schema.sql` was an empty 0-byte file, which meant the
repo could not rebuild the database at all. It was regenerated from production on
2026-08-10.

## Regenerating schema.sql

`supabase db dump` requires Docker, which is not installed on this machine. Use the
Docker-free equivalent instead — it pulls the same objects through the Management API:

```bash
node scripts/dump-schema.mjs > supabase/schema.sql
```

Requires a linked project (`supabase link --project-ref <ref>`). No DB password needed.

Regenerate it whenever you apply a batch of migrations to production, so the baseline
never drifts far from live.

## Applying migrations to production

> **Do not run `supabase db push` casually.** It applies *every* pending migration.
> As of 2026-08-10 exactly one is intentionally **not** applied to production, and
> pushing would deploy it by accident:
>
> - `20260808010000_games_nearby_untimed_ttl.sql` — verified absent from prod
>   (`get_games_nearby` has no `starts_at is null` branch)
>
> Applied on 2026-08-10: `20260809120000_note_likes_read_path`,
> `20260810000000_drop_legacy_create_game_overload`,
> `20260810120000_unified_feed_gender_gate`.

To apply a single migration deliberately, pass the **file** — do not inline it:

```bash
supabase db query --linked -f supabase/migrations/<file>.sql
```

Inlining with `"$(cat …)"` fails: every migration here opens with a `--` comment, and the
CLI parses that leading `--` as a flag (`Unrecognized flag: -- Drop the legacy …`).

Then confirm PostgREST picked up any signature change:

```sql
notify pgrst, 'reload schema';
```

## Verifying a migration before applying it

Never wrap a check in `begin; … rollback;` through the CLI — the CLI does not hold the
transaction across statements. Instead create the candidate object into `pg_temp`, which
gives you Postgres's full parse and return-type check against real production types with
zero net change:

```sql
create function pg_temp.probe(...) returns ... language sql as $$ ... $$;
```

For a `drop`, verify the target resolves to exactly one object first:

```sql
select oid::regprocedure from pg_proc
where proname = '<name>' and pronargs = <n> and pronamespace = 'public'::regnamespace;
```

## Known gaps

- **`get_unified_feed` skips the gender gate.** It lists games that `get_games_nearby`
  and `get_live_nearby` deliberately hide. Found 2026-08-10, knowingly not fixed.
- The SQL Editor snippets in the Supabase dashboard are **historical scratch**, not a
  source of truth. Production is ahead of them. See `SCHEMA_CHANGELOG.md`.
