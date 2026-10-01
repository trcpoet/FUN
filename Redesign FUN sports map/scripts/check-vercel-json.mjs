#!/usr/bin/env node
// Validates vercel.json against Vercel's published schema — the first thing a deploy
// checks, and something `npm run build` never reads.
//
// A file Vercel rejects fails the deploy and leaves the previous one serving, which
// looks exactly like the change silently not working. That is what bd73cd9 fixed: a
// "//" comment key inside a rewrite, which the schema forbids.
//
//   npm run check:vercel
//
// The schema declares draft-04 but uses later keywords (`const`, a numeric
// `exclusiveMinimum`), so strict draft-04 validators reject the schema itself. It is
// validated as draft-07 with `$schema` removed instead. Fetched live, so the check
// follows Vercel's rules as they change; needs network.

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SCHEMA_URL = "https://openapi.vercel.sh/vercel.json";
const configPath = join(dirname(fileURLToPath(import.meta.url)), "..", "vercel.json");

const res = await fetch(SCHEMA_URL);
if (!res.ok) {
  console.error(`Could not fetch ${SCHEMA_URL}: HTTP ${res.status}`);
  process.exit(1);
}
const schema = await res.json();
delete schema.$schema;

const schemaPath = join(mkdtempSync(join(tmpdir(), "vercel-schema-")), "vercel.schema.json");
writeFileSync(schemaPath, JSON.stringify(schema));

try {
  execFileSync(
    "npx",
    ["--yes", "ajv-cli@5.0.0", "validate", "--spec=draft7", "--strict=false", "--all-errors",
      "-s", schemaPath, "-d", configPath],
    { stdio: "inherit" }
  );
} catch {
  console.error("vercel.json does not match Vercel's schema — Vercel would reject this deploy.");
  process.exit(1);
}
