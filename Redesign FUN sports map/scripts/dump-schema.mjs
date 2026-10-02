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

// ----------------------------------------------------------------- comments
// COMMENT ON is documentation that lives in the database (migrations set it, and
// Supabase Studio shows it). Without this section a rebuild from schema.sql would
// silently lose every table/column/function comment.
section(
  "Comments",
  col(
    q(`select 'comment on table public.' || quote_ident(c.relname)
         || ' is ' || quote_literal(d.description) || ';' as ddl
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       join pg_description d on d.objoid = c.oid and d.objsubid = 0
       where n.nspname = 'public' and c.relkind = 'r'
         and not exists (select 1 from pg_depend dep where dep.objid = c.oid and dep.deptype = 'e')
       order by c.relname;`),
    "ddl"
  ).concat(
    col(
      q(`select 'comment on column public.' || quote_ident(c.relname) || '.' || quote_ident(a.attname)
           || ' is ' || quote_literal(d.description) || ';' as ddl
         from pg_description d
         join pg_class c on c.oid = d.objoid
         join pg_namespace n on n.oid = c.relnamespace
         join pg_attribute a on a.attrelid = c.oid and a.attnum = d.objsubid
         where n.nspname = 'public' and c.relkind = 'r' and d.objsubid > 0
           and not exists (select 1 from pg_depend dep where dep.objid = c.oid and dep.deptype = 'e')
         order by c.relname, a.attnum;`),
      "ddl"
    ),
    col(
      q(`select 'comment on function public.' || quote_ident(p.proname)
           || '(' || pg_get_function_identity_arguments(p.oid) || ')'
           || ' is ' || quote_literal(d.description) || ';' as ddl
         from pg_description d
         join pg_proc p on p.oid = d.objoid
         join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and ${NOT_FROM_EXTENSION}
         order by p.proname;`),
      "ddl"
    )
  )
);

// --------------------------------------------------------------- privileges
// Exact privileges for the API roles (anon, authenticated, service_role) and PUBLIC,
// read from the ACLs themselves.
//
// Grants alone are not enough. Supabase's default privileges hand ALL on every new
// table, and EXECUTE on every new function, to all three API roles, so a replay that
// only adds grants silently undoes every migration that revoked something: anon would
// get SELECT on games.invite_token back, and every member-only RPC would be callable by
// guests. So each object is reset for those roles first, then granted exactly what
// production has. REVOKE on a table also clears its column privileges, which is why
// the column grants come after the table ones.
const API_ROLES = `('public', 'anon', 'authenticated', 'service_role')`;
const ROLE_NAME = (oidExpr) =>
  `case when ${oidExpr} = 0 then 'public' else (select quote_ident(rolname) from pg_roles where oid = ${oidExpr}) end`;
const PUBLIC_TABLES = `
  select c.oid, c.relname, c.relowner, c.relacl
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')`;

section(
  "Privileges — tables",
  col(
    q(`with t as (${PUBLIC_TABLES}),
       granted as (
         select t.relname, a.privilege_type, ${ROLE_NAME("a.grantee")} as role
         from t cross join lateral aclexplode(coalesce(t.relacl, acldefault('r', t.relowner))) a
       )
       select ddl from (
         select relname, 0 as ord, '' as role,
                'revoke all on table public.' || quote_ident(relname)
                  || ' from public, anon, authenticated, service_role;' as ddl
         from t
         union all
         select relname, 1, role,
                'grant ' || string_agg(lower(privilege_type), ', ' order by privilege_type)
                  || ' on table public.' || quote_ident(relname) || ' to ' || role || ';'
         from granted where role in ${API_ROLES}
         group by relname, role
       ) s
       order by relname, ord, role;`),
    "ddl"
  )
);

section(
  "Privileges — columns",
  col(
    q(`with t as (${PUBLIC_TABLES}),
       granted as (
         select t.relname, att.attname, att.attnum, a.privilege_type, ${ROLE_NAME("a.grantee")} as role
         from t
         join pg_attribute att
           on att.attrelid = t.oid and att.attnum > 0 and not att.attisdropped and att.attacl is not null
         cross join lateral aclexplode(att.attacl) a
       )
       select 'grant ' || lower(privilege_type)
                || ' (' || string_agg(quote_ident(attname), ', ' order by attnum) || ')'
                || ' on table public.' || quote_ident(relname) || ' to ' || role || ';' as ddl
       from granted where role in ${API_ROLES}
       group by relname, privilege_type, role
       order by relname, privilege_type, role;`),
    "ddl"
  )
);

section(
  "Privileges — functions",
  col(
    q(`with f as (
         select p.oid, p.proowner, p.proacl,
                'public.' || quote_ident(p.proname)
                  || '(' || pg_get_function_identity_arguments(p.oid) || ')' as sig
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.prokind = 'f' and ${NOT_FROM_EXTENSION}
       ),
       granted as (
         select f.sig, ${ROLE_NAME("a.grantee")} as role
         from f cross join lateral aclexplode(coalesce(f.proacl, acldefault('f', f.proowner))) a
         where a.privilege_type = 'EXECUTE'
       )
       select ddl from (
         select sig, 0 as ord, '' as role,
                'revoke all on function ' || sig || ' from public, anon, authenticated, service_role;' as ddl
         from f
         union all
         select sig, 1, role, 'grant execute on function ' || sig || ' to ' || role || ';'
         from granted where role in ${API_ROLES}
       ) s
       order by sig, ord, role;`),
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
