#!/usr/bin/env node
// Docker-free schema dump for Supabase.
//
// `supabase db dump` requires Docker; this machine has none. This script pulls the
// same information through `supabase db query --linked` (Management API, no Docker,
// no DB password) and assembles a rebuildable DDL file.
//
// Postgres generates most DDL itself (pg_get_functiondef / indexdef /
// pg_get_constraintdef / pg_get_triggerdef), so only column lists are hand-assembled.
// Extension-owned objects (PostGIS, pg_trgm, ...) are excluded via pg_depend deptype='e'.
//
//   node scripts/dump-schema.mjs > supabase/schema.sql
//
// Reads nothing from .env — auth comes from the linked Supabase CLI session.

import { execFileSync } from "node:child_process";

/** Run one SQL statement through the Supabase CLI and return its rows. */
function q(sql) {
  const raw = execFileSync("supabase", ["db", "query", "--linked", sql], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error(`No JSON in output:\n${raw}`);
  return JSON.parse(raw.slice(start, end + 1)).rows ?? [];
}

/** Collapse a result set down to its single column, one entry per row. */
const col = (rows, name) => rows.map((r) => r[name]).filter(Boolean);

const NOT_FROM_EXTENSION = `
  not exists (
    select 1 from pg_depend d
    where d.objid = p.oid and d.deptype = 'e'
  )`;

const sections = [];
const section = (title, lines) => {
  if (!lines.length) return;
  sections.push(`-- ${"=".repeat(70)}\n-- ${title}\n-- ${"=".repeat(70)}\n\n${lines.join("\n\n")}`);
};

// ---------------------------------------------------------------- extensions
section(
  "Extensions",
  col(
    q(`select 'create extension if not exists ' || quote_ident(extname) || ';' as ddl
       from pg_extension where extname <> 'plpgsql' order by extname;`),
    "ddl"
  )
);

// -------------------------------------------------------------------- tables
// Columns are assembled by hand: format_type gives the type, pg_get_expr the
// default, attgenerated 's' marks a STORED generated column (which must not also
// emit a DEFAULT clause).
section(
  "Tables",
  col(
    q(`select 'create table if not exists public.' || quote_ident(c.relname) || ' (' || E'\\n'
         || string_agg(
              '  ' || quote_ident(a.attname) || ' ' || format_type(a.atttypid, a.atttypmod)
              || case
                   when a.attgenerated = 's'
                     then ' generated always as (' || pg_get_expr(ad.adbin, ad.adrelid) || ') stored'
                   when ad.adbin is not null
                     then ' default ' || pg_get_expr(ad.adbin, ad.adrelid)
                   else ''
                 end
              || case when a.attnotnull then ' not null' else '' end,
              ',' || E'\\n' order by a.attnum)
         || E'\\n' || ');' as ddl
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
       left join pg_attrdef ad on ad.adrelid = c.oid and ad.adnum = a.attnum
       where n.nspname = 'public' and c.relkind = 'r'
         and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')
       group by c.relname order by c.relname;`),
    "ddl"
  )
);

// --------------------------------------------------------------- constraints
// contype ordering puts primary/unique before foreign keys so the file replays cleanly.
section(
  "Constraints",
  col(
    q(`select 'alter table public.' || quote_ident(c.relname)
         || ' add constraint ' || quote_ident(con.conname)
         || ' ' || pg_get_constraintdef(con.oid) || ';' as ddl
       from pg_constraint con
       join pg_class c on c.oid = con.conrelid
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and not exists (select 1 from pg_depend d where d.objid = con.oid and d.deptype = 'e')
       order by case con.contype when 'p' then 0 when 'u' then 1 when 'c' then 2 else 3 end,
                c.relname, con.conname;`),
    "ddl"
  )
);

// ------------------------------------------------------------------- indexes
// Constraint-backed indexes are already emitted above, so skip them here.
section(
  "Indexes",
  col(
    q(`select replace(i.indexdef, 'CREATE INDEX', 'CREATE INDEX IF NOT EXISTS') || ';' as ddl
       from pg_indexes i
       where i.schemaname = 'public'
         and not exists (
           select 1 from pg_constraint con
           join pg_class c on c.oid = con.conrelid
           where con.conname = i.indexname and c.relname = i.tablename)
       order by i.tablename, i.indexname;`),
    "ddl"
  )
);

// ----------------------------------------------------------------- functions
section(
  "Functions",
  col(
    q(`select rtrim(pg_get_functiondef(p.oid), E'\\n') || ';' as ddl
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prokind in ('f', 'p') and ${NOT_FROM_EXTENSION}
       order by p.proname, pg_get_function_identity_arguments(p.oid);`),
    "ddl"
  )
);

// ------------------------------------------------------------------ triggers
section(
  "Triggers",
  col(
    q(`select pg_get_triggerdef(t.oid) || ';' as ddl
       from pg_trigger t
       join pg_class c on c.oid = t.tgrelid
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and not t.tgisinternal
       order by c.relname, t.tgname;`),
    "ddl"
  )
);

// ----------------------------------------------------------------------- RLS
section(
  "Row Level Security",
  col(
    q(`select 'alter table public.' || quote_ident(c.relname)
         || ' enable row level security;' as ddl
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
       order by c.relname;`),
    "ddl"
  )
);

section(
  "Policies",
  col(
    q(`select 'create policy ' || quote_ident(policyname)
         || ' on public.' || quote_ident(tablename)
         || ' as ' || permissive
         || ' for ' || cmd
         || ' to ' || array_to_string(roles, ', ')
         || coalesce(' using (' || qual || ')', '')
         || coalesce(' with check (' || with_check || ')', '')
         || ';' as ddl
       from pg_policies where schemaname = 'public'
       order by tablename, policyname;`),
    "ddl"
  )
);

// ------------------------------------------------------------------- grants
section(
  "Grants — tables",
  col(
    q(`select 'grant ' || string_agg(distinct lower(privilege_type), ', ')
         || ' on public.' || quote_ident(table_name) || ' to ' || quote_ident(grantee) || ';' as ddl
       from information_schema.role_table_grants
       where table_schema = 'public' and grantee in ('anon', 'authenticated', 'service_role')
       group by table_name, grantee order by table_name, grantee;`),
    "ddl"
  )
);

section(
  "Grants — functions",
  col(
    q(`select 'grant execute on function public.' || p.proname
         || '(' || pg_get_function_identity_arguments(p.oid) || ') to ' || quote_ident(g.grantee) || ';' as ddl
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       cross join lateral (
         select unnest(array['anon','authenticated','service_role']) as grantee
       ) g
       where n.nspname = 'public' and p.prokind = 'f' and ${NOT_FROM_EXTENSION}
         and has_function_privilege(g.grantee, p.oid, 'execute')
       order by p.proname, g.grantee;`),
    "ddl"
  )
);

// -------------------------------------------------------------- realtime pub
section(
  "Realtime publication",
  col(
    q(`select 'alter publication supabase_realtime add table public.'
         || quote_ident(tablename) || ';' as ddl
       from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public'
       order by tablename;`),
    "ddl"
  )
);

const header = `-- FUN sports map — production schema baseline
--
-- GENERATED FILE. Do not hand-edit; regenerate with:
--     node scripts/dump-schema.mjs > supabase/schema.sql
--
-- Captured from the linked Supabase project via Postgres introspection
-- (\`supabase db dump\` needs Docker, which this machine does not have).
--
-- This is the BASE. Apply supabase/migrations/*.sql in filename order on top of it.
-- Extension-owned objects (PostGIS, pg_trgm) are intentionally excluded — the
-- \`create extension\` statements below bring them back.
--
-- Generated: ${new Date().toISOString()}

set search_path = public;
`;

process.stdout.write(`${header}\n${sections.join("\n\n")}\n`);
