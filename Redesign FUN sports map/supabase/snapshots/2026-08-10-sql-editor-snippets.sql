-- ============================================================================
-- ARCHIVE ONLY — DO NOT RUN THIS FILE.
-- ============================================================================
-- Verbatim capture of the SQL Editor snippets from the Supabase dashboard
-- (project gdzhyhmqufqmcdsvvotj), taken 2026-08-10 before deleting them there.
--
-- This is kept for INTENT and HISTORY only. It is NOT a source of truth and it
-- is NOT replayable:
--
--   * Several snippets are broken. "Create and Fix Game RPCs and Support
--     Columns" declares `sport text` but its body inserts `p_sport`, and it
--     opens by dropping EVERY create_game overload with cascade. Running it
--     destroys the working function.
--   * "Substitute Queue Join/Leave Logic" contains a join_game that will not
--     compile (missing `then ... end if;`).
--   * Statements appear in dashboard order, not dependency order, so some
--     reference objects a later snippet creates.
--
-- To rebuild the database use supabase/schema.sql + supabase/migrations/*.sql.
--
-- Verified before archiving: all 44 functions and 21 tables these snippets
-- create exist in production AND in supabase/schema.sql. Nothing here is the
-- last copy of anything.
--
-- See supabase/SCHEMA_CHANGELOG.md for the per-snippet triage.
-- ============================================================================

Base directory for this skill: /private/tmp/claude-501/bundled-skills/2.1.225/02b9a6f69a5ffcfa497fdfc141d71b56/design-sync

# Sync a design system to claude.ai/design

## What this is for

**Claude Design** (claude.ai/design) is Claude's design tool: users prompt a design agent and it builds working UI — screens, flows, prototypes — rendered live in the browser from real React code. Out of the box it designs with generic components. This skill changes that: it converts the user's design-system repo into the format Claude Design consumes and uploads it, so from then on **the design agent builds with the customer's actual components** — every design it produces is on-brand, made of their real parts, and maps 1:1 onto code their engineers can ship.

That framing should drive every judgment call in this skill, because each uploaded artifact is an input to that agent (or to the humans steering it):

| Uploaded artifact | Consumed by | For |
|---|---|---|
| `_ds_bundle.js` + `_vendor/` | the design agent's runtime | every design it produces renders these real compiled components from `window.<globalName>.*` |
| `styles.css`, `fonts/`, `tokens/`, `_ds_bundle.css` | every rendered design | the look — tokens, fonts, and component styles, all reachable from `styles.css`'s `@import` closure (designs receive only that closure) |
| `<Name>.d.ts` (`<Name>Props`) | the design agent | the API contract it codes against |
| `<Name>.prompt.md` | the design agent | its usage reference — how to compose the component, with examples |
| `<Name>.html` preview card | humans in the component picker | how they find components and trust the sync |
| `_ds_sync.json` | future syncs | the sync anchor — content hashes that let a re-sync (any machine) skip re-verifying unchanged components AND compute exactly what to upload/delete |

This is why fidelity is the whole game: a component that renders wrong here renders wrong in **every design the agent ever builds with it**, and a wrong `.d.ts` or misleading `.prompt.md` makes the agent misuse the API everywhere. The verification loops in the sub-skills exist because of this — they are not bureaucracy.

The converter builds all of the above deterministically from the repo's own `dist/`. With a Storybook, previews come from the repo's stories and are verified against its own storybook render (kept as a local reference, never uploaded). Without one, every component still ships fully functional, and rich previews are authored from the repo's own usage examples for the components the user scopes in, graded on an absolute rubric. **Core principle: ship what the customer already built** — the bundle is their compiled `dist/`, never a reimplementation.

You have a `DesignSync` tool that reads and writes the user's claude.ai/design projects. If a tool call fails with an authorization error, relay its guidance to the user verbatim — the tool's message is environment-aware (in an interactive terminal it names `/design-login`; in headless sessions like claude.ai/code it points at a path that works there) — and retry after they've acted on it.

## 0. First sync? Set expectations before any work

A completed sync always leaves `.design-sync/config.json` holding both a `projectId` and a `pkg`. If both are present, this is a re-sync — skip this section (§2 covers honoring prior state). (If `design-sync.config.json` exists instead — the config's old name and location — move it: `mkdir -p .design-sync && mv -n design-sync.config.json .design-sync/config.json`, commit the move, then apply the same test.) Anything less — no config at all, or a partial one left by a run that never finished — gets first-time treatment: tell the user up front, before doing anything else:

- No completed sync was found — this is a first-time import.
- This skill attempts a **high-fidelity** import of their design system: by default that means iterating on the build and visually verifying the quality of every component preview, which can take **up to a few hours** on a large repo.
- They can interrupt at any time — a message mid-run to check progress or redirect the effort is welcome and won't break anything.
- A first-time import goes into a **new Claude Design project created for it** (§1). Everything that needs their approval happens **near the start** — creating that project, and one approval that covers this run's uploads into it. After that, **verified components appear in the project as the run progresses**: they can open the project at any time and watch it fill in, and nothing waits on their approval at the end.
- The run records config and notes as it goes, so future syncs are faster and mostly deterministic.

(If §1 routes this run into an existing project — the user re-adopting one, or a `projectId` left pinned by an aborted run — parts of this won't apply; scale the expectations to what §1 routes them to.)

Then confirm they want to proceed — this process can use a significant number of tokens (`AskUserQuestion`: proceed with the full high-fidelity sync, or adjust scope first). If their request already acknowledged the time/cost, note that and continue without re-asking.

## 1. Pick the target project

If `DesignSync` isn't already in your tool list, load it via `ToolSearch(query: "select:DesignSync")` first. A target gets picked one of three ways, in precedence order:

- **Pinned**: `.design-sync/config.json` has a `projectId` → that's the target. `DesignSync(get_project)` to confirm it still exists and is `PROJECT_TYPE_DESIGN_SYSTEM`, mention which project you're syncing to, and re-ask only if it's gone or the user redirects.
- **Fresh — the first-time default**: no pin → **create a new project**. A fresh project is the only target whose entire contents this run owns; that ownership is what makes the incremental upload (§3) safe to approve in one shot, and it's why existing projects are never offered here — pouring a first import into a project that already has files would show a half-imported mix to anyone using it, with no sync anchor to tell its files apart from this run's. Use `DesignSync(list_projects)` to pick a NON-colliding name (a duplicate gets rejected and costs a round-trip), confirm the name via `AskUserQuestion`, and only then call `DesignSync(create_project)` — it raises its own permission prompt, and an unconfirmed creation can stall an unattended session. If that prompt is denied, stop and ask the user what to do differently; never retry unasked, never continue without a target. One salvage case: a project evidently left by a prior aborted run of this repo (it has the name this skill would propose — `list_files` it to confirm it's actually empty, since `list_projects` shows no file counts) may be offered for reuse instead of creating another, or noted as safe to delete.
- **Re-adopted — on the user's explicit ask only**: the user names an existing project (by name or UUID; typically re-adopting the project a previous sync uploaded to, after the config was lost). `DesignSync(get_project)`, check `type` is `PROJECT_TYPE_DESIGN_SYSTEM`, then warn them in plain language (no tool jargon) that syncing can overwrite or delete files already in it — e.g. "Heads up: syncing into that existing project means I may replace or remove files it already contains so it ends up matching this repo. If anything in there isn't from this repo, it could be lost — want me to continue, or create a fresh project instead?" — and proceed only on their confirmation. This explicit ask is the ONLY way an unpinned run ends up in a pre-existing project.

**Record the pin at settlement.** The moment the target is settled — created, reused, or re-adopted — **record its `projectId` in `.design-sync/config.json`**, before anything uploads. This is the skill's one recording rule: a death at any later point leaves a pinned config, so the retry repairs the SAME project through the atomic path instead of creating a duplicate and orphaning the original. (The post-upload record step in the sub-skills' atomic sections is just the backstop for this rule.)

**Route the upload path.** A `projectId` pinned **before this run started** always takes the **atomic path** (the sub-skill's upload section) — even when its project turns out empty; a bulk re-upload is fine there, and one rule beats a special case. Otherwise the remote decides, via a prompt-free `DesignSync(list_files)` on the target:

- **Empty** (the normal case — this run just created it) → **incremental path** (§3): one upfront approval, then verified components upload as the run progresses.
- **Non-empty** (a re-adopted project) → **atomic path**: it may be in active use, so it updates in one pass at the end of the run, after everything is verified.

The router decides only the **upload** path. **Verification** scope is the anchor's job: a project with `_ds_sync.json` lets the re-sync driver skip unchanged components; no anchor means everything gets verified, whichever upload path applies.

## 2. Explore, then write config

The workflow is **explore the repo → write `.design-sync/config.json` (§1's pin has already created the directory and the file — read it and add to it, never dropping `projectId`; `mkdir -p .design-sync` stays as a harmless safety net for legacy states) → run the converter deterministically from it**. The converter's discovery is heuristic-based; each heuristic has a config override (after the sub-skill stages the scripts: `grep -r ASSUMPTION .ds-sync/*.mjs .ds-sync/lib/*.mjs` lists them) so repos that don't match the defaults write config, not code. Edit `lib/*.mjs` only as a last resort (see the sub-skill's escape-hatch section: storybook §5, package §Troubleshooting).

**The upload format is the contract; the converter is the deterministic path to it, not the only path.** What the app consumes is fully specified by the output layout: `_ds_bundle.js` + `@ds-bundle` header, `styles.css`, `components/<group>/<Name>/{.html,.jsx,.d.ts,.prompt.md}` with the `@dsCard` first line, `_preview/`, `_vendor/`, `fonts/`, `_ds_sync.json` (see the sub-skill's layout and upload sections).

An off-script layout should also produce `_ds_sync.json` when it can. For the package shape, `lib/sync-hashes.mjs` gives `styleShaFor`/`renderHashFor`/`sourceKeyFor`; the envelope is `{shape, styleSha, renderHashes, sourceKeys, keyRecipe, scriptsSha, sourceHashes, auxSha, bundleSha12}` (see the sidecar block in `package-build.mjs` — `sourceHashes` itself comes from `stampHeader` in `lib/bundle.mjs`; `sourceKeys` may be omitted, which just means changed artifacts re-verify). The storybook shape's recipe needs story facts an off-script generator may not have; omitting the sidecar is then the honest choice — the next sync simply has no anchor and re-verifies everything, which is correct.

One invariant that's easy to miss when producing the layout by hand: rendered designs receive only `styles.css`'s transitive `@import` closure. Any real component CSS (`_ds_bundle.css`) must be `@import`ed from `styles.css` — a card linking it directly proves nothing about designs.

For a repo genuinely outside the converter's envelope (non-esbuild-bundlable builds, exotic toolchains), produce the layout by whatever means the repo allows. The gates don't move: `package-validate.mjs` must exit clean, and every story must be graded before upload — from true screenshot pairs in the storybook shape, on the absolute rubric in the package shape. Off-script generation is legitimate; off-script *verification* is not.

**State from prior runs.** If `.design-sync/config.json` or `.design-sync/NOTES.md` already exist, Read both first and honor what's there — they hold corrections from earlier syncs. **Whenever the user tells you about an issue mid-run** (a path, a build flag, a component to skip, a package-manager quirk), persist it immediately so the next sync doesn't need telling again: a value that maps to a `cfg.*` field goes into `.design-sync/config.json`; anything else goes as a bullet in `.design-sync/NOTES.md`. Both get committed at the end (the sub-skill says when).

1. **Faithful install with the repo's own package manager.** Use the repo's pinned node version (`.nvmrc` / `engines.node`), then detect via lockfile: `yarn.lock` → `yarn install --immutable`; `pnpm-lock.yaml` → `pnpm i --frozen-lockfile`; `bun.lockb`/`bun.lock` → `bun install --frozen-lockfile`; `package-lock.json` → `npm ci`.
2. **Determine the source shape.** If `.design-sync/config.json` already exists and has a `"shape"` field, use that. Otherwise `Glob` for `**/.storybook/main.*` and `**/storybook/main.*` (some repos drop the dot; exclude `node_modules`) — monorepo DSes keep it in a subpackage, so never assume it's at repo root:
   - Any match → `shape = 'storybook'`. The match's grandparent is the package to run from. Found several → `AskUserQuestion` which one is the design system's; that dir becomes `storybookConfigDir`. **Do not fall back to package just because `.storybook` isn't at repo root.**
   - Found `*.stories.*` files but no `.storybook/` dir in the target → `AskUserQuestion`: "Found story files but no `.storybook/` here — is there a Storybook config elsewhere in this repo (e.g. `apps/storybook/.storybook` in a monorepo)?" If they point at one → `shape = 'storybook'`, record that path as `storybookConfigDir`. If they say no → `shape = 'package'`.
   - No `.storybook/` and no `*.stories.*` → `AskUserQuestion` whether a Storybook exists at all. If they point at one, record it as `storybookConfigDir` and `shape = 'storybook'`. If no, `shape = 'package'`.

Then `Read` `<skill-base-dir>/storybook/SKILL.md` or `<skill-base-dir>/non-storybook/SKILL.md` and follow it from there (the storybook one points back into the package one's shared tables where they overlap). Record `"shape"` (and `"storybookConfigDir"` when set) in `.design-sync/config.json` when you write it so re-sync skips detection. Both shapes run `<skill-base-dir>/package-build.mjs` as the converter entry and `<skill-base-dir>/resync.mjs` as the single re-sync driver (build → diff → validate → scoped capture, one verdict JSON); shared adapters live at `<skill-base-dir>/lib/`, and `<skill-base-dir>/storybook/` holds the storybook-only harness (`compare.mjs` — preview-vs-storybook matching; `probe.mjs` — provider inference fallback).

## 3. The incremental upload sequence (first syncs into an empty project)

On the incremental path (§1), the user approves the upload once, early, and then watches verified components appear in their project while the run is still going — instead of waiting hours for one bulk upload at the end. This section is the shared mechanics; the sub-skill says **when** each step fires (its own build and verification gates, marked "incremental path" there). The sub-skill upload section's mechanics apply to every write here too: ≤256 files per `write_files` call and smaller chunks for binary-heavy dirs, upload hygiene, and the what-stays-local list.

### Open the upload channel — at the sub-skill's first-clean-build gate

1. **Explain the approval in plain language first.** Before asking, tell the user what they're about to approve, with no tool jargon (no "plan", "glob", or tool-method names): e.g. *"I'll ask for one approval now that covers uploading everything this run produces into the new project — and cleaning up any files a later rebuild drops. You won't be prompted again; components will appear in the project as they're verified."* The approval dialog shows a structured path list on its own; this message is what makes that dialog make sense to someone who's never synced before.
2. `DesignSync(finalize_plan)` with `localDir: "./ds-bundle"`, `writes: ["components/**", "tokens/**", "fonts/**", "_vendor/**", "_preview/**", "guidelines/**", "_ds_bundle.js", "_ds_bundle.css", "styles.css", "README.md", "_ds_sync.json", "_ds_needs_recompile"]`, and `deletes: ["components/**", "tokens/**", "fonts/**", "_vendor/**", "_preview/**", "guidelines/**"]`. The delete globs are what make the end-of-run reconciliation below prompt-free — and they're consent-trivial here: the project started empty, so anything deletable is something this same run uploaded. The returned `planId` serves the whole run (it lives for the session). Lost mid-run to a context reset → `finalize_plan` again, one fresh approval, before uploading anything more. A whole-session death doesn't resume this path at all: the retry arrives pinned (§1) and correctly goes atomic — expected, not a bug to work around.
3. **If the approval is denied, stop and ask — never continue silently, never re-prompt unasked.** Say in plain language what was denied and what it covered ("the one-time approval for uploading this run's output into the new project"), then offer: try the approval again; target a different project; or finish the build and verification locally with no upload. Local-only → the run proceeds normally except nothing uploads, and the end-of-run report hands over both the `ds-bundle/` path and the project's URL (`https://claude.ai/design/p/<projectId>` — the pin is already recorded, so a later sync finds this project rather than orphaning it). A different project → it goes through §1's re-adoption ask and the router like any other explicit choice, pin included: non-empty → atomic path, this plan abandoned; empty → resume here with a fresh approval.
### Push each verified batch

Nothing uploads until the first batch of components passes the sub-skill's done-bar. **The first push carries the shared base files together with that first batch**: `_ds_bundle.js`, `_ds_bundle.css`, `styles.css`, `README.md`, `_vendor/**`, `tokens/**`, `fonts/**`, `guidelines/**`, plus the batch's `components/<group>/<Name>/` dirs and `_preview/<Name>.*` files. Two reasons they travel together: the first thing the user sees in the project is real components, not an empty shell that claims something was uploaded — and by first-batch time the shared files have earned their place, because grading those components exercised the very same bundle, CSS, and fonts. This first push is the project's first content and its largest, so it takes the full fence: sentinel first (`write_files` `_ds_needs_recompile` — it fences the app's manifest/copy machinery against a half-uploaded state), then the files, then the sentinel re-write (every push on this path ends by re-writing the sentinel — that's what makes the app refresh its view of the project next time it's opened). Output the project URL prominently with this push — `https://claude.ai/design/p/<projectId>` — it's the moment the project first has something to see.

Every later batch that passes the done-bar: `write_files` its `components/<group>/<Name>/` dirs and `_preview/<Name>.*` files, then re-write the sentinel — the new cards appear next time the user opens or refreshes the project. When you report batch progress, include the project URL so the new cards are one click away. If a full rebuild has run since the last push (a global config fix landed), include the shared base files again: the fix rewrote the bundle/CSS/fonts locally, and without re-pushing them every component verified after it renders against stale remote versions until close-out. They're in the approved plan and idempotent, so the re-push costs nothing.

Later batch pushes need no leading fence — they're short and always end re-armed, so the unfenced window is negligible (the first push above and the long close-out below are the ones that fence first). And batches are progressive visibility, not the correctness mechanism: the close-out guarantees the final state, so don't agonize over batch composition — a component pushed early then reworked later simply gets re-pushed.

### Close out — after the sub-skill's final gate

1. **Sentinel first, then full content writes.** Re-write `_ds_needs_recompile` before anything else — the app clears the sentinel whenever the user opens the project (which this path invites mid-run), and the close-out is the longest write+delete stretch, so re-fencing here is what keeps a half-applied state from ever being consumed. Then everything in the plan's writes EXCEPT `_ds_sync.json`, chunked. Re-uploading unchanged files is idempotent and cheap; this pass covers anything the batches missed and anything the final rebuild changed, so the project ends up exactly matching the final verified build no matter how the batches went.
2. **Reconciliation deletes — mandatory, not conditional.** `DesignSync(list_files)` the project and `delete_files` every remote path under `components/`, `_preview/`, `tokens/`, `fonts/`, `_vendor/`, `guidelines/` that the final `ds-bundle/` does not contain (the plan's delete globs cover them — no new prompt). Why this pass exists: a component uploaded by an earlier batch and then dropped, renamed, or regrouped later in the run is invisible to every future re-sync diff — anchor-based diffs only see what the anchor records — so this is the only moment it can ever be cleaned up; skip it and the orphan is permanent. The deletes also retire the orphan's card: the app rebuilds its component index from the currently-uploaded files, so the card disappears once the sentinel is re-armed (next step) and the project is opened.
3. **Sentinel re-arm, then `_ds_sync.json` absolutely last**, in its own `write_files` call — same rule, same reason as the atomic path: the anchor must only ever vouch for a fully-applied state, and it goes after the deletes so a failed delete can't leave remote files the anchor no longer sees. Then output the project URL — `https://claude.ai/design/p/<projectId>` — with the final summary.

A mid-run abort anywhere on this path (user stops the run, session dies) leaves the project **un-anchored** — the documented safe state: the next sync re-verifies everything and re-uploads, nothing silently rots. And as in the sub-skill upload sections, any write/delete failure that retries don't clear means **STOP** — no sentinel re-arm, no `_ds_sync.json`.

## Author the conventions header

You've just spent real effort making this design system's previews render — working out how components must be wrapped, what provider and theme setup they need, what load order matters, and which mistakes silently produce unstyled output. That knowledge evaporates when the sync ends unless you write it down here, for a very specific reader.

**Who reads it.** The file you author is prepended to the generated README (via the `readmeHeader` config key) and inlined into the system prompt of a *design agent* — a model that builds apps WITH this component library, hundreds of times, for users who never see this file. It won't make storybook previews, run this repo's build, or read its source; it gets the README and the bound artifacts, nothing else. An agent in that position follows concrete, enumerated guidance and cannot follow guidance that isn't there: name the tokens and it uses tokens; leave the class vocabulary unnamed and it won't guess at yours — it will invent its own. Say to wrap in the provider and it wraps; don't, and it mostly won't. So every sentence must pass one test: *could the design agent act on this without guessing?* ("Follow the design system's conventions" fails that test; delete it and write the convention.)

**What to write** — four concerns, in whatever structure serves this DS:

- **Wrapping and setup.** If components need a provider/root wrapper to be styled (it's usually where the tokens and theme live), name it, say what breaks without it, and show the wrap in a minimal snippet — plus theme setup, load order, and any gotcha that cost you a preview debugging cycle. Filter by the reader's job: it builds apps, not previews — harness-specific setup (storybook quirks, scaffolding) goes to NOTES.md; what matters for building with the components goes here.
- **The styling idiom, with its actual vocabulary.** Teach THIS system's idiom, never a generic one: utility-class systems get a compact family table with real names from the styling source (a Tailwind preset enumerates them exactly); prop/theme systems get "no CSS classes — style via props" with the props that carry the design language; token systems get the `var(--*)` pattern with real names. Never import an idiom the DS doesn't have.
- **Where the truth lives.** Name the stylesheet/source files the agent should read before styling (the bound copies it will have, e.g. `_ds/<folder>/styles.css` and its imports) and the per-component docs. An agent that reads the real files beats any summary — your job is making sure it knows where to look.
- **One idiomatic build snippet.** A short, real example — a library component for the control, the DS's styling idiom for the agent's own layout glue. Adapt one of your verified previews: it's code you know renders.

Across different kinds of systems that looks like (illustrative, not exhaustive): a Tailwind-preset DS → family table (`bg-surface-1`, `gap-md`, `text-body`…) + root wrapper; a grommet-style DS → no classes, `pad`/`background`/`tone` props + ThemeProvider; a chakra-style DS → theme-token strings (`color="red.500"`); a CSS-modules/BEM DS → the exported class maps and whether new names are ever legitimate; a web-components DS → slots, attributes, and registration order.

**Validate before shipping.** A conventions file that names things which don't exist is worse than none — the agent will trust it, write vocabulary that doesn't resolve, and ship silently unstyled output. Before committing: every class, token, prop, and component you enumerated must exist in the built artifacts — grep classes/tokens against the compiled stylesheets in the output dir; check named components against the `components/<group>/<Name>/` directories in the output dir (the build you just ran emits one per component — that tree is the sync-time name index; `.ds-build-meta.json` carries only counts), then the bundle text (authoritative — e.g. a provider like the root wrapper ships in the bundle without a component folder) before cutting a claim. Verifies in neither → fix the name or cut it; documented in source but absent from the build → that's a NOTES.md finding, not header content.

**Budget.** Be terse — 2-4k characters covers all four concerns, and real names beat vagueness. If the build's size warning fires, read which side it names. Header-side (the header alone exceeds ~31.9k): shorten the header — it survives inline truncation only while it itself fits the ~32k window; past that, its own tail is cut and the body contributes nothing. Body-side: your conventions are safe (prepended, within-window); what's lost is the END of the generated body — typically the component index's tail. Accept that loss deliberately, or reduce the synced surface (package shape: `componentSrcMap` exclusions, a narrower `tokensGlob`; storybook shape: sync fewer stories) — there is no body-section trim knob.

**Where it lives, and reruns.** Write `.design-sync/conventions.md`, set `"readmeHeader": ".design-sync/conventions.md"`, commit both — it's deliberately human-editable. Then rebuild so the README actually carries the header — it's stitched at build time. **The rebuild rule:** the post-authoring rebuild is a fresh DRIVER run on every path — first syncs omit `--remote` — because the closing receipt and the upload plan must both describe the header-bearing build; a bare converter run wipes `.sync-diff.json` and the receipt artifacts, leaving the uploaded build unreceipted. (Every other mention of the post-authoring rebuild defers to this rule.) Whenever the file already exists — regardless of how this run was classified (re-sync, re-adoption after a lost config, recovery from a partial one): never rewrite it — re-run the validation pass against the fresh build and report any name that no longer verifies (NOTES.md + user), proposing edits. Authoring happens only when no `.design-sync/conventions.md` exists. Content belongs to its authors; your standing job is keeping it true.


## Hint

```
/backend /skills These are the database configurations I have '/Users/tahsinchowdhury/Desktop/Screenshot 2026-08-09 at 10.55.38 PM.png' at my private sql editors in supabase. Help me decide which ones I need to fix, which ones I need and are critical for my business logic, and which are redundant. -- FUN sports map – beginner-friendly Supabase schema
--
-- In Supabase: SQL Editor → New query → paste this entire file → click RUN.
-- Do NOT click "Explain" — that only works on a single statement and will error.
-- Policies use "drop if exists" so you can re-run this script without duplicate errors.

-- 1) Enable PostGIS for geo queries
create extension if not exists postgis;

-- 2) Profiles (one per user; link to Supabase Auth later)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  updated_at timestamptz default now()
);

-- 3) Games (each row = one game with a location)
create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  sport text not null,
  spots_needed int not null default 2,
  starts_at timestamptz,
  location geography(point, 4326) not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

-- 3b) Profile locations (for showing "nearby players" on the map; update from app when user moves)
create table if not exists public.profile_locations (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  updated_at timestamptz not null default now()
);

-- 4) Who joined which game (for "join" and later chat)
create table if not exists public.game_participants (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz default now(),
  unique(game_id, user_id)
);

-- 5) Index for fast geo search
create index if not exists games_location_idx on public.games using gist(location);

-- -- 5b) Get profiles near a point (for map "nearby players")
-- create or replace function public.get_profiles_nearby(
--   lat double precision,
--ble precision,
--   radius_km double precision default 5,
--   limit_count int default 50
-- )
-- returns table (
--   profile_id uuid,
--   display_name text,
--   avatar_url text,
--   lat double precision,
--   lng double precision,
--   distance_km double precision
-- )
-- language sql
-- stable
-- security definer
-- set search_path = public
-- as $$
--   select
--     p.id as profile_id,
--     p.display_name,
--     p.avatar_url,
--     pl.lat,
--     pl.lng,
--     (st_distance(st_setsrid(st_makePoint(pl.lng, pl.lat), 4326)::geography, st_setsrid(st_makePoint(lng, lat), 4326)::geography) / 1000.0) as distance_km
--   from public.profile_locations pl
--   join public.profiles p on p.id = pl.profile_id
--   where st_dwithin(st_setsrid(st_makePoint(pl.lng, pl.lat), 4326)::geography, st_setsrid(st_makePoint(lng, lat), 4326)::geography, radius_km * 1000.0)
--   order by pl.updated_at desc
--   limit limit_count;
-- $$;

-- 5c) Update current user's location (call from app when location changes)
create or replace function public.update_my_location(p_lat double precision, p_lng double precision)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Ensure profile exists (e.g. for anonymous users)
  insert into public.profiles (id, display_name)
  values (auth.uid(), 'Player')
  on conflict (id) do nothing;
  insert into public.profile_locations (profile_id, lat, lng, updated_at)
  values (auth.uid(), p_lat, p_lng, now())
  on conflict (profile_id) do update set lat = p_lat, lng = p_lng, updated_at = now();
end;
$$;

-- 6) RLS (Row Level Security)
alter table public.profiles enable row level security;
alter table public.games enable row level security;
alter table public.game_participants enable row level security;
alter table public.profile_locations enable row level security;

-- Drop existing policies so this script can be re-run safely
drop policy if exists "Profile locations viewable by everyone" on public.profile_locations;
drop policy if exists "Users can insert own profile location" on public.profile_locations;
drop policy if exists "Users can update own profile location" on public.profile_locations;
drop policy if exists "Profiles are viewable by everyone" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Games are viewable by everyone" on public.games;
drop policy if exists "Authenticated users can create games" on public.games;
drop policy if exists "Participants are viewable by everyone" on public.game_participants;
drop policy if exists "Authenticated users can join games" on public.game_participants;

-- Create policies
create policy "Profile locations viewable by everyone" on public.profile_locations for select using (true);
create policy "Users can insert own profile location" on public.profile_locations for insert with check (auth.uid() = profile_id);
create policy "Users can update own profile location" on public.profile_locations for update using (auth.uid() = profile_id);

create policy "Profiles are viewable by everyone" on public.profiles for select using (true);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);

create policy "Games are viewable by everyone" on public.games for select using (true);
create policy "Authenticated users can create games" on public.games for insert with check (auth.role() = 'authenticated');

create policy "Participants are viewable by everyone" on public.game_participants for select using (true);
create policy "Authenticated users can join games" on public.game_participants for insert with check (auth.role() = 'authenticated');

-- -- 7) Get games within X km of a point (returns lat/lng for map markers)
-- create or replace function public.get_games_nearby(
--   lat double precision,
--   lng double precision,
--   radius_km double precision default 10
-- )
-- returns table (
--   id uuid,
--   title text,
--   sport text,
--   spots_needed int,
--   starts_at timestamptz,
--   created_by uuid,
--   created_at timestamptz,
--   distance_km double precision,
--   lat double precision,
--   lng double precision
-- )
-- language sql
-- stable
-- security definer
-- set search_path = public
-- as $$
--   select
--     g.id,
--     g.title,
--     g.sport,
--     g.spots_needed,
--     g.starts_at,
--     g.created_by,
--     g.created_at,
--     (st_distance(g.location, st_point(lng, lat)::geography) / 1000.0) as distance_km,
--     st_y(g.location::geometry) as lat,
--     st_x(g.location::geometry) as lng
--   from public.games g
--   where st_dwithin(g.location, st_point(lng, lat)::geography, radius_km * 1000.0)
--   order by g.location <-> st_point(lng, lat)::geography
--   limit 50;
-- $$;

-- 8) Create a game from the client (accepts lat/lng, builds geography)
-- Required params first; only the last param has a default (PostgreSQL rule).
create or replace function public.create_game(
  p_title text,
  p_sport text,
  p_lat double precision,
  p_lng double precision,
  p_spots_needed int default 2
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated to create a game';
  end if;
  insert into public.games (title, sport, spots_needed, location, created_by)
  values (
    p_title,
    p_sport,
    coalesce(p_spots_needed, 2),
    st_setSRID(st_makePoint(p_lng, p_lat), 4326)::geography,
    auth.uid()
  )
  returning id into new_id;
  return new_id;
end;
$$;
 -- Migration: gamification, 3D avatars, notifications
-- Run AFTER the base schema.sql. Adds: avatar_id on profiles, game status/roles,
-- user_stats, badges, user_badges, notifications, game_results. Safe to run once.
-- (Uses DO blocks so ADD COLUMN is idempotent.)

-- ----- 1) Extend existing tables -----

do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'avatar_id'
  ) then
    alter table public.profiles add column avatar_id text;
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'games' and column_name = 'status'
  ) then
    alter table public.games add column status text not null default 'open'
      check (status in ('open', 'full', 'completed', 'cancelled'));
  end if;
end $$;

-- complete_game() sets games.updated_at when marking completed
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'games' and column_name = 'updated_at'
  ) then
    alter table public.games add column updated_at timestamptz not null default now();
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'game_participants' and column_name = 'role'
  ) then
    alter table public.game_participants add column role text not null default 'player'
      check (role in ('host', 'player'));
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'game_participants' and column_name = 'confirmed_result'
  ) then
    alter table public.game_participants add column confirmed_result boolean not null default false;
  end if;
end $$;

-- ----- 2) Gamification: user stats (streaks, XP, level) -----

create table if not exists public.user_stats (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  games_played_total int not null default 0,
  games_played_by_sport jsonb not null default '{}',
  current_streak_days int not null default 0,
  longest_streak_days int not null default 0,
  xp int not null default 0,
  level int not null default 1,
  last_game_date date,
  updated_at timestamptz not null default now()
);

-- ----- 3) Badges (definition table + user awards) -----

create table if not exists public.badges (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  criteria jsonb,
  created_at timestamptz default now()
);

create table if not exists public.user_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  badge_id uuid not null references public.badges(id) on delete cascade,
  awarded_at timestamptz not null default now(),
  unique(user_id, badge_id)
);

create index if not exists user_badges_user_id_idx on public.user_badges(user_id);

-- ----- 4) In-app notifications (toasts, "just joined", streaks) -----

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  payload jsonb default '{}',
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_id_idx on public.notifications(user_id);
create index if not exists notifications_user_id_unread_idx on public.notifications(user_id) where not is_read;

-- ----- 5) Game results (one row per completed game) -----

create table if not exists public.game_results (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade unique,
  winner_team_or_user text,
  score jsonb,
  confirmed_by_host boolean not null default false,
  created_at timestamptz not null default now()
);

-- ----- 6) RLS for new tables -----

alter table public.user_stats enable row level security;
alter table public.badges enable row level security;
alter table public.user_badges enable row level security;
alter table public.notifications enable row level security;
alter table public.game_results enable row level security;

drop policy if exists "User stats readable by owner" on public.user_stats;
drop policy if exists "Badges readable by everyone" on public.badges;
drop policy if exists "User badges readable by everyone" on public.user_badges;
drop policy if exists "Notifications readable by owner" on public.notifications;
drop policy if exists "Notifications updatable by owner" on public.notifications;
drop policy if exists "Game results readable by everyone" on public.game_results;

create policy "User stats readable by owner" on public.user_stats for select using (auth.uid() = user_id);
create policy "Badges readable by everyone" on public.badges for select using (true);
create policy "User badges readable by everyone" on public.user_badges for select using (true);
create policy "Notifications readable by owner" on public.notifications for select using (auth.uid() = user_id);
create policy "Notifications updatable by owner" on public.notifications for update using (auth.uid() = user_id);
create policy "Game results readable by everyone" on public.game_results for select using (true);

-- ----- 7) Update get_profiles_nearby to return avatar_id (for 3D map) -----

create or replace function public.get_profiles_nearby(
  lat double precision,
  lng double precision,
  radius_km double precision default 5,
  limit_count int default 50
)
returns table (
  profile_id uuid,
  display_name text,
  avatar_url text,
  avatar_id text,
  lat double precision,
  lng double precision,
  distance_km double precision
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id as profile_id,
    p.display_name,
    p.avatar_url,
    p.avatar_id,
    pl.lat,
    pl.lng,
    (st_distance(st_setsrid(st_makePoint(pl.lng, pl.lat), 4326)::geography, st_setsrid(st_makePoint(lng, lat), 4326)::geography) / 1000.0) as distance_km
  from public.profile_locations pl
  join public.profiles p on p.id = pl.profile_id
  where st_dwithin(st_setsrid(st_makePoint(pl.lng, pl.lat), 4326)::geography, st_setsrid(st_makePoint(lng, lat), 4326)::geography, radius_km * 1000.0)
  order by pl.updated_at desc
  limit limit_count;
$$;

-- ----- 8) create_game: add host as participant with role 'host' -----

create or replace function public.create_game(
  p_title text,
  p_sport text,
  p_lat double precision,
  p_lng double precision,
  p_spots_needed int default 2
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated to create a game';
  end if;
  insert into public.games (title, sport, spots_needed, location, created_by, status)
  values (
    p_title,
    p_sport,
    coalesce(p_spots_needed, 2),
    st_setSRID(st_makePoint(p_lng, p_lat), 4326)::geography,
    auth.uid(),
    'open'
  )
  returning id into new_id;
  insert into public.game_participants (game_id, user_id, role)
  values (new_id, auth.uid(), 'host');
  return new_id;
end;
$$;

-- ----- 9) get_games_nearby: return status (filter open/full in app or add param later) -----

create or replace function public.get_games_nearby(
  lat double precision,
  lng double precision,
  radius_km double precision default 10
)
returns table (
  id uuid,
  title text,
  sport text,
  spots_needed int,
  starts_at timestamptz,
  created_by uuid,
  created_at timestamptz,
  status text,
  distance_km double precision,
  lat double precision,
  lng double precision
)
language sql
stable
security definer
set search_path = public
as $$
  select
    g.id,
    g.title,
    g.sport,
    g.spots_needed,
    g.starts_at,
    g.created_by,
    g.created_at,
    g.status,
    (st_distance(g.location, st_point(lng, lat)::geography) / 1000.0) as distance_km,
    st_y(g.location::geometry) as lat,
    st_x(g.location::geometry) as lng
  from public.games g
  where st_dwithin(g.location, st_point(lng, lat)::geography, radius_km * 1000.0)
  order by g.location <-> st_point(lng, lat)::geography
  limit 50;
$$;

-- ----- 10) Seed a few badges (optional; run once) -----

insert into public.badges (slug, name, description, criteria)
values
  ('first_game', 'First Game', 'Played your first game.', '{"games_played_total": 1}'),
  ('ten_games', 'Regular', 'Played 10 games.', '{"games_played_total": 10}'),
  ('streak_7', 'On Fire', '7-day streak.', '{"current_streak_days": 7}'),
  ('early_bird', 'Early Bird', 'Joined a game before 9am.', null),
  ('rain_or_shine', 'Rain or Shine', 'Played in the rain.', null)
on conflict (slug) do nothing;
 -- Add optional starts_at to create_game so the app can set play time when creating a game.

create or replace function public.create_game(
  p_title text,
  p_sport text,
  p_lat double precision,
  p_lng double precision,
  p_spots_needed int default 2,
  p_starts_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated to create a game';
  end if;
  insert into public.games (title, sport, spots_needed, location, created_by, status, starts_at)
  values (
    p_title,
    p_sport,
    coalesce(p_spots_needed, 2),
    st_setSRID(st_makePoint(p_lng, p_lat), 4326)::geography,
    auth.uid(),
    'open',
    p_starts_at
  )
  returning id into new_id;
  insert into public.game_participants (game_id, user_id, role)
  values (new_id, auth.uid(), 'host');
  return new_id;
end;
$$;
 -- Migration: complete_game RPC
-- Run after 20250315000000_gamification_avatars_notifications.sql.
-- Marks a game completed, updates user_stats (streaks, XP), awards badges, and creates notifications.

create or replace function public.complete_game(
  p_game_id uuid,
  p_winner_team_or_user text default null,
  p_score jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
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
$$;
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
 select proname, pg_get_function_arguments(oid) as args
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname = 'get_games_nearby'; -- Storage: public `avatars` bucket + RLS so authenticated users can upload profile media.
-- Fixes HTTP 400 on POST /storage/v1/object/avatars/... when the bucket or policies were never created.
-- Safe to re-run (idempotent policy names).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  52428800, -- 50 MB; adjust in Dashboard if needed
  null
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = coalesce(storage.buckets.file_size_limit, excluded.file_size_limit);

-- Read: anyone can fetch public URLs (bucket is public).
drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read"
on storage.objects for select
to public
using (bucket_id = 'avatars');

-- Helper paths used by the app:
--   {user_id}/{file}           — 2D profile photo (uploadAvatarImage)
--   stories/{user_id}/{file}   — story media
--   feed/posts/{user_id}/{file} | feed/reels/{user_id}/{file} — posts & reels

drop policy if exists "avatars_authenticated_insert" on storage.objects;
create policy "avatars_authenticated_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or (
      (storage.foldername(name))[1] = 'stories'
      and (storage.foldername(name))[2] = auth.uid()::text
    )
    or (
      (storage.foldername(name))[1] = 'feed'
      and (storage.foldername(name))[2] in ('posts', 'reels')
      and (storage.foldername(name))[3] = auth.uid()::text
    )
  )
);

drop policy if exists "avatars_authenticated_update" on storage.objects;
create policy "avatars_authenticated_update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'avatars'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or (
      (storage.foldername(name))[1] = 'stories'
      and (storage.foldername(name))[2] = auth.uid()::text
    )
    or (
      (storage.foldername(name))[1] = 'feed'
      and (storage.foldername(name))[2] in ('posts', 'reels')
      and (storage.foldername(name))[3] = auth.uid()::text
    )
  )
)
with check (
  bucket_id = 'avatars'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or (
      (storage.foldername(name))[1] = 'stories'
      and (storage.foldername(name))[2] = auth.uid()::text
    )
    or (
      (storage.foldername(name))[1] = 'feed'
      and (storage.foldername(name))[2] in ('posts', 'reels')
      and (storage.foldername(name))[3] = auth.uid()::text
    )
  )
);

drop policy if exists "avatars_authenticated_delete" on storage.objects;
create policy "avatars_authenticated_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or (
      (storage.foldername(name))[1] = 'stories'
      and (storage.foldername(name))[2] = auth.uid()::text
    )
    or (
      (storage.foldername(name))[1] = 'feed'
      and (storage.foldername(name))[2] in ('posts', 'reels')
      and (storage.foldername(name))[3] = auth.uid()::text
    )
  )
);
 -- Extensible athlete identity: progressive disclosure, sport-aware sections stored as JSON.
-- PostgREST schema reload runs at the end of this file (NOTIFY pgrst). If you added the column
-- manually earlier, run in SQL Editor: NOTIFY pgrst, 'reload schema';
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'athlete_profile'
  ) then
    alter table public.profiles
      add column athlete_profile jsonb not null default '{}'::jsonb;
  end if;
end $$;

comment on column public.profiles.athlete_profile is
  'Athlete-facing profile extensions (handle, sports, metrics, experience, highlights, trust UI). Validated in app.';

-- Tell PostgREST to reload its schema cache so PATCH/SELECT see the new column immediately.
-- (If you already ran this migration before this line existed, run once in SQL Editor: NOTIFY pgrst, 'reload schema';)
notify pgrst, 'reload schema';
 -- Profile text search for unified map search (people path).
-- Requires: profiles.athlete_profile (jsonb) from 20250320000000_athlete_profile_jsonb.sql
-- Adds: generated search columns + pg_trgm indexes + search_profiles() RPC.

create extension if not exists pg_trgm;

-- Generated lowercase columns for index-friendly matching (no full-table scan on ILIKE).
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'display_name_search'
  ) then
    alter table public.profiles
      add column display_name_search text
      generated always as (lower(trim(coalesce(display_name, '')))) stored;
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'handle_search'
  ) then
    alter table public.profiles
      add column handle_search text
      generated always as (
        lower(trim(both '@' from trim(coalesce(athlete_profile->>'handle', ''))))
      ) stored;
  end if;
end $$;

create index if not exists profiles_display_name_search_trgm_idx
  on public.profiles using gin (display_name_search gin_trgm_ops);

create index if not exists profiles_handle_search_trgm_idx
  on public.profiles using gin (handle_search gin_trgm_ops)
  where length(handle_search) > 0;

comment on column public.profiles.display_name_search is
  'Lowercased display_name for trigram search; maintained by DB.';
comment on column public.profiles.handle_search is
  'Lowercased @handle from athlete_profile JSON; maintained by DB.';

-- Bounded people search: text match on name/handle, optional geo filter on profile_locations.
create or replace function public.search_profiles(
  q text,
  p_lat double precision default null,
  p_lng double precision default null,
  radius_km double precision default 80,
  limit_n int default 15,
  p_exclude uuid default null
)
returns table (
  profile_id uuid,
  display_name text,
  avatar_url text,
  handle text,
  city text,
  favorite_sport text,
  distance_km double precision,
  rank_score double precision
)
language sql
stable
security definer
set search_path = public
as $$
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
    cross join qn
    cross join ref r
    left join public.profile_locations pl on pl.profile_id = p.id
    where (p_exclude is null or p.id <> p_exclude)
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
$$;

grant execute on function public.search_profiles(text, double precision, double precision, double precision, int, uuid) to anon, authenticated;
 -- Per-game chat + roster counts on nearby games.

-- 1) Messages (participants only via RLS)
create table if not exists public.game_messages (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint game_messages_body_len check (
    char_length(trim(body)) > 0
    and char_length(body) <= 2000
  )
);

create index if not exists game_messages_game_created_idx
  on public.game_messages (game_id, created_at desc);

alter table public.game_messages enable row level security;

drop policy if exists "game_messages_select_participants" on public.game_messages;
create policy "game_messages_select_participants"
  on public.game_messages for select
  using (
    exists (
      select 1 from public.game_participants gp
      where gp.game_id = game_messages.game_id
        and gp.user_id = auth.uid()
    )
  );

drop policy if exists "game_messages_insert_participants" on public.game_messages;
create policy "game_messages_insert_participants"
  on public.game_messages for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.game_participants gp
      where gp.game_id = game_messages.game_id
        and gp.user_id = auth.uid()
    )
  );

-- Realtime (idempotent)
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'game_messages'
  ) then
    alter publication supabase_realtime add table public.game_messages;
  end if;
end;
$$;

-- Columns expected by get_games_nearby below (if 170 / 20001 failed partway, add them here).
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'games' and column_name = 'location_label'
  ) then
    alter table public.games add column location_label text;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'games' and column_name = 'description'
  ) then
    alter table public.games add column description text;
  end if;
end;
$$;

-- 2) Nearby games include headcount + spots left (capacity includes host)
-- Postgres cannot change a function's return row type with CREATE OR REPLACE (42P13).
drop function if exists public.get_games_nearby(double precision, double precision, double precision);

create or replace function public.get_games_nearby(
  lat double precision,
  lng double precision,
  radius_km double precision default 10
)
returns table (
  id uuid,
  title text,
  sport text,
  spots_needed int,
  starts_at timestamptz,
  created_by uuid,
  created_at timestamptz,
  status text,
  location_label text,
  description text,
  participant_count int,
  spots_remaining int,
  distance_km double precision,
  lat double precision,
  lng double precision
)
language sql
stable
security definer
set search_path = public
as $$
  select
    g.id,
    g.title,
    g.sport,
    g.spots_needed,
    g.starts_at,
    g.created_by,
    g.created_at,
    g.status,
    g.location_label,
    g.description,
    coalesce(part.cnt, 0)::int as participant_count,
    greatest(g.spots_needed - coalesce(part.cnt, 0), 0)::int as spots_remaining,
    (st_distance(g.location, st_point(lng, lat)::geography) / 1000.0) as distance_km,
    st_y(g.location::geometry) as lat,
    st_x(g.location::geometry) as lng
  from public.games g
  left join lateral (
    select count(*)::int as cnt
    from public.game_participants gp
    where gp.game_id = g.id
  ) part on true
  where st_dwithin(g.location, st_point(lng, lat)::geography, radius_km * 1000.0)
  order by g.location <-> st_point(lng, lat)::geography
  limit 50;
$$;

grant execute on function public.get_games_nearby(double precision, double precision, double precision)
  to authenticated;
grant execute on function public.get_games_nearby(double precision, double precision, double precision)
  to anon;

-- 3) Inbox: games I joined, with last message preview
drop function if exists public.get_my_game_inbox();

create or replace function public.get_my_game_inbox()
returns table (
  id uuid,
  title text,
  sport text,
  starts_at timestamptz,
  location_label text,
  last_message_body text,
  last_message_at timestamptz,
  participant_count int,
  spots_remaining int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    g.id,
    g.title,
    g.sport,
    g.starts_at,
    g.location_label,
    lm.body as last_message_body,
    lm.created_at as last_message_at,
    coalesce(pc.cnt, 0)::int as participant_count,
    greatest(g.spots_needed - coalesce(pc.cnt, 0), 0)::int as spots_remaining
  from public.game_participants me
  join public.games g on g.id = me.game_id
  left join lateral (
    select count(*)::int as cnt
    from public.game_participants gp
    where gp.game_id = g.id
  ) pc on true
  left join lateral (
    select m.body, m.created_at
    from public.game_messages m
    where m.game_id = g.id
    order by m.created_at desc
    limit 1
  ) lm on true
  where me.user_id = auth.uid()
  order by coalesce(lm.created_at, g.starts_at, g.created_at) desc nulls last;
$$;

grant execute on function public.get_my_game_inbox() to authenticated;
grant execute on function public.get_my_game_inbox() to anon;

notify pgrst, 'reload schema';
 -- Add human-readable location label to games and expose via RPCs.

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'games'
      and column_name = 'location_label'
  ) then
    alter table public.games
      add column location_label text;
  end if;
end;
$$;

create or replace function public.create_game(
  p_title text,
  p_sport text,
  p_lat double precision,
  p_lng double precision,
  p_spots_needed int default 2,
  p_starts_at timestamptz default null,
  p_location_label text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated to create a game';
  end if;
  insert into public.games (title, sport, spots_needed, location, created_by, status, starts_at, location_label)
  values (
    p_title,
    p_sport,
    coalesce(p_spots_needed, 2),
    st_setSRID(st_makePoint(p_lng, p_lat), 4326)::geography,
    auth.uid(),
    'open',
    p_starts_at,
    p_location_label
  )
  returning id into new_id;
  insert into public.game_participants (game_id, user_id, role)
  values (new_id, auth.uid(), 'host');
  return new_id;
end;
$$;

create or replace function public.get_games_nearby(
  lat double precision,
  lng double precision,
  radius_km double precision default 10
)
returns table (
  id uuid,
  title text,
  sport text,
  spots_needed int,
  starts_at timestamptz,
  created_by uuid,
  created_at timestamptz,
  status text,
  location_label text,
  distance_km double precision,
  lat double precision,
  lng double precision
)
language sql
stable
security definer
set search_path = public
as $$
  select
    g.id,
    g.title,
    g.sport,
    g.spots_needed,
    g.starts_at,
    g.created_by,
    g.created_at,
    g.status,
    g.location_label,
    (st_distance(g.location, st_point(lng, lat)::geography) / 1000.0) as distance_km,
    st_y(g.location::geometry) as lat,
    st_x(g.location::geometry) as lng
  from public.games g
  where st_dwithin(g.location, st_point(lng, lat)::geography, radius_km * 1000.0)
  order by g.location <-> st_point(lng, lat)::geography
  limit 50;
$$;

 -- Extensible athlete identity: progressive disclosure, sport-aware sections stored as JSON.
-- PostgREST schema reload runs at the end of this file (NOTIFY pgrst). If you added the column
-- manually earlier, run in SQL Editor: NOTIFY pgrst, 'reload schema';
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'athlete_profile'
  ) then
    alter table public.profiles
      add column athlete_profile jsonb not null default '{}'::jsonb;
  end if;
end $$;

comment on column public.profiles.athlete_profile is
  'Athlete-facing profile extensions (handle, sports, metrics, experience, highlights, trust UI). Validated in app.';

-- Tell PostgREST to reload its schema cache so PATCH/SELECT see the new column immediately.
-- (If you already ran this migration before this line existed, run once in SQL Editor: NOTIFY pgrst, 'reload schema';)
notify pgrst, 'reload schema';
 -- Optional short description on games (create modal / social context).

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'games'
      and column_name = 'description'
  ) then
    alter table public.games
      add column description text;
  end if;
end;
$$;

create or replace function public.create_game(
  p_title text,
  p_sport text,
  p_lat double precision,
  p_lng double precision,
  p_spots_needed int default 2,
  p_starts_at timestamptz default null,
  p_location_label text default null,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated to create a game';
  end if;
  insert into public.games (title, sport, spots_needed, location, created_by, status, starts_at, location_label, description)
  values (
    p_title,
    p_sport,
    coalesce(p_spots_needed, 2),
    st_setSRID(st_makePoint(p_lng, p_lat), 4326)::geography,
    auth.uid(),
    'open',
    p_starts_at,
    p_location_label,
    nullif(trim(coalesce(p_description, '')), '')
  )
  returning id into new_id;
  insert into public.game_participants (game_id, user_id, role)
  values (new_id, auth.uid(), 'host');
  return new_id;
end;
$$;

drop function if exists public.get_games_nearby(double precision, double precision, double precision);

create or replace function public.get_games_nearby(
  lat double precision,
  lng double precision,
  radius_km double precision default 10
)
returns table (
  id uuid,
  title text,
  sport text,
  spots_needed int,
  starts_at timestamptz,
  created_by uuid,
  created_at timestamptz,
  status text,
  location_label text,
  description text,
  distance_km double precision,
  lat double precision,
  lng double precision
)
language sql
stable
security definer
set search_path = public
as $$
  select
    g.id,
    g.title,
    g.sport,
    g.spots_needed,
    g.starts_at,
    g.created_by,
    g.created_at,
    g.status,
    g.location_label,
    g.description,
    (st_distance(g.location, st_point(lng, lat)::geography) / 1000.0) as distance_km,
    st_y(g.location::geometry) as lat,
    st_x(g.location::geometry) as lng
  from public.games g
  where st_dwithin(g.location, st_point(lng, lat)::geography, radius_km * 1000.0)
  order by g.location <-> st_point(lng, lat)::geography
  limit 50;
$$;

grant execute on function public.get_games_nearby(double precision, double precision, double precision)
  to authenticated;
grant execute on function public.get_games_nearby(double precision, double precision, double precision)
  to anon;
 -- Add human-readable location label to games and expose via RPCs.

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'games'
      and column_name = 'location_label'
  ) then
    alter table public.games
      add column location_label text;
  end if;
end;
$$;

create or replace function public.create_game(
  p_title text,
  p_sport text,
  p_lat double precision,
  p_lng double precision,
  p_spots_needed int default 2,
  p_starts_at timestamptz default null,
  p_location_label text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated to create a game';
  end if;
  insert into public.games (title, sport, spots_needed, location, created_by, status, starts_at, location_label)
  values (
    p_title,
    p_sport,
    coalesce(p_spots_needed, 2),
    st_setSRID(st_makePoint(p_lng, p_lat), 4326)::geography,
    auth.uid(),
    'open',
    p_starts_at,
    p_location_label
  )
  returning id into new_id;
  insert into public.game_participants (game_id, user_id, role)
  values (new_id, auth.uid(), 'host');
  return new_id;
end;
$$;

-- 42P13: return row type cannot change with CREATE OR REPLACE alone.
drop function if exists public.get_games_nearby(double precision, double precision, double precision);

create or replace function public.get_games_nearby(
  lat double precision,
  lng double precision,
  radius_km double precision default 10
)
returns table (
  id uuid,
  title text,
  sport text,
  spots_needed int,
  starts_at timestamptz,
  created_by uuid,
  created_at timestamptz,
  status text,
  location_label text,
  distance_km double precision,
  lat double precision,
  lng double precision
)
language sql
stable
security definer
set search_path = public
as $$
  select
    g.id,
    g.title,
    g.sport,
    g.spots_needed,
    g.starts_at,
    g.created_by,
    g.created_at,
    g.status,
    g.location_label,
    (st_distance(g.location, st_point(lng, lat)::geography) / 1000.0) as distance_km,
    st_y(g.location::geometry) as lat,
    st_x(g.location::geometry) as lng
  from public.games g
  where st_dwithin(g.location, st_point(lng, lat)::geography, radius_km * 1000.0)
  order by g.location <-> st_point(lng, lat)::geography
  limit 50;
$$;

grant execute on function public.get_games_nearby(double precision, double precision, double precision)
  to authenticated;
grant execute on function public.get_games_nearby(double precision, double precision, double precision)
  to anon;
 -- Allow users to remove their own row from game_participants (Unjoin / leave).
-- Without this policy, DELETE is denied by RLS and the UI cannot persist leaving a game.

drop policy if exists "Users can delete own participation" on public.game_participants;
create policy "Users can delete own participation"
  on public.game_participants for delete
  using (auth.uid() = user_id);

notify pgrst, 'reload schema';
 -- Ensure the RPC exists and PostgREST knows about it.
-- This fixes client errors like:
-- "POST .../rest/v1/rpc/get_game_lat_lng 404 (Not Found)"

drop function if exists public.get_game_lat_lng(uuid);

create or replace function public.get_game_lat_lng(p_game_id uuid)
returns table (
  lat double precision,
  lng double precision
)
language sql
stable
security definer
set search_path = public
as $$
  select
    st_y(g.location::geometry)::double precision as lat,
    st_x(g.location::geometry)::double precision as lng
  from public.games g
  where g.id = p_game_id
  limit 1;
$$;

grant execute on function public.get_game_lat_lng(uuid) to authenticated;
grant execute on function public.get_game_lat_lng(uuid) to anon;

notify pgrst, 'reload schema';

 -- Cached OSM sports venues (pitches, sports centres) for fast map reads.
-- Populate via POST /api/osm-venues-import (secret) or scripts/import-osm-venues.mjs.

create table if not exists public.osm_sports_venues (
  id text primary key,
  lat double precision not null,
  lng double precision not null,
  name text,
  sport text,
  leisure text ,
  osm_type text not null,
  osm_id bigint not null,
  imported_at timestamptz not null default now()
);

create index if not exists osm_sports_venues_lat_lng_idx
  on public.osm_sports_venues (lat, lng);

alter table public.osm_sports_venues enable row level security;

drop policy if exists "Anyone can read osm sports venues" on public.osm_sports_venues;
create policy "Anyone can read osm sports venues"
  on public.osm_sports_venues for select
  using (true);

-- Writes only via service role (import API / scripts), not anon.

notify pgrst, 'reload schema';
 -- Hosts can remove their own game row (cascades to participants, messages, game_results).

drop policy if exists "Hosts can delete own games" on public.games;
create policy "Hosts can delete own games"
  on public.games for delete
  using (auth.uid() = created_by);

notify pgrst, 'reload schema';
 -- Allow users to remove their own row from game_participants (Unjoin / leave).
-- Without this policy, DELETE is denied by RLS and the UI cannot persist leaving a game.

drop policy if exists "Users can delete own participation" on public.game_participants;
create policy "Users can delete own participation"
  on public.game_participants for delete
  using (auth.uid() = user_id);

notify pgrst, 'reload schema';
 -- One-shot fix when POST /rest/v1/rpc/create_game returns 404:
-- - Old create_game overload (e.g. from schema.sql with fewer args) does not match the app.
-- - Or GRANT EXECUTE was missing for anon/authenticated.
--
-- Run in Supabase → SQL Editor (paste all). Requires public.games and related tables to exist.
-- Prefer running migrations in order from ../MIGRATION_ORDER.md when bootstrapping a new project.

-- 1) Remove every overload of create_game so we can install the one the app expects.
do $$
declare
  r record;
begin
  for r in
    select format(
      '%I.%I(%s)',
      n.nspname,
      p.proname,
      pg_get_function_identity_arguments(p.oid)
    ) as fq
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_game'
  loop
    execute 'drop function if exists ' || r.fq || ' cascade';
  end loop;
end;
$$;

-- 2) Ensure games columns expected by create_game (safe if already present)
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'games' and column_name = 'status'
  ) then
    alter table public.games add column status text not null default 'open';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'games' and column_name = 'location_label'
  ) then
    alter table public.games add column location_label text;
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'games' and column_name = 'description'
  ) then
    alter table public.games add column description text;
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'games' and column_name = 'requirements'
  ) then
    alter table public.games add column requirements jsonb not null default '{}'::jsonb;
  end if;
end;
$$;

create or replace function public.create_game(
  p_title text,
  sport text,
  p_lat double precision,
  p_lng double precision,
  p_spots_needed int default 2,
  p_starts_at timestamptz default null,
  p_location_label text default null,
  p_description text default null,
  p_requirements jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated to create a game';
  end if;
  insert into public.games (
    title, sport, spots_needed, location, created_by, status, starts_at, location_label, description, requirements
  )
  values (
    p_title,
    p_sport,
    coalesce(p_spots_needed, 2),
    st_setSRID(st_makePoint(p_lng, p_lat), 4326)::geography,
    auth.uid(),
    'open',
    p_starts_at,
    p_location_label,
    nullif(trim(coalesce(p_description, '')), ''),
    case
      when p_requirements is null then '{}'::jsonb
      when jsonb_typeof(p_requirements) = 'object' then p_requirements
      else '{}'::jsonb
    end
  )
  returning id into new_id;
  insert into public.game_participants (game_id, user_id, role)
  values (new_id, auth.uid(), 'host');
  return new_id;
end;
$$;

drop function if exists public.get_games_nearby(double precision, double precision, double precision);

create or replace function public.get_games_nearby(
  lat double precision,
  lng double precision,
  radius_km double precision default 10
)
returns table (
  id uuid,
  title text,
  sport text,
  spots_needed int,
  starts_at timestamptz,
  created_by uuid,
  created_at timestamptz,
  status text,
  location_label text,
  description text,
  requirements jsonb,
  participant_count int,
  spots_remaining int,
  distance_km double precision,
  lat double precision,
  lng double precision
)
language sql
stable
security definer
set search_path = public
as $$
  select
    g.id,
    g.title,
    g.sport,
    g.spots_needed,
    g.starts_at,
    g.created_by,
    g.created_at,
    g.status,
    g.location_label,
    g.description,
    coalesce(g.requirements, '{}'::jsonb) as requirements,
    coalesce(part.cnt, 0)::int as participant_count,
    greatest(g.spots_needed - coalesce(part.cnt, 0), 0)::int as spots_remaining,
    (st_distance(g.location, st_point(lng, lat)::geography) / 1000.0) as distance_km,
    st_y(g.location::geometry) as lat,
    st_x(g.location::geometry) as lng
  from public.games g
  left join lateral (
    select count(*)::int as cnt
    from public.game_participants gp
    where gp.game_id = g.id
  ) part on true
  where st_dwithin(g.location, st_point(lng, lat)::geography, radius_km * 1000.0)
  order by g.location <-> st_point(lng, lat)::geography
  limit 50;
$$;

grant execute on function public.get_games_nearby(double precision, double precision, double precision)
  to authenticated;
grant execute on function public.get_games_nearby(double precision, double precision, double precision)
  to anon;

-- 3) Same as migrations/20260322000000_create_game_grants.sql
grant execute on function public.create_game(
  text,
  text,
  double precision,
  double precision,
  int,
  timestamptz,
  text,
  text,
  jsonb
) to authenticated;

grant execute on function public.create_game(
  text,
  text,
  double precision,
  double precision,
  int,
  timestamptz,
  text,
  text,
  jsonb
) to anon;

notify pgrst, 'reload schema';
 -- Direct messages (1:1) + inbox RPCs.
-- Keeps game chat (group) separate from private conversations in the client UI.

-- 1) Threads (one per pair of users)
create table if not exists public.dm_threads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table if not exists public.dm_thread_members (
  thread_id uuid not null references public.dm_threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);

create index if not exists dm_thread_members_user_idx
  on public.dm_thread_members (user_id, thread_id);

-- 2) Messages
create table if not exists public.dm_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.dm_threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint dm_messages_body_len check (
    char_length(trim(body)) > 0
    and char_length(body) <= 2000
  )
);

create index if not exists dm_messages_thread_created_idx
  on public.dm_messages (thread_id, created_at desc);

-- 3) RLS
alter table public.dm_thread_members enable row level security;
alter table public.dm_messages enable row level security;

drop policy if exists "dm_thread_members_select_self" on public.dm_thread_members;
create policy "dm_thread_members_select_self"
  on public.dm_thread_members for select
  using (auth.uid() = user_id);

drop policy if exists "dm_thread_members_insert_self" on public.dm_thread_members;
create policy "dm_thread_members_insert_self"
  on public.dm_thread_members for insert
  with check (auth.uid() = user_id);

drop policy if exists "dm_messages_select_members" on public.dm_messages;
create policy "dm_messages_select_members"
  on public.dm_messages for select
  using (
    exists (
      select 1 from public.dm_thread_members m
      where m.thread_id = dm_messages.thread_id
        and m.user_id = auth.uid()
    )
  );

drop policy if exists "dm_messages_insert_members" on public.dm_messages;
create policy "dm_messages_insert_members"
  on public.dm_messages for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.dm_thread_members m
      where m.thread_id = dm_messages.thread_id
        and m.user_id = auth.uid()
    )
  );

-- 4) Realtime publication (idempotent)
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'dm_messages'
  ) then
    alter publication supabase_realtime add table public.dm_messages;
  end if;
end;
$$;

-- 5) RPC: get or create a 1:1 thread with another user.
drop function if exists public.get_or_create_dm_thread(uuid);
create or replace function public.get_or_create_dm_thread(p_other uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
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
$$;

grant execute on function public.get_or_create_dm_thread(uuid) to authenticated;
grant execute on function public.get_or_create_dm_thread(uuid) to anon;

-- 6) RPC: inbox rows for my DM threads (other user's public profile + last message)
drop function if exists public.get_my_dm_inbox();
create or replace function public.get_my_dm_inbox()
returns table (
  thread_id uuid,
  other_user_id uuid,
  display_name text,
  avatar_url text,
  last_message_body text,
  last_message_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
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
$$;

grant execute on function public.get_my_dm_inbox() to authenticated;
grant execute on function public.get_my_dm_inbox() to anon;

notify pgrst, 'reload schema';

 -- Migration: athlete endorsements (games-only reputation)
-- Adds:
-- - athlete_endorsements table
-- - RPCs: get_shared_completed_games, endorse_athlete, get_athlete_reputation
-- - Extends get_profiles_nearby to include sportsmanship (avg stars)

create table if not exists public.athlete_endorsements (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  endorser_id uuid not null references public.profiles(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  tags text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (game_id, athlete_id, endorser_id),
  constraint athlete_endorsements_not_self check (athlete_id <> endorser_id)
);

create index if not exists athlete_endorsements_athlete_idx
  on public.athlete_endorsements (athlete_id, created_at desc);
create index if not exists athlete_endorsements_endorser_idx
  on public.athlete_endorsements (endorser_id, created_at desc);
create index if not exists athlete_endorsements_game_idx
  on public.athlete_endorsements (game_id);

alter table public.athlete_endorsements enable row level security;

drop policy if exists "athlete_endorsements_insert_games_only" on public.athlete_endorsements;
create policy "athlete_endorsements_insert_games_only"
  on public.athlete_endorsements
  for insert
  with check (
    auth.uid() = endorser_id
    and exists (
      select 1
      from public.games g
      join public.game_participants me on me.game_id = g.id and me.user_id = auth.uid()
      join public.game_participants them on them.game_id = g.id and them.user_id = athlete_endorsements.athlete_id
      where g.id = athlete_endorsements.game_id
        and g.status = 'completed'
    )
  );

drop policy if exists "athlete_endorsements_update_owner" on public.athlete_endorsements;
create policy "athlete_endorsements_update_owner"
  on public.athlete_endorsements
  for update
  using (auth.uid() = endorser_id)
  with check (
    auth.uid() = endorser_id
    and exists (
      select 1
      from public.games g
      join public.game_participants me on me.game_id = g.id and me.user_id = auth.uid()
      join public.game_participants them on them.game_id = g.id and them.user_id = athlete_endorsements.athlete_id
      where g.id = athlete_endorsements.game_id
        and g.status = 'completed'
    )
  );

-- Keep endorsements private; expose aggregates via RPC.
drop policy if exists "athlete_endorsements_select_none" on public.athlete_endorsements;

-- ---------- RPC: shared completed games ----------
drop function if exists public.get_shared_completed_games(uuid);
create or replace function public.get_shared_completed_games(
  p_other uuid
)
returns table (
  game_id uuid,
  title text,
  sport text,
  starts_at timestamptz,
  completed_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
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
$$;

grant execute on function public.get_shared_completed_games(uuid) to authenticated;

-- ---------- RPC: endorse athlete (upsert) ----------
drop function if exists public.endorse_athlete(uuid, uuid, int, text[]);
create or replace function public.endorse_athlete(
  p_athlete uuid,
  p_game uuid,
  p_rating int,
  p_tags text[] default '{}'::text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
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
$$;

grant execute on function public.endorse_athlete(uuid, uuid, int, text[]) to authenticated;

-- ---------- RPC: public aggregate reputation ----------
drop function if exists public.get_athlete_reputation(uuid);
create or replace function public.get_athlete_reputation(
  p_athlete uuid
)
returns table (
  sportsmanship_avg double precision,
  sportsmanship_count int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(avg(e.rating)::double precision, 0) as sportsmanship_avg,
    coalesce(count(*)::int, 0) as sportsmanship_count
  from public.athlete_endorsements e
  where e.athlete_id = p_athlete;
$$;

grant execute on function public.get_athlete_reputation(uuid) to authenticated;
grant execute on function public.get_athlete_reputation(uuid) to anon;

-- ---------- Extend get_profiles_nearby (map needs rating) ----------
-- Return row shape changes vs older DBs — must DROP first (CREATE OR REPLACE is not enough).
do $$
declare
  fn regprocedure;
begin
  for fn in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'get_profiles_nearby'
  loop
    execute 'drop function if exists ' || fn::text || ' cascade';
  end loop;
end $$;

create or replace function public.get_profiles_nearby(
  lat double precision,
  lng double precision,
  radius_km double precision default 5,
  limit_count int default 50
)
returns table (
  profile_id uuid,
  display_name text,
  avatar_url text,
  avatar_id text,
  sportsmanship double precision,
  lat double precision,
  lng double precision,
  distance_km double precision
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id as profile_id,
    p.display_name,
    p.avatar_url,
    p.avatar_id,
    rep.sportsmanship_avg as sportsmanship,
    pl.lat,
    pl.lng,
    (st_distance(st_setsrid(st_makePoint(pl.lng, pl.lat), 4326)::geography, st_setsrid(st_makePoint(lng, lat), 4326)::geography) / 1000.0) as distance_km
  from public.profile_locations pl
  join public.profiles p on p.id = pl.profile_id
  left join lateral (
    select coalesce(avg(e.rating)::double precision, null) as sportsmanship_avg
    from public.athlete_endorsements e
    where e.athlete_id = p.id
  ) rep on true
  where st_dwithin(
      st_setsrid(st_makePoint(pl.lng, pl.lat), 4326)::geography,
      st_setsrid(st_makePoint(lng, lat), 4326)::geography,
      radius_km * 1000.0
    )
  order by pl.updated_at desc
  limit limit_count;
$$;

notify pgrst, 'reload schema';

 -- Migration: 24h status updates (map + feed + profile)
--
-- Creates:
-- - status_updates: one active status per user (upsert)
-- - RPCs: upsert_my_status, get_recent_statuses, get_latest_status
-- - Extends get_profiles_nearby to include active status text + expiry

create table if not exists public.status_updates (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint status_updates_body_len check (char_length(trim(body)) > 0 and char_length(body) <= 280)
);

create index if not exists status_updates_expires_idx
  on public.status_updates (expires_at desc);

alter table public.status_updates enable row level security;

drop policy if exists "status_updates_select_public" on public.status_updates;
create policy "status_updates_select_public"
  on public.status_updates
  for select
  using (expires_at > now());

drop policy if exists "status_updates_insert_owner" on public.status_updates;
create policy "status_updates_insert_owner"
  on public.status_updates
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "status_updates_update_owner" on public.status_updates;
create policy "status_updates_update_owner"
  on public.status_updates
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- RPC: Upsert my status (24h TTL)
drop function if exists public.upsert_my_status(text);
create or replace function public.upsert_my_status(
  p_body text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated';
  end if;
  if p_body is null or char_length(trim(p_body)) = 0 then
    raise exception 'Status cannot be empty';
  end if;
  if char_length(p_body) > 280 then
    raise exception 'Status too long';
  end if;

  insert into public.status_updates (user_id, body, created_at, expires_at)
  values (auth.uid(), trim(p_body), now(), now() + interval '24 hours')
  on conflict (user_id) do update set
    body = excluded.body,
    created_at = excluded.created_at,
    expires_at = excluded.expires_at;
end;
$$;

grant execute on function public.upsert_my_status(text) to authenticated;

-- RPC: Recent statuses (for feed)
drop function if exists public.get_recent_statuses(int);
create or replace function public.get_recent_statuses(
  p_limit int default 50
)
returns table (
  user_id uuid,
  body text,
  created_at timestamptz,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select s.user_id, s.body, s.created_at, s.expires_at
  from public.status_updates s
  where s.expires_at > now()
  order by s.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

grant execute on function public.get_recent_statuses(int) to authenticated;
grant execute on function public.get_recent_statuses(int) to anon;

-- RPC: Latest status for a specific athlete
drop function if exists public.get_latest_status(uuid);
create or replace function public.get_latest_status(
  p_user uuid
)
returns table (
  body text,
  created_at timestamptz,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select s.body, s.created_at, s.expires_at
  from public.status_updates s
  where s.user_id = p_user
    and s.expires_at > now()
  limit 1;
$$;

grant execute on function public.get_latest_status(uuid) to authenticated;
grant execute on function public.get_latest_status(uuid) to anon;

-- Extend get_profiles_nearby: include sportsmanship (from endorsements migration) + status overlay
do $$
declare
  fn regprocedure;
begin
  for fn in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'get_profiles_nearby'
  loop
    execute 'drop function if exists ' || fn::text || ' cascade';
  end loop;
end $$;

create or replace function public.get_profiles_nearby(
  lat double precision,
  lng double precision,
  radius_km double precision default 5,
  limit_count int default 50
)
returns table (
  profile_id uuid,
  display_name text,
  avatar_url text,
  avatar_id text,
  sportsmanship double precision,
  status_body text,
  status_expires_at timestamptz,
  lat double precision,
  lng double precision,
  distance_km double precision
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id as profile_id,
    p.display_name,
    p.avatar_url,
    p.avatar_id,
    rep.sportsmanship_avg as sportsmanship,
    st.body as status_body,
    st.expires_at as status_expires_at,
    pl.lat,
    pl.lng,
    (st_distance(st_setsrid(st_makePoint(pl.lng, pl.lat), 4326)::geography, st_setsrid(st_makePoint(lng, lat), 4326)::geography) / 1000.0) as distance_km
  from public.profile_locations pl
  join public.profiles p on p.id = pl.profile_id
  left join lateral (
    select coalesce(avg(e.rating)::double precision, null) as sportsmanship_avg
    from public.athlete_endorsements e
    where e.athlete_id = p.id
  ) rep on true
  left join lateral (
    select s.body, s.expires_at
    from public.status_updates s
    where s.user_id = p.id
      and s.expires_at > now()
    limit 1
  ) st on true
  where st_dwithin(
      st_setsrid(st_makePoint(pl.lng, pl.lat), 4326)::geography,
      st_setsrid(st_makePoint(lng, lat), 4326)::geography,
      radius_km * 1000.0
    )
  order by pl.updated_at desc
  limit limit_count;
$$;

notify pgrst, 'reload schema';

 -- Migration: live game start/end + TTL + inactive location filtering
--
-- Adds:
-- - games: status includes 'live', plus timestamps
-- - RPCs: start_game, end_game
-- - get_games_nearby: hides live games older than 24h and excludes completed/cancelled
-- - get_profiles_nearby: hides inactive players (stale profile_locations)

-- ----- 1) Extend games status + timestamps -----
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'games' and column_name = 'live_started_at'
  ) then
    alter table public.games add column live_started_at timestamptz;
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'games' and column_name = 'ended_at'
  ) then
    alter table public.games add column ended_at timestamptz;
  end if;
end $$;

-- Relax + re-apply status check to include 'live'
do $$ begin
  begin
    alter table public.games drop constraint if exists games_status_check;
  exception when undefined_object then
    -- ignore
  end;
end $$;

alter table public.games
  add constraint games_status_check
  check (status in ('open', 'full', 'live', 'completed', 'cancelled'));

-- ----- 2) Host RPCs: start_game / end_game -----
drop function if exists public.start_game(uuid);
create or replace function public.start_game(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
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
    set status = 'live',
        live_started_at = coalesce(live_started_at, now()),
        updated_at = now()
  where id = p_game_id;
end;
$$;

grant execute on function public.start_game(uuid) to authenticated;

drop function if exists public.end_game(uuid);
create or replace function public.end_game(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
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

  -- End Game before it begins => treat as delete game.
  if v_status <> 'live' and (v_starts_at is null or v_starts_at > now()) then
    delete from public.games where id = p_game_id and created_by = auth.uid();
    return;
  end if;

  update public.games
    set status = 'completed',
        ended_at = now(),
        updated_at = now()
  where id = p_game_id;
end;
$$;

grant execute on function public.end_game(uuid) to authenticated;

-- ----- 3) get_games_nearby: hide stale live games (>24h) -----
-- PG cannot CREATE OR REPLACE when the returned columns change; DROP must match the
-- exact signature (and there may be multiple overloads). Drop every public variant.
do $$
declare
  fn regprocedure;
begin
  for fn in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'get_games_nearby'
  loop
    execute 'drop function if exists ' || fn::text || ' cascade';
  end loop;
end $$;

create or replace function public.get_games_nearby(
  lat double precision,
  lng double precision,
  radius_km double precision default 10
)
returns table (
  id uuid,
  title text,
  sport text,
  spots_needed int,
  starts_at timestamptz,
  created_by uuid,
  created_at timestamptz,
  status text,
  location_label text,
  description text,
  requirements jsonb,
  participant_count int,
  spots_remaining int,
  distance_km double precision,
  lat double precision,
  lng double precision,
  live_started_at timestamptz,
  ended_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    g.id,
    g.title,
    g.sport,
    g.spots_needed,
    g.starts_at,
    g.created_by,
    g.created_at,
    g.status,
    g.location_label,
    g.description,
    coalesce(g.requirements, '{}'::jsonb) as requirements,
    coalesce(part.cnt, 0)::int as participant_count,
    greatest(g.spots_needed - coalesce(part.cnt, 0), 0)::int as spots_remaining,
    (st_distance(g.location, st_point(lng, lat)::geography) / 1000.0) as distance_km,
    st_y(g.location::geometry) as lat,
    st_x(g.location::geometry) as lng,
    g.live_started_at,
    g.ended_at
  from public.games g
  left join lateral (
    select count(*)::int as cnt
    from public.game_participants gp
    where gp.game_id = g.id
  ) part on true
  where st_dwithin(g.location, st_point(lng, lat)::geography, radius_km * 1000.0)
    and g.status in ('open', 'full', 'live')
    and (
      g.status <> 'live'
      or (coalesce(g.live_started_at, g.updated_at, g.created_at) > now() - interval '24 hours')
    )
  order by g.location <-> st_point(lng, lat)::geography
  limit 50;
$$;

grant execute on function public.get_games_nearby(double precision, double precision, double precision)
  to authenticated;
grant execute on function public.get_games_nearby(double precision, double precision, double precision)
  to anon;

-- ----- 4) get_profiles_nearby: hide inactive locations -----
do $$
declare
  fn regprocedure;
begin
  for fn in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'get_profiles_nearby'
  loop
    execute 'drop function if exists ' || fn::text || ' cascade';
  end loop;
end $$;

create or replace function public.get_profiles_nearby(
  lat double precision,
  lng double precision,
  radius_km double precision default 5,
  limit_count int default 50
)
returns table (
  profile_id uuid,
  display_name text,
  avatar_url text,
  avatar_id text,
  sportsmanship double precision,
  status_body text,
  status_expires_at timestamptz,
  lat double precision,
  lng double precision,
  distance_km double precision
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id as profile_id,
    p.display_name,
    p.avatar_url,
    p.avatar_id,
    rep.sportsmanship_avg as sportsmanship,
    st.body as status_body,
    st.expires_at as status_expires_at,
    pl.lat,
    pl.lng,
    (st_distance(st_setsrid(st_makePoint(pl.lng, pl.lat), 4326)::geography, st_setsrid(st_makePoint(lng, lat), 4326)::geography) / 1000.0) as distance_km
  from public.profile_locations pl
  join public.profiles p on p.id = pl.profile_id
  left join lateral (
    select coalesce(avg(e.rating)::double precision, null) as sportsmanship_avg
    from public.athlete_endorsements e
    where e.athlete_id = p.id
  ) rep on true
  left join lateral (
    select s.body, s.expires_at
    from public.status_updates s
    where s.user_id = p.id
      and s.expires_at > now()
    limit 1
  ) st on true
  where st_dwithin(
      st_setsrid(st_makePoint(pl.lng, pl.lat), 4326)::geography,
      st_setsrid(st_makePoint(lng, lat), 4326)::geography,
      radius_km * 1000.0
    )
    and pl.updated_at > now() - interval '45 minutes'
  order by pl.updated_at desc
  limit limit_count;
$$;

grant execute on function public.get_profiles_nearby(double precision, double precision, double precision, int)
  to authenticated;
grant execute on function public.get_profiles_nearby(double precision, double precision, double precision, int)
  to anon;

notify pgrst, 'reload schema';

 select proname, pg_get_function_identity_arguments(oid)
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('start_game', 'end_game', 'get_games_nearby', 'get_profiles_nearby')
order by proname; -- Migration: Game Creation Quality & Anti-Spam
-- Adds RPCs for host rate-limiting and smart-merging overlapping games

-- 1. Host Rate Limiting
-- Returns the number of active games a user has created currently.
create or replace function public.get_active_hosted_games_count(p_user_id uuid default auth.uid())
returns int
language sql
security definer
set search_path = public
as $$
  select count(*)::int
  from public.games
  where created_by = coalesce(p_user_id, auth.uid())
    and status in ('open', 'full')
    -- Only count games starting in the future (ignores past ghost games)
    and (starts_at is null or starts_at >= now());
$$;

-- 2. Smart Merge (Nearby Similar Games)
-- Returns up to 5 nearby open games of the same sport starting within +/- 2 hours.
create or replace function public.check_nearby_similar_games(
  p_sport text,
  p_lat double precision,
  p_lng double precision,
  p_starts_at timestamptz,
  p_radius_km double precision default 5.0
)
returns table (
  id uuid,
  title text,
  sport text,
  starts_at timestamptz,
  status text,
  distance_km double precision
)
language sql
security definer
set search_path = public
as $$
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
$$;
-- Migration: Enforce Guest & Profile Restrictions on Map
-- Re-applies auth restrictions to get_profiles_nearby and adds them to get_games_nearby

-- ----- 1) get_games_nearby: enforce caller is authenticated non-guest and complete profile -----
do $$
declare
  fn regprocedure;
begin
  for fn in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'get_games_nearby'
  loop
    execute 'drop function if exists ' || fn::text || ' cascade';
  end loop;
end $$;

create or replace function public.get_games_nearby(
  lat double precision,
  lng double precision,
  radius_km double precision default 10
)
returns table (
  id uuid,
  title text,
  sport text,
  spots_needed int,
  starts_at timestamptz,
  created_by uuid,
  created_at timestamptz,
  status text,
  location_label text,
  description text,
  requirements jsonb,
  participant_count int,
  spots_remaining int,
  distance_km double precision,
  lat double precision,
  lng double precision,
  live_started_at timestamptz,
  ended_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    g.id,
    g.title,
    g.sport,
    g.spots_needed,
    g.starts_at,
    g.created_by,
    g.created_at,
    g.status,
    g.location_label,
    g.description,
    coalesce(g.requirements, '{}'::jsonb) as requirements,
    coalesce(part.cnt, 0)::int as participant_count,
    greatest(g.spots_needed - coalesce(part.cnt, 0), 0)::int as spots_remaining,
    (st_distance(g.location, st_point(lng, lat)::geography) / 1000.0) as distance_km,
    st_y(g.location::geometry) as lat,
    st_x(g.location::geometry) as lng,
    g.live_started_at,
    g.ended_at
  from public.games g
  left join lateral (
    select count(*)::int as cnt
    from public.game_participants gp
    where gp.game_id = g.id
  ) part on true
  where st_dwithin(g.location, st_point(lng, lat)::geography, radius_km * 1000.0)
    and g.status in ('open', 'full', 'live')
    and (
      g.status <> 'live'
      or (coalesce(g.live_started_at, g.updated_at, g.created_at) > now() - interval '24 hours')
    )
    -- PRIVACY: Caller must not be anonymous and must have completed onboarding
    and exists (
      select 1
      from auth.users u
      join public.profiles p on p.id = u.id
      where u.id = auth.uid()
        and not coalesce(u.is_anonymous, false)
        and coalesce(p.onboarding_completed, false) = true
    )
  order by g.location <-> st_point(lng, lat)::geography
  limit 50;
$$;

grant execute on function public.get_games_nearby(double precision, double precision, double precision) to authenticated;
grant execute on function public.get_games_nearby(double precision, double precision, double precision) to anon;

-- ----- 2) get_profiles_nearby: enforce target and caller restrictions -----
do $$
declare
  fn regprocedure;
begin
  for fn in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'get_profiles_nearby'
  loop
    execute 'drop function if exists ' || fn::text || ' cascade';
  end loop;
end $$;

create or replace function public.get_profiles_nearby(
  lat double precision,
  lng double precision,
  radius_km double precision default 5,
  limit_count int default 50
)
returns table (
  profile_id uuid,
  display_name text,
  avatar_url text,
  avatar_id text,
  sportsmanship double precision,
  status_body text,
  status_expires_at timestamptz,
  lat double precision,
  lng double precision,
  distance_km double precision
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id as profile_id,
    p.display_name,
    p.avatar_url,
    p.avatar_id,
    rep.sportsmanship_avg as sportsmanship,
    st.body as status_body,
    null::timestamptz as status_expires_at,
    pl.lat,
    pl.lng,
    (st_distance(st_setsrid(st_makePoint(pl.lng, pl.lat), 4326)::geography, st_setsrid(st_makePoint(lng, lat), 4326)::geography) / 1000.0) as distance_km
  from public.profile_locations pl
  join public.profiles p on p.id = pl.profile_id
  -- PRIVACY: Ensure the target user we are querying is an actual verified auth user (not anon)
  join auth.users u on u.id = p.id
  left join lateral (
    select coalesce(avg(e.rating)::double precision, null) as sportsmanship_avg
    from public.athlete_endorsements e
    where e.athlete_id = p.id
  ) rep on true
  left join lateral (
    select s.body
    from public.status_updates s
    where s.user_id = p.id
    limit 1
  ) st on true
  where st_dwithin(
      st_setsrid(st_makePoint(pl.lng, pl.lat), 4326)::geography,
      st_setsrid(st_makePoint(lng, lat), 4326)::geography,
      radius_km * 1000.0
    )
    and pl.updated_at > now() - interval '45 minutes'
    -- PRIVACY: Target must not be anonymous and must have completed onboarding
    and not coalesce(u.is_anonymous, false)
    and coalesce(p.onboarding_completed, false) = true
    -- PRIVACY: Caller must not be anonymous and must be onboarded to see others
    and exists (
      select 1
      from auth.users caller_u
      join public.profiles caller_p on caller_p.id = caller_u.id
      where caller_u.id = auth.uid()
        and not coalesce(caller_u.is_anonymous, false)
        and coalesce(caller_p.onboarding_completed, false) = true
    )
  order by pl.updated_at desc
  limit limit_count;
$$;

grant execute on function public.get_profiles_nearby(double precision, double precision, double precision, int) to authenticated;
grant execute on function public.get_profiles_nearby(double precision, double precision, double precision, int) to anon;

notify pgrst, 'reload schema';
 -- Optimization Migration: Performance, Indexing, and Denormalization (v2)
--
-- Incorporates latest logic for privacy (onboarding, non-guest) and status (no expires_at).
-- 1) Adds missing indexes on foreign keys and frequently queried columns.
-- 2) Implements counter caching for game participants.
-- 3) Implements aggregate caching for athlete endorsements (sportsmanship).
-- 4) Refactors profile_locations to use geography for faster PostGIS queries.
-- 5) Updates RPCs to leverage cached values, spatial indexes, and latest privacy rules.

BEGIN;

-- 1. Indexing Optimizations
CREATE INDEX IF NOT EXISTS game_participants_user_id_idx ON public.game_participants(user_id);
CREATE INDEX IF NOT EXISTS profile_locations_updated_at_idx ON public.profile_locations(updated_at);
CREATE INDEX IF NOT EXISTS status_updates_user_created_idx ON public.status_updates(user_id, created_at DESC);

-- 2. Geography Column for profile_locations
DO $$ 
BEGIN 
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profile_locations' AND column_name = 'location_geography'
  ) THEN
    ALTER TABLE public.profile_locations ADD COLUMN location_geography geography(point, 4326);
  END IF;
END $$;

UPDATE public.profile_locations 
SET location_geography = ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography 
WHERE location_geography IS NULL;

CREATE INDEX IF NOT EXISTS profile_locations_location_geography_idx ON public.profile_locations USING GIST(location_geography);

-- 3. Participant Counter Cache for Games
DO $$ 
BEGIN 
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'games' AND column_name = 'participant_count'
  ) THEN
    ALTER TABLE public.games ADD COLUMN participant_count int DEFAULT 0;
  END IF;
END $$;

-- Initial count update
UPDATE public.games g
SET participant_count = (
  SELECT count(*)::int
  FROM public.game_participants gp
  WHERE gp.game_id = g.id
);

-- Trigger to maintain participant_count
CREATE OR REPLACE FUNCTION public.maintain_game_participant_count()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE public.games SET participant_count = participant_count + 1 WHERE id = NEW.game_id;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE public.games SET participant_count = participant_count - 1 WHERE id = OLD.game_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_maintain_game_participant_count ON public.game_participants;
CREATE TRIGGER tr_maintain_game_participant_count
AFTER INSERT OR DELETE ON public.game_participants
FOR EACH ROW EXECUTE FUNCTION public.maintain_game_participant_count();

-- 4. Endorsement Aggregate Cache for Profiles
DO $$ 
BEGIN 
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'sportsmanship_avg'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN sportsmanship_avg double precision;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'endorsement_count'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN endorsement_count int DEFAULT 0;
  END IF;
END $$;

-- Initial aggregate update
UPDATE public.profiles p
SET 
  sportsmanship_avg = (SELECT avg(rating)::double precision FROM public.athlete_endorsements WHERE athlete_id = p.id),
  endorsement_count = (SELECT count(*)::int FROM public.athlete_endorsements WHERE athlete_id = p.id);

-- Trigger to maintain endorsement aggregates
CREATE OR REPLACE FUNCTION public.maintain_profile_endorsement_stats()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_maintain_profile_endorsement_stats ON public.athlete_endorsements;
CREATE TRIGGER tr_maintain_profile_endorsement_stats
AFTER INSERT OR UPDATE OR DELETE ON public.athlete_endorsements
FOR EACH ROW EXECUTE FUNCTION public.maintain_profile_endorsement_stats();

-- 5. Partial Spatial Index for Active Games
CREATE INDEX IF NOT EXISTS games_active_location_idx ON public.games USING GIST(location) 
WHERE status IN ('open', 'full', 'live');

-- 6. Optimized get_games_nearby (includes privacy rules)
DROP FUNCTION IF EXISTS public.get_games_nearby(double precision, double precision, double precision);
CREATE OR REPLACE FUNCTION public.get_games_nearby(
  lat double precision,
  lng double precision,
  radius_km double precision default 10
)
RETURNS TABLE (
  id uuid,
  title text,
  sport text,
  spots_needed int,
  starts_at timestamptz,
  created_by uuid,
  created_at timestamptz,
  status text,
  location_label text,
  description text,
  requirements jsonb,
  participant_count int,
  spots_remaining int,
  distance_km double precision,
  lat double precision,
  lng double precision,
  live_started_at timestamptz,
  ended_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    g.id,
    g.title,
    g.sport,
    g.spots_needed,
    g.starts_at,
    g.created_by,
    g.created_at,
    g.status,
    g.location_label,
    g.description,
    coalesce(g.requirements, '{}'::jsonb) as requirements,
    g.participant_count,
    greatest(g.spots_needed - g.participant_count, 0)::int as spots_remaining,
    (st_distance(g.location, st_point(lng, lat)::geography) / 1000.0) as distance_km,
    st_y(g.location::geometry) as lat,
    st_x(g.location::geometry) as lng,
    g.live_started_at,
    g.ended_at
  FROM public.games g
  WHERE st_dwithin(g.location, st_point(lng, lat)::geography, radius_km * 1000.0)
    AND g.status IN ('open', 'full', 'live')
    AND (
      g.status <> 'live'
      OR (coalesce(g.live_started_at, g.updated_at, g.created_at) > now() - interval '24 hours')
    )
    -- PRIVACY: Caller must not be anonymous and must have completed onboarding
    AND EXISTS (
      SELECT 1
      FROM auth.users u
      JOIN public.profiles p ON p.id = u.id
      WHERE u.id = auth.uid()
        AND NOT coalesce(u.is_anonymous, false)
        AND coalesce(p.onboarding_completed, false) = true
    )
  ORDER BY g.location <-> st_point(lng, lat)::geography
  LIMIT 50;
$$;

-- 7. Optimized get_profiles_nearby (includes privacy rules)
-- Use a loop to drop all versions of the function
DO $$
DECLARE
  fn regprocedure;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'get_profiles_nearby'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || fn::text || ' CASCADE';
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.get_profiles_nearby(
  lat double precision,
  lng double precision,
  radius_km double precision default 5,
  limit_count int default 50
)
RETURNS TABLE (
  profile_id uuid,
  display_name text,
  avatar_url text,
  avatar_id text,
  sportsmanship double precision,
  status_body text,
  status_expires_at timestamptz,
  lat double precision,
  lng double precision,
  distance_km double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
  -- PRIVACY: Ensure the target user is a verified auth user (not anon)
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
    AND pl.updated_at > now() - interval '45 minutes'
    -- PRIVACY: Target must not be anonymous and must have completed onboarding
    AND NOT coalesce(u.is_anonymous, false)
    AND coalesce(p.onboarding_completed, false) = true
    -- PRIVACY: Caller must not be anonymous and must be onboarded
    AND EXISTS (
      SELECT 1
      FROM auth.users caller_u
      JOIN public.profiles caller_p ON caller_p.id = caller_u.id
      WHERE caller_u.id = auth.uid()
        AND NOT coalesce(caller_u.is_anonymous, false)
        AND coalesce(caller_p.onboarding_completed, false) = true
    )
  ORDER BY pl.location_geography <-> st_point(lng, lat)::geography
  LIMIT limit_count;
$$;

-- 8. Optimized update_my_location
CREATE OR REPLACE FUNCTION public.update_my_location(p_lat double precision, p_lng double precision)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- 9. Optimized get_my_game_inbox
CREATE OR REPLACE FUNCTION public.get_my_game_inbox()
RETURNS TABLE (
  id uuid,
  title text,
  sport text,
  starts_at timestamptz,
  location_label text,
  last_message_body text,
  last_message_at timestamptz,
  participant_count int,
  spots_remaining int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    g.id,
    g.title,
    g.sport,
    g.starts_at,
    g.location_label,
    lm.body as last_message_body,
    lm.created_at as last_message_at,
    g.participant_count,
    greatest(g.spots_needed - g.participant_count, 0)::int as spots_remaining
  FROM public.game_participants me
  JOIN public.games g ON g.id = me.game_id
  LEFT JOIN LATERAL (
    SELECT m.body, m.created_at
    FROM public.game_messages m
    WHERE m.game_id = g.id
    ORDER BY m.created_at DESC
    LIMIT 1
  ) lm ON true
  WHERE me.user_id = auth.uid()
  ORDER BY coalesce(lm.created_at, g.starts_at, g.created_at) DESC NULLS LAST;
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
 -- Migration: Include self in get_profiles_nearby
-- Ensures the current user's avatar is visible on the map to themselves.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_profiles_nearby(
  lat double precision,
  lng double precision,
  radius_km double precision default 5,
  limit_count int default 50
)
RETURNS TABLE (
  profile_id uuid,
  display_name text,
  avatar_url text,
  avatar_id text,
  sportsmanship double precision,
  status_body text,
  status_expires_at timestamptz,
  lat double precision,
  lng double precision,
  distance_km double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
    AND pl.updated_at > now() - interval '45 minutes'
    -- PRIVACY RULES
    AND (
      -- Rule 1: Always show myself
      p.id = auth.uid()
      OR
      -- Rule 2: Show others if both target and caller are verified/onboarded
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
  ORDER BY pl.location_geography <-> st_point(lng, lat)::geography
  LIMIT limit_count;
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
 -- Migration: Fix self-visibility on map
-- Relaxes the 45-minute stale check only for the current user's own profile
-- so they can always see their last reported position on the map.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_profiles_nearby(
  lat double precision,
  lng double precision,
  radius_km double precision default 5,
  limit_count int default 50
)
RETURNS TABLE (
  profile_id uuid,
  display_name text,
  avatar_url text,
  avatar_id text,
  sportsmanship double precision,
  status_body text,
  status_expires_at timestamptz,
  lat double precision,
  lng double precision,
  distance_km double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
    -- STALE CHECK: Others must be active within 45m. Self is always shown if within search radius.
    AND (
      p.id = auth.uid()
      OR
      pl.updated_at > now() - interval '45 minutes'
    )
    -- PRIVACY RULES
    AND (
      -- Rule 1: Always show myself
      p.id = auth.uid()
      OR
      -- Rule 2: Show others if both target and caller are verified/onboarded
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
  ORDER BY pl.location_geography <-> st_point(lng, lat)::geography
  LIMIT limit_count;
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
  select count(*) from public.osm_sports_venues;         -- Migration: atomic join_game RPC
-- Prevents race conditions when multiple users try to book the same spot simultaneously.
-- Uses row locking and atomic transaction to ensure only the correct number of participants join.
-- Run in Supabase SQL Editor AFTER all previous migrations.

create or replace function public.join_game(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_user_id uuid;
  v_spots_needed int;
  v_participant_count int;
  v_result jsonb;
begin
  -- Get current user
  v_current_user_id := auth.uid();
  if v_current_user_id is null then
    return jsonb_build_object(
      'success', false,
      'error', 'Not authenticated'
    );
  end if;

  -- Lock the game row and fetch spots_needed
  select g.spots_needed
  into v_spots_needed
  from public.games g
  where g.id = p_game_id
  for update;

  if v_spots_needed is null then
    return jsonb_build_object(
      'success', false,
      'error', 'Game not found'
    );
  end if;

  -- Count current participants
  select count(*)
  into v_participant_count
  from public.game_participants gp
  where gp.game_id = p_game_id;

  -- Check if game is full
  if v_participant_count >= v_spots_needed then
    return jsonb_build_object(
      'success', false,
      'error', 'Game is full',
      'spots_needed', v_spots_needed,
      'current_participants', v_participant_count
    );
  end if;

  -- Check if user already joined
  if exists (
    select 1 from public.game_participants gp
    where gp.game_id = p_game_id and gp.user_id = v_current_user_id
  ) then
    return jsonb_build_object(
      'success', false,
      'error', 'Already joined this game'
    );
  end if;

  -- Insert the participant (will fail if another transaction already filled the last spot,
  -- but row lock prevents this)
  insert into public.game_participants (game_id, user_id, joined_at)
  values (p_game_id, v_current_user_id, now());

  return jsonb_build_object(
    'success', true,
    'message', 'Joined game successfully',
    'spots_needed', v_spots_needed,
    'current_participants', v_participant_count + 1
  );

exception when unique_violation then
  -- User tried to join twice (shouldn't happen with RLS, but just in case)
  return jsonb_build_object(
    'success', false,
    'error', 'Already joined this game'
  );
when others then
  -- Generic error (e.g. game was deleted)
  return jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
end;
$$;

-- Grant execute permission to authenticated and anonymous users
grant execute on function public.join_game(uuid) to authenticated, anon;

-- Log the schema reload
-- Run this if PostgREST doesn't pick up the new function
-- NOTIFY pgrst, 'reload schema';
   -- Migration: substitute queue
--
-- What this does:
--   1. Expands the role check constraint to allow 'substitute'
--   2. Rewrites join_game: full game → adds you as substitute instead of rejecting
--   3. Creates leave_game RPC: when a player leaves, first substitute auto-promotes
--   4. Fixes get_games_nearby so substitutes don't eat into participant_count / spots_remaining
--
-- Run in Supabase SQL Editor AFTER 20260404000000_atomic_join_game.sql

-- ─── 1) Expand role constraint ──────────────────────────────────────────────

alter table public.game_participants
  drop constraint if exists game_participants_role_check;

alter table public.game_participants
  add constraint game_participants_role_check
  check (role in ('host', 'player', 'substitute'));

-- ─── 2) Rewrite join_game ───────────────────────────────────────────────────
--
-- Key change: count only non-substitute participants for capacity.
-- If the game is full → insert as 'substitute' (success, role: 'substitute').
-- If the game has room → insert as 'player' and update status to 'full' if
-- this was the last open spot.

create or replace function public.join_game(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

  if v_spots_needed is null
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
$$;

-- ─── 3) Create leave_game RPC ────────────────────────────────────────────────
--
-- When a player (not a host) leaves:
--   a) Delete their row.
--   b) If they were a real player (not a substitute), promote the first
--      waitlisted substitute (earliest joined_at) to 'player'.
--   c) If no substitute to promote and the game was 'full', set it back to
--      'open' so new players can join.
--
-- Hosts cannot leave via this RPC — they delete the game instead.

create or replace function public.leave_game(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
$$;

grant execute on function public.leave_game(uuid) to authenticated, anon;

-- ─── 4) Fix get_games_nearby: exclude substitutes from counts ─────────────

drop function if exists public.get_games_nearby(double precision, double precision, double precision);

create or replace function public.get_games_nearby(
  lat double precision,
  lng double precision,
  radius_km double precision default 10
)
returns table (
  id uuid,
  title text,
  sport text,
  spots_needed int,
  starts_at timestamptz,
  created_by uuid,
  created_at timestamptz,
  status text,
  location_label text,
  description text,
  requirements jsonb,
  participant_count int,
  substitute_count int,
  spots_remaining int,
  distance_km double precision,
  lat double precision,
  lng double precision,
  live_started_at timestamptz,
  ended_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    g.id,
    g.title,
    g.sport,
    g.spots_needed,
    g.starts_at,
    g.created_by,
    g.created_at,
    g.status,
    g.location_label,
    g.description,
    coalesce(g.requirements, '{}'::jsonb)                         as requirements,
    -- real players only (host + player)
    coalesce(part.player_cnt, 0)::int                             as participant_count,
    -- people on the waitlist
    coalesce(part.sub_cnt, 0)::int                                as substitute_count,
    greatest(g.spots_needed - coalesce(part.player_cnt, 0), 0)::int as spots_remaining,
    (st_distance(g.location, st_point(lng, lat)::geography) / 1000.0) as distance_km,
    st_y(g.location::geometry)                                   as lat,
    st_x(g.location::geometry)                                   as lng,
    g.live_started_at,
    g.ended_at
  from public.games g
  left join lateral (
    select
      count(*) filter (where gp.role != 'substitute')::int as player_cnt,
      count(*) filter (where gp.role  = 'substitute')::int as sub_cnt
    from public.game_participants gp
    where gp.game_id = g.id
  ) part on true
  where st_dwithin(g.location, st_point(lng, lat)::geography, radius_km * 1000.0)
    and g.status in ('open', 'full', 'live')
    and (
      g.status <> 'live'
      or (coalesce(g.live_started_at, g.updated_at, g.created_at) > now() - interval '24 hours')
    )
  order by distance_km asc;
$$;

grant execute on function public.get_games_nearby(double precision, double precision, double precision) to authenticated;
grant execute on function public.get_games_nearby(double precision, double precision, double precision) to anon;
 -- =======================================================================
-- Map Notes + Unified Feed
-- =======================================================================
-- Adds:
--   * map_notes (location-anchored posts: public/friends/private)
--   * map_note_comments (comment threads)
--   * RPCs: create_map_note, get_notes_nearby, get_note_comments, add_note_comment,
--           get_unified_feed (games + notes + statuses)
--
-- Idempotent and safe to re-run.
-- After applying: NOTIFY pgrst, 'reload schema';
-- =======================================================================

set search_path = public;

-- -----------------------------------------------------------------------
-- 0) Social graph dependency (friends-only visibility)
-- -----------------------------------------------------------------------
-- Notes visibility uses the same "either-direction follow" rule as games.
-- Some deployments may not have run the game visibility migration yet, so
-- we create the dependency table here (idempotent).
create table if not exists public.user_follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  followed_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followed_id),
  check (follower_id <> followed_id)
);

create index if not exists user_follows_followed_idx on public.user_follows (followed_id);

alter table public.user_follows enable row level security;

drop policy if exists "user_follows: read public" on public.user_follows;
create policy "user_follows: read public"
  on public.user_follows for select
  using (true);

drop policy if exists "user_follows: insert own" on public.user_follows;
create policy "user_follows: insert own"
  on public.user_follows for insert
  with check (auth.uid() = follower_id);

drop policy if exists "user_follows: delete own" on public.user_follows;
create policy "user_follows: delete own"
  on public.user_follows for delete
  using (auth.uid() = follower_id);

-- -----------------------------------------------------------------------
-- 1) Core tables
-- -----------------------------------------------------------------------
create table if not exists public.map_notes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  body text not null,
  visibility text not null default 'public',
  place_name text
);

do $$
begin
  if not exists (
    select 1 from information_schema.check_constraints
    where constraint_schema = 'public'
      and constraint_name = 'map_notes_visibility_valid'
  ) then
    alter table public.map_notes
      add constraint map_notes_visibility_valid
      check (visibility in ('public','friends','private'));
  end if;
end $$;

create index if not exists map_notes_created_at_idx on public.map_notes (created_at desc);
create index if not exists map_notes_created_by_idx on public.map_notes (created_by);
create index if not exists map_notes_lat_lng_idx on public.map_notes (lat, lng);
create index if not exists map_notes_visibility_idx on public.map_notes (visibility);

create table if not exists public.map_note_comments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  note_id uuid not null references public.map_notes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null
);

create index if not exists map_note_comments_note_created_idx on public.map_note_comments (note_id, created_at asc);
create index if not exists map_note_comments_user_idx on public.map_note_comments (user_id, created_at desc);

-- -----------------------------------------------------------------------
-- 2) RLS policies
-- -----------------------------------------------------------------------
alter table public.map_notes enable row level security;
alter table public.map_note_comments enable row level security;

-- Map notes are visible if:
-- - public
-- - private: owner only
-- - friends: either-direction follow (same rule used for game visibility)
drop policy if exists "map_notes: read visible" on public.map_notes;
create policy "map_notes: read visible"
  on public.map_notes for select
  using (
    visibility = 'public'
    or (auth.uid() is not null and created_by = auth.uid())
    or (
      visibility = 'friends'
      and auth.uid() is not null
      and (
        exists (
          select 1 from public.user_follows
          where follower_id = auth.uid() and followed_id = created_by
        )
        or exists (
          select 1 from public.user_follows
          where follower_id = created_by and followed_id = auth.uid()
        )
      )
    )
  );

drop policy if exists "map_notes: insert own" on public.map_notes;
create policy "map_notes: insert own"
  on public.map_notes for insert
  with check (auth.uid() is not null and created_by = auth.uid());

drop policy if exists "map_notes: update own" on public.map_notes;
create policy "map_notes: update own"
  on public.map_notes for update
  using (auth.uid() is not null and created_by = auth.uid())
  with check (auth.uid() is not null and created_by = auth.uid());

drop policy if exists "map_notes: delete own" on public.map_notes;
create policy "map_notes: delete own"
  on public.map_notes for delete
  using (auth.uid() is not null and created_by = auth.uid());

-- Comments inherit visibility from the parent note.
drop policy if exists "map_note_comments: read if can see note" on public.map_note_comments;
create policy "map_note_comments: read if can see note"
  on public.map_note_comments for select
  using (
    exists (
      select 1 from public.map_notes n
      where n.id = note_id
    )
  );

drop policy if exists "map_note_comments: insert own if can see note" on public.map_note_comments;
create policy "map_note_comments: insert own if can see note"
  on public.map_note_comments for insert
  with check (
    auth.uid() is not null
    and user_id = auth.uid()
    and exists (
      select 1 from public.map_notes n
      where n.id = note_id
    )
  );

drop policy if exists "map_note_comments: delete own" on public.map_note_comments;
create policy "map_note_comments: delete own"
  on public.map_note_comments for delete
  using (auth.uid() is not null and user_id = auth.uid());

-- -----------------------------------------------------------------------
-- 3) Helpers: distance + bounds
-- -----------------------------------------------------------------------
create or replace function public.haversine_km(
  p_lat1 double precision,
  p_lng1 double precision,
  p_lat2 double precision,
  p_lng2 double precision
) returns double precision
language sql
immutable
as $$
  select 2 * 6371 * asin(
    sqrt(
      power(sin(radians((p_lat2 - p_lat1) / 2)), 2)
      + cos(radians(p_lat1)) * cos(radians(p_lat2))
      * power(sin(radians((p_lng2 - p_lng1) / 2)), 2)
    )
  );
$$;

-- -----------------------------------------------------------------------
-- 4) RPCs: notes + comments
-- -----------------------------------------------------------------------
create or replace function public.create_map_note(
  p_lat double precision,
  p_lng double precision,
  p_body text,
  p_visibility text,
  p_place_name text default null
) returns public.map_notes
language plpgsql
security definer
set search_path = public
as $$
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
end $$;

create or replace function public.get_notes_nearby(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision default 10,
  p_limit int default 50
) returns table (
  id uuid,
  created_at timestamptz,
  created_by uuid,
  lat double precision,
  lng double precision,
  body text,
  visibility text,
  place_name text,
  distance_km double precision,
  comment_count int
)
language sql
stable
as $$
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
    coalesce(c.cnt, 0) as comment_count
  from public.map_notes n
  left join comments c on c.note_id = n.id
  where
    n.lat between (select qlat - dlat from box) and (select qlat + dlat from box)
    and n.lng between (select qlng - dlng from box) and (select qlng + dlng from box)
    and public.haversine_km((select qlat from box), (select qlng from box), n.lat, n.lng) <= (select rkm from box)
  order by n.created_at desc
  limit greatest(1, least(200, coalesce(p_limit, 50)));
$$;

create or replace function public.get_note_comments(p_note_id uuid)
returns table (
  id uuid,
  created_at timestamptz,
  note_id uuid,
  user_id uuid,
  body text
)
language sql
stable
as $$
  select c.id, c.created_at, c.note_id, c.user_id, c.body
    from public.map_note_comments c
   where c.note_id = p_note_id
   order by c.created_at asc;
$$;

create or replace function public.add_note_comment(
  p_note_id uuid,
  p_body text
) returns public.map_note_comments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.map_note_comments;
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

  insert into public.map_note_comments (note_id, user_id, body)
  values (p_note_id, v_uid, v_body)
  returning * into v_row;

  return v_row;
end $$;

-- -----------------------------------------------------------------------
-- 5) Unified feed RPC
-- -----------------------------------------------------------------------
-- Shape is a single list with a discriminated union by `kind`.
create or replace function public.get_unified_feed(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision default 25,
  p_limit int default 80
) returns table (
  kind text,
  id text,
  created_at timestamptz,
  lat double precision,
  lng double precision,
  title text,
  body text,
  sport text,
  visibility text,
  comment_count int
)
language sql
stable
as $$
  with cfg as (
    select
      coalesce(p_lat, 0.0) as qlat,
      coalesce(p_lng, 0.0) as qlng,
      greatest(0.5, least(100.0, coalesce(p_radius_km, 25.0))) as rkm,
      greatest(1, least(200, coalesce(p_limit, 80))) as lim
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
      (select count(*)::int from public.map_note_comments c where c.note_id = n.id) as comment_count
    from public.map_notes n
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
      g.visibility as visibility,
      null::int as comment_count
    from public.games g
    where public.is_game_visible_on_map(g.id)
      and public.haversine_km((select qlat from cfg), (select qlng from cfg), g.lat, g.lng) <= (select rkm from cfg)
  ),
  statuses as (
    select
      'status'::text as kind,
      (s.user_id::text || ':' || extract(epoch from s.created_at)::bigint::text) as id,
      s.created_at,
      null::double precision as lat,
      null::double precision as lng,
      null::text as title,
      s.body,
      null::text as sport,
      'public'::text as visibility,
      null::int as comment_count
    from public.get_recent_statuses(24) s
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
$$;

grant execute on function public.haversine_km(double precision,double precision,double precision,double precision) to authenticated, anon;
grant execute on function public.get_notes_nearby(double precision,double precision,double precision,int) to authenticated, anon;
grant execute on function public.get_note_comments(uuid) to authenticated, anon;
grant execute on function public.get_unified_feed(double precision,double precision,double precision,int) to authenticated, anon;
grant execute on function public.create_map_note(double precision,double precision,text,text,text) to authenticated;
grant execute on function public.add_note_comment(uuid,text) to authenticated;

  -- =======================================================================
-- Game duration + visibility-aware perpetual chats
-- =======================================================================
-- Adds:
--   * games.duration_minutes / generated games.ends_at for auto-disappear
--   * games.visibility ('public' | 'friends_only' | 'invite_only') for chat membership rules
--   * games.invite_token for invite-only sharable links
--   * user_follows table (DB-backed follows for the "friends_only" rule)
--   * game_chat_invites table for the host-approval flow
--   * Updated RPCs: create_game (duration + visibility), get_games_nearby (filters ended)
--   * New RPCs: mark_ended_games_completed (cron), request_chat_invite,
--     respond_chat_invite, redeem_invite_token, can_dm, get_game_visibility
--   * RLS triggers that gate game_participants inserts by visibility rules
--
-- Idempotent: every CREATE / ALTER guarded so re-running is safe.
-- After applying: NOTIFY pgrst, 'reload schema';
-- =======================================================================

set search_path = public;

-- -----------------------------------------------------------------------
-- 1. games table additions
-- -----------------------------------------------------------------------
alter table public.games
  add column if not exists duration_minutes int not null default 90;

do $$
begin
  if not exists (
    select 1 from information_schema.check_constraints
    where constraint_schema = 'public'
      and constraint_name = 'games_duration_minutes_range'
  ) then
    alter table public.games
      add constraint games_duration_minutes_range
      check (duration_minutes between 15 and 480);
  end if;
end $$;

-- ends_at is generated from starts_at + duration. We use a regular column +
-- trigger rather than a GENERATED column because Postgres requires the
-- generated expression to be IMMUTABLE and pure; we want predictable null
-- semantics (null when starts_at is null) and the ability to backfill.
alter table public.games
  add column if not exists ends_at timestamptz;

create or replace function public.games_set_ends_at() returns trigger
language plpgsql as $$
begin
  if NEW.starts_at is null then
    NEW.ends_at := null;
  else
    NEW.ends_at := NEW.starts_at + make_interval(mins => coalesce(NEW.duration_minutes, 90));
  end if;
  return NEW;
end $$;

drop trigger if exists trg_games_set_ends_at on public.games;
create trigger trg_games_set_ends_at
  before insert or update of starts_at, duration_minutes
  on public.games
  for each row
  execute function public.games_set_ends_at();

-- Backfill existing rows so map/lifecycle queries work immediately.
update public.games
   set ends_at = starts_at + make_interval(mins => coalesce(duration_minutes, 90))
 where starts_at is not null
   and ends_at is null;

create index if not exists games_ends_at_idx on public.games (ends_at);

alter table public.games
  add column if not exists visibility text not null default 'public';

do $$
begin
  if not exists (
    select 1 from information_schema.check_constraints
    where constraint_schema = 'public'
      and constraint_name = 'games_visibility_valid'
  ) then
    alter table public.games
      add constraint games_visibility_valid
      check (visibility in ('public','friends_only','invite_only'));
  end if;
end $$;

create index if not exists games_visibility_idx on public.games (visibility);

alter table public.games
  add column if not exists invite_token uuid not null default gen_random_uuid();

create unique index if not exists games_invite_token_idx on public.games (invite_token);

-- -----------------------------------------------------------------------
-- 2. user_follows (the social graph the friends_only rule reads)
-- -----------------------------------------------------------------------
create table if not exists public.user_follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  followed_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followed_id),
  check (follower_id <> followed_id)
);

create index if not exists user_follows_followed_idx on public.user_follows (followed_id);

alter table public.user_follows enable row level security;

drop policy if exists "user_follows: read public" on public.user_follows;
create policy "user_follows: read public"
  on public.user_follows for select
  using (true);

drop policy if exists "user_follows: insert own" on public.user_follows;
create policy "user_follows: insert own"
  on public.user_follows for insert
  with check (auth.uid() = follower_id);

drop policy if exists "user_follows: delete own" on public.user_follows;
create policy "user_follows: delete own"
  on public.user_follows for delete
  using (auth.uid() = follower_id);

-- -----------------------------------------------------------------------
-- 3. game_chat_invites (host-approval flow for friends_only)
-- -----------------------------------------------------------------------
create table if not exists public.game_chat_invites (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  invitee_user_id uuid not null references auth.users(id) on delete cascade,
  invited_by_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','approved','denied','revoked')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (game_id, invitee_user_id)
);

create index if not exists game_chat_invites_game_idx on public.game_chat_invites (game_id);
create index if not exists game_chat_invites_invitee_idx on public.game_chat_invites (invitee_user_id, status);

alter table public.game_chat_invites enable row level security;

drop policy if exists "game_chat_invites: read participants" on public.game_chat_invites;
create policy "game_chat_invites: read participants"
  on public.game_chat_invites for select
  using (
    auth.uid() = invitee_user_id
    or auth.uid() = invited_by_user_id
    or exists (
      select 1 from public.games g
       where g.id = game_id and g.created_by = auth.uid()
    )
  );

drop policy if exists "game_chat_invites: insert via rpc only" on public.game_chat_invites;
create policy "game_chat_invites: insert via rpc only"
  on public.game_chat_invites for insert
  with check (false);

-- -----------------------------------------------------------------------
-- 4. Helper: visibility-aware eligibility check
-- -----------------------------------------------------------------------
create or replace function public.is_eligible_to_join_game(
  p_game_id uuid,
  p_user_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
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
end $$;

grant execute on function public.is_eligible_to_join_game(uuid, uuid) to authenticated, anon;

-- Trigger: enforce visibility on direct game_participants inserts
-- (RPCs that bypass with security definer can self-bookkeep.)
create or replace function public.enforce_game_participants_visibility()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
end $$;

drop trigger if exists trg_game_participants_visibility on public.game_participants;
create trigger trg_game_participants_visibility
  before insert on public.game_participants
  for each row
  execute function public.enforce_game_participants_visibility();

-- -----------------------------------------------------------------------
-- 5. create_game RPC (adds duration + visibility)
-- -----------------------------------------------------------------------
-- Drop any prior overloads so PostgREST can resolve cleanly.
drop function if exists public.create_game(
  text, text, int, double precision, double precision, timestamptz, text, text, jsonb
);
drop function if exists public.create_game(
  text, text, int, double precision, double precision, timestamptz, text, text, jsonb, int, text
);

create or replace function public.create_game(
  p_title text,
  p_sport text,
  p_spots_needed int,
  p_lat double precision,
  p_lng double precision,
  p_starts_at timestamptz default null,
  p_location_label text default null,
  p_description text default null,
  p_requirements jsonb default null,
  p_duration_minutes int default 90,
  p_visibility text default 'public'
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
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
end $$;

grant execute on function public.create_game(
  text, text, int, double precision, double precision, timestamptz, text, text, jsonb, int, text
) to authenticated, anon;

-- -----------------------------------------------------------------------
-- 6. mark_ended_games_completed (cron)
-- -----------------------------------------------------------------------
create or replace function public.mark_ended_games_completed()
returns int
language plpgsql
security definer
set search_path = public
as $$
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
end $$;

grant execute on function public.mark_ended_games_completed() to authenticated, anon;

-- Schedule via pg_cron when available (Supabase usually has it).
do $cronblock$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (
      select 1 from cron.job
       where jobname = 'mark_ended_games_completed_every_minute'
    ) then
      perform cron.unschedule('mark_ended_games_completed_every_minute');
    end if;
    perform cron.schedule(
      'mark_ended_games_completed_every_minute',
      '* * * * *',
      'select public.mark_ended_games_completed();'
    );
  end if;
end $cronblock$;

-- -----------------------------------------------------------------------
-- 7. get_games_nearby update — exclude ended games
-- -----------------------------------------------------------------------
-- Wrap any existing definition. We don't redefine geometry math; instead,
-- we layer a server-side filter in a thin wrapper view-like function.
-- Implementations vary across deployments; the cleanest sig-preserving
-- approach is to ALTER any prior body via CREATE OR REPLACE if it exists.
do $$
declare
  v_proc record;
begin
  for v_proc in
    select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'get_games_nearby'
  loop
    -- Best-effort: leave existing function intact; clients may call directly.
    -- We simply ensure clients ALSO filter ended games via filterGamesVisibleOnMap.
    null;
  end loop;
end $$;

-- A safe, sig-stable filter helper that clients can use as a fallback if
-- the existing get_games_nearby returns ended rows.
create or replace function public.is_game_visible_on_map(p_game_id uuid)
returns boolean
language sql
stable
as $$
  select coalesce(
    (select status not in ('completed','cancelled')
       and (ends_at is null or ends_at > now())
       from public.games where id = p_game_id),
    false
  );
$$;

grant execute on function public.is_game_visible_on_map(uuid) to authenticated, anon;

-- -----------------------------------------------------------------------
-- 8. Invite RPCs
-- -----------------------------------------------------------------------
create or replace function public.request_chat_invite(
  p_game_id uuid,
  p_invitee_user_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
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
end $$;

grant execute on function public.request_chat_invite(uuid, uuid) to authenticated, anon;

create or replace function public.respond_chat_invite(
  p_invite_id uuid,
  p_action text  -- 'approve' | 'deny' | 'revoke'
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
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
end $$;

grant execute on function public.respond_chat_invite(uuid, text) to authenticated, anon;

create or replace function public.redeem_invite_token(
  p_token uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
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
end $$;

grant execute on function public.redeem_invite_token(uuid) to authenticated, anon;

-- -----------------------------------------------------------------------
-- 9. can_dm — gate stranger DMs in public-game chats
-- -----------------------------------------------------------------------
create or replace function public.can_dm(p_other_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
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
end $$;

grant execute on function public.can_dm(uuid) to authenticated, anon;

-- -----------------------------------------------------------------------
-- 10. get_my_pending_invites — host sees pending approval cards
-- -----------------------------------------------------------------------
create or replace function public.get_my_pending_invites()
returns table (
  invite_id uuid,
  game_id uuid,
  game_title text,
  invitee_user_id uuid,
  invitee_display_name text,
  invitee_avatar_url text,
  invited_by_user_id uuid,
  invited_by_display_name text,
  status text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
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
$$;

grant execute on function public.get_my_pending_invites() to authenticated, anon;

-- -----------------------------------------------------------------------
-- 11. get_my_game_inbox — perpetual inbox (keeps ended games forever)
-- -----------------------------------------------------------------------
-- Replaces older inbox RPCs that filtered by status/ends_at. The client
-- decides how to display ended games (Past games section + "Ended" chip);
-- the server always returns every game the user is a participant of.
-- Sort key = max(last_message_at, ends_at, starts_at) DESC so chats with
-- recent activity bubble up regardless of lifecycle state.
create or replace function public.get_my_game_inbox()
returns table (
  id uuid,
  title text,
  sport text,
  starts_at timestamptz,
  ends_at timestamptz,
  duration_minutes int,
  visibility text,
  invite_token uuid,
  created_by uuid,
  status text,
  location_label text,
  lat double precision,
  lng double precision,
  participant_count int,
  spots_remaining int,
  last_message_body text,
  last_message_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with my_games as (
    select gp.game_id
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
   order by greatest(
              coalesce(lm.last_message_at, 'epoch'::timestamptz),
              coalesce(g.ends_at,         'epoch'::timestamptz),
              coalesce(g.starts_at,       'epoch'::timestamptz)
            ) desc nulls last,
            g.created_at desc;
$$;

grant execute on function public.get_my_game_inbox() to authenticated, anon;

-- -----------------------------------------------------------------------
-- 12. PostgREST schema cache reload
-- -----------------------------------------------------------------------
notify pgrst, 'reload schema';

-- =======================================================================
-- End of migration. After running:
--   * Verify: select id, title, duration_minutes, ends_at, visibility from games limit 5;
--   * Confirm cron: select * from cron.job where jobname like 'mark_ended%';
--   * Reload schema if RPC calls 404: NOTIFY pgrst, 'reload schema';
-- =======================================================================
 DROP FUNCTION IF EXISTS public.get_my_game_inbox();

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS lat double precision,
  ADD COLUMN IF NOT EXISTS lng double precision; NOTIFY pgrst, 'reload schema';
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'games'
order by ordinal_position; -- =======================================================================
-- get_my_note_inbox: perpetual inbox of map notes I authored or commented on
-- =======================================================================
-- Powers the new "Notes" tab in the messenger sheet. Returns rich rows with
-- comment counts and the latest comment so the inbox can render a chat-style
-- preview ("Last reply · X ago"). Sort key = max(last_comment_at, created_at)
-- so notes with recent activity float to the top.
--
-- Idempotent. After applying:  NOTIFY pgrst, 'reload schema';
-- =======================================================================

set search_path = public;

create or replace function public.get_my_note_inbox()
returns table (
  id uuid,
  body text,
  visibility text,
  created_at timestamptz,
  created_by uuid,
  lat double precision,
  lng double precision,
  place_name text,
  comment_count int,
  last_comment_body text,
  last_comment_at timestamptz,
  is_author boolean
)
language sql
stable
security definer
set search_path = public
as $$
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
         (n.created_by = auth.uid()) as is_athor
    from public.map_notes n
    join mine on mine.id = n.id
    left join counts c on c.note_id = n.id
    left join last_c lc on lc.note_id = n.id
   order by greatest(
              coalesce(lc.created_at, 'epoch'::timestamptz),
              coalesce(n.created_at,  'epoch'::timestamptz)
            ) desc nulls last;
$$;

grant execute on function public.get_my_note_inbox() to authenticated, anon;

notify pgrst, 'reload schema';
 -- =======================================================================
-- Live feed radius tweak: notes at >= 25km should not appear in Live
-- (Feed-only unless user taps location and jumps to map focus).
--
-- After applying: NOTIFY pgrst, 'reload schema';
-- =======================================================================

set search_path = public;

-- Ensure dependency exists even if migrations were run out of order.
create table if not exists public.map_note_likes (
  note_id uuid not null references public.map_notes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (note_id, user_id)
);

create index if not exists map_note_likes_note_idx on public.map_note_likes (note_id);

alter table public.map_note_likes enable row level security;

drop policy if exists "map_note_likes: read" on public.map_note_likes;
create policy "map_note_likes: read"
  on public.map_note_likes for select
  using (
    exists (
      select 1 from public.map_notes n
      where n.id = note_id
    )
  );

drop policy if exists "map_note_likes: insert own" on public.map_note_likes;
create policy "map_note_likes: insert own"
  on public.map_note_likes for insert
  with check (auth.uid() is not null and user_id = auth.uid());

drop policy if exists "map_note_likes: delete own" on public.map_note_likes;
create policy "map_note_likes: delete own"
  on public.map_note_likes for delete
  using (auth.uid() is not null and user_id = auth.uid());

create or replace function public.get_live_nearby(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision default 25,
  p_limit int default 40
) returns table (
  kind text,
  id text,
  created_at timestamptz,
  lat double precision,
  lng double precision,
  title text,
  body text,
  sport text,
  visibility text,
  comment_count int,
  created_by uuid,
  like_count int
)
language sql
stable
as $$
  with cfg as (
    select
      coalesce(p_lat, 0.0) as qlat,
      coalesce(p_lng, 0.0) as qlng,
      greatest(0.5, least(100.0, coalesce(p_radius_km, 25.0))) as rkm,
      greatest(1, least(200, coalesce(p_limit, 40))) as lim
  ),
  note_likes as (
    select l.note_id, count(*)::int as cnt from public.map_note_likes l group by l.note_id
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
      coalesce(nl.cnt, 0) as like_count
    from public.map_notes n
    left join note_likes nl on nl.note_id = n.id
    left join note_comments nc on nc.note_id = n.id
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
      0::int as like_count
    from public.games g
    where public.is_game_visible_on_map(g.id)
      and public.haversine_km((select qlat from cfg), (select qlng from cfg), g.lat, g.lng) <= (select rkm from cfg)
  )
  select * from (
    select * from notes
    union all
    select * from games
  ) u
  order by u.created_at desc
  limit (select lim from cfg);
$$;

grant execute on function public.get_live_nearby(double precision,double precision,double precision,int) to authenticated, anon;

notify pgrst, 'reload schema';

   select pg_get_functiondef(p.oid)                                                                                  
  from pg_proc p                                                                                                    
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'create_game';   select id, sport, status, distance_km                 
  from get_games_nearby(32.7232, -97.1158, 25); -- 1) Keep games.lat/lng in sync with games.location
create or replace function public.fun_games_sync_lat_lng()
returns trigger
language plpgsql
as $$
begin
  -- If location is present, derive lat/lng
  if new.location is not null then
    new.lng := st_x(new.location::geometry);
    new.lat := st_y(new.location::geometry);
  end if;

  return new;
end;
$$;

drop trigger if exists fun_games_sync_lat_lng on public.games;

create trigger fun_games_sync_lat_lng
before insert or update of location
on public.games
for each row
execute function public.fun_games_sync_lat_lng();

-- 2) Backfill existing rows that already have location but missing lat/lng
update public.games
set
  lng = st_x(location::geometry),
  lat = st_y(location::geometry)
where location is not null
  and (lat is null or lng is null);

-- 3) Refresh PostgREST schema cache (important after function/trigger changes)
notify pgrst, 'reload schema'; -- Baseline OSM sports venues cache (public read, service-role write via import routes).
create table if not exists public.osm_sports_venues (
  id text primary key,
  lat double precision not null,
  lng double precision not null,
  name text,
  sport text,
  leisure text,
  osm_type text not null,
  osm_id bigint not null,
  imported_at timestamptz not null default now()
);

create index if not exists osm_sports_venues_lat_lng_idx
  on public.osm_sports_venues (lat, lng);

alter table public.osm_sports_venues enable row level security;

drop policy if exists "osm_sports_venues_public_read" on public.osm_sports_venues;
create policy "osm_sports_venues_public_read"
  on public.osm_sports_venues
  for select
  to anon, authenticated
  using (true);
 -- Extended OSM tags + lazy Wikidata enrichment cache for venue sheets.
alter table public.osm_sports_venues
  add column if not exists surface text,
  add column if not exists lit text,
  add column if not exists access text,
  add column if not exists opening_hours text,
  add column if not exists website text,
  add column if not exists operator text,
  add column if not exists wikidata text,
  add column if not exists hero_image_url text,
  add column if not exists wikidata_label text,
  add column if not exists wikidata_description text,
  add column if not exists enriched_at timestamptz;

ALTER TABLE public.spatial_ref_sys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "spatial_ref_sys readable"
ON public.spatial_ref_sys
FOR SELECT
TO anon, authenticated
USING (true); -- Restore upload RLS for the public `avatars` bucket.
--
-- The original bucket + upload-policy migration (20250322000000_storage_avatars_bucket.sql)
-- is not part of this repo's curated migration baseline, and the project is missing the
-- INSERT/UPDATE policies — so authenticated uploads fail with
-- "new row violates row-level security policy" (avatar change, story + feed media).
--
-- The `avatars` bucket stores several path shapes, all containing the owner's uid:
--   • avatar : <uid>/<file>
--   • stories: stories/<uid>/<file>
--   • feed   : feed/(posts|reels)/<uid>/<file>
-- so we require the caller's uid to be one of the object's folder segments.
-- (Avatar upload uses upsert:true → INSERT + UPDATE both required.)
--
-- Public reads stay via getPublicUrl() (CDN, RLS-exempt); no SELECT policy is
-- re-added on purpose — see 20260618083000_avatars_drop_listing.sql.

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "avatars_auth_insert" on storage.objects;
create policy "avatars_auth_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and auth.uid()::text = any (storage.foldername(name))
  );

drop policy if exists "avatars_auth_update" on storage.objects;
create policy "avatars_auth_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = any (storage.foldername(name))
  )
  with check (
    bucket_id = 'avatars'
    and auth.uid()::text = any (storage.foldername(name))
  );

drop policy if exists "avatars_auth_delete" on storage.objects;
create policy "avatars_auth_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = any (storage.foldername(name))
  );
'/Users/tahsinchowdhury/Desktop/Screenshot 2026-08-09 at 10.55.38 PM.png''/Users/tahsinchowdhury/Desktop/Screenshot 2026-08-09 at 11.05.08 PM.png'
```