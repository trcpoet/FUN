# FUN Sports Map — Product Roadmap & Checklist

> Living checklist for FUN. Synthesizes the brain-dump into ~11 epics, grounded against the actual codebase. Check items off as they ship. Full planning rationale: `~/.claude/plans/fun-sports-map-steady-eich.md`.

## Context

A *definitive* plan: what to build, the **best** features, a **Things-To-Do** list (List A), and a **chronological** list (List B).

**Strategic decisions locked (2026-06-25):**
1. **Web-first.** Keep iterating on React/Vite to cement business logic; React Native + AWS is a *later port*.
2. **Headline differentiator = Adventure & Travel** (map-native discovery: places to play, trips, friends' spots & refuel). **AI-trainer** and **teams/leagues** are fast-follows.
3. **Sprint 1 optimizes for Liveness + Foundations**, two parallel workstreams.

**Outcome:** turn a sprawl wishlist into a sequenced build, lean into the one moat clones can't copy (the real-world map), and avoid burning months on commodity features before there's a user base.

---

## Reality check — most of the "to-do" list already works

The notes conflate *broken* with *missing*. Already built and working today:
- **Map shell** (centering, recenter, satellite/streets toggle) — `src/app/App.tsx`, `src/app/components/MapboxMap.tsx`
- **Venues** (Supabase cache → Overpass, off-thread clustering, persists, ~67 sports) — `src/app/lib/sportsVenues.ts`
- **Games** (long-press create, join, live/ended lifecycle) — `src/app/lib/mapGameTimer.ts`; `completeGame` RPC exists, no results UI
- **Notes** (pins, comment threads, inbox, realtime) — `src/app/lib/mapNotes.ts`; **perpetual, no map TTL**
- **Presence/Ghost** (DB-backed, server-enforced visibility) — **everyone defaults to Ghost → "no players on map"**
- **Filters + filter-trust** — `src/app/lib/gameFilters.ts`
- **Feed** (5 tabs; notes + games both appear) — `src/app/pages/Feed.tsx`
- **Profile** (~40 components: sports, skills, metrics, ratings, stories, posts/reels) — `src/app/pages/Profile.tsx`
- **Messaging** (group + DM + notes) — `src/app/components/GameMessengerSheet.tsx`
- **Notifications** (DB-backed, deep-links) — `src/hooks/useNotifications.ts`
- **Follows** (DB-backed `user_follows`)

**Genuinely missing backends:** teams, events/promoted-events, player reviews (only `sportsmanship_avg`), e-commerce, global ranking/ML, referees, matchmaking, AI trainer, friends-list UI, sharing→invite-accept, race/demographic fields, wearable data.

---

## Product thesis & "best features"

**Thesis: *the world is the feed.*** Every clone you named is feed/activity-native; FUN is **map-native and real-world**. Rule for every feature: *does it make the real-world loop better?* (See activity near you → join/create a game → meet people → chat → it lands in your history.) Social/feed/profile = supporting cast, not the product.

**Build (on-thesis):** Liveness · Adventure & Travel · Friends/Events/Sharing · AI trainer + chatbot · Foundations.
**Defer / skeptical (commodity or premature):** e-commerce + web3 · ML ranking from wearables · betting · 3D-everything + 3D character editor · IG/FB/LinkedIn API integration · Mingle subscription · PERN university system · race/demographic fields (sensitive). Start ranking with self-reported + heuristic, **not** ML.

---

## LIST A — Things To Do (checklist by bucket)

Status tags: ✅ works (gap) · ⚠️ partial · ❌ missing · 🅿️ parked.

### A. Bugs & dead ends — *Sprint 1*
- [ ] Fix PublicProfile "Message" → `/?dm=<id>` **dead link** (add handler in `App.tsx`) ❌
- [ ] Wire Feed "Similar" & "Following" tabs ⚠️
- [ ] Wire Explore "Hot Picks" tiles (onClick/navigation) ⚠️
- [ ] Wire "Post Update" FAB → composer + Feed Search ⚠️
- [ ] Real `followersCount`; read follow-state from DB not localStorage ✅
- [ ] Remove displayed filter chips ("remove filter choices shown") — `FiltersModal` ✅
- [ ] Triage remaining mobile issues (location refresh/centering, venues-disappear-on-search, buttons-move, "searching near Dallas" toast) — verify vs recent commits ⚠️

### B. Liveness — *Sprint 1*
- [ ] Opt-in **fuzzed presence** (stable random spot in 2–5km ring); keep Ghost as a choice; reconsider default ❌
- [ ] Ambient/seeded activity: app-suggested games + "people near you" ❌
- [ ] **Note TTL** — expire on map after 24h–1wk, persist in feed/history ❌
- [ ] Post-game **results UI** (winner/score via existing `completeGame`) ✅
- [ ] Non-intrusive "near you" prompts (reuse top-left toasts) ⚠️

### C. Friends & social glue — *Phase 2*
- [ ] Friends list: **connected / near you / mutuals** ❌
- [ ] Follow-**request → accept** flow + private-profile approve ❌
- [ ] Notification → deep-link-to-action gaps ⚠️
- [ ] Tap any player → profile; unify follow / message / about buttons ⚠️

### D. Events & sharing — *Phase 2*
- [ ] **Dev Events page** (games happening + venues nearby + promoted free/paid) — new `events` table ❌
- [ ] **Sharing → invitation acceptance** (host must accept) ❌
- [ ] Game/sport icon beside chat tabs ⚠️

### E. Adventure & Travel — *Phase 3 (differentiator)*
- [ ] **Venue list near you** + richer cards (Google Places: images/info/price, games-held-here) ❌
- [ ] **Adventure/trip planning** (places to see, drive through, play in; group adventures) ❌
- [ ] **Beli-style** friends' refuel spots ❌
- [ ] **Add-a-venue** (user-submitted) ❌
- [ ] Explore as "local vibe" + **venues-as-hosts** (bars/libraries host indoor games) ❌
- [ ] Clustering config: parks, high schools, rec centers, gyms, more sports, per-sport backgrounds — `venueClusterEngine.ts`, `osmSportTags.ts` ⚠️

### F. AI & data — *Phase 4 (fast-follow)*
- [ ] AI **training journal/tracker** (self-reported + heuristic) ❌
- [ ] **AI chatbot** (nav + training/venue/game/athlete suggestions, travel companion) ❌
- [ ] Movement/wearable data **schema** (ingest/ML later) ❌
- [ ] Simple heuristic **global ranking** (feeds matchmaking) ❌

### G. Matchmaking & teams — *Phase 5*
- [ ] **Matchmaking** (Tinder-style; wires "Similar" tab) ❌
- [ ] **Teams** (create/add/compete/chat; chemistry later) ❌
- [ ] **Referee invites** (both teams agree; not on either team) ❌

### H. Profile & content — *Phase 6*
- [ ] Reimagine profile (about carousel; resume-style hideable fields; trim "useless" display-name/handle) ⚠️
- [ ] Normalize **stories/posts/reels** into real tables (out of `athlete_profile` JSON) ⚠️
- [ ] Stories in feed + explore; create / append ⚠️
- [ ] **Player ratings & reviews** (skill + behavior) — build on `sportsmanship_avg` ❌
- [ ] Clean post/note UI; like comments/messages; image/gif in comments & DMs ⚠️
- [ ] LinkedIn-style **History** (replaces "which note you wrote on" tab) ⚠️

### I. Foundations — *Sprint 1 (parallel)*
- [ ] Centralize ~30 direct `lib/supabase` imports through `src/lib/api.ts` (start `App.tsx`, `Feed.tsx`, `useNotifications.ts`, `CreateGameModal.tsx`) ⚠️
- [ ] Security pass (continue professionalization Ph2/4; RLS audit) ⚠️
- [ ] Persist map state across navigation (no venue re-load returning from profile/feed) — verify vs recent work ⚠️

### J. Parked / deferred — *Phase 7+*
- [ ] 🅿️ E-commerce (real + web3) · ML ranking from wearables · betting · 3D-everything + character editor · social-API integration · Mingle subscription · business pages + ads/SEO · PERN system · race/demographic fields · **React Native + AWS port**

---

## LIST B — Chronological roadmap (checklist)

Guardrails (`CLAUDE.md`): **all data ops through `src/lib/api.ts`; RLS in a migration before any new table; UX constants in `src/app/map/mapConfig.ts`.**

### [ ] SPRINT 1 — Liveness + Foundations (~2 weeks)
- [ ] **1a Quick fixes** (bucket A): `?dm=` handler; Similar/Following tabs; Hot Picks onClick; Post FAB + Search; real follower count; remove filter chips; mobile triage
- [ ] **1b Liveness** (bucket B): fuzzed-presence mode; ambient/seeded activity; note TTL migration + map expiry; post-game results UI
- [ ] **1c Foundations** (bucket I, parallel): centralize high-traffic supabase calls; RLS/security audit
- **Done when:** map shows fuzzed players + ambient games, no dead links, old notes leave the map but stay in feed, finished games show a result.

### [ ] PHASE 2 — Friends, Events & Sharing (~1.5 weeks)
- [ ] Friends list (connected / near you / mutuals) from `user_follows` + presence
- [ ] Follow-request → accept + notification deep-link fixes + private-profile approve
- [ ] `events` table (+RLS) + Events page (games + nearby venues + promoted free/paid)
- [ ] Sharing → invite-accept (extend `gameInvites.ts` / `redeem_invite_token`)
- [ ] Sport/game icon beside chat tabs
- **Done when:** browse friends, accept a follow/invite, Events page lists real games + venues.

### [ ] PHASE 3 — Adventure & Travel (~2–3 weeks) ← differentiator
- [ ] Venue list near you + richer cards (Google Places enrichment) — extend `fetchVenueEnrichment`, `VenueInfoPopup`
- [ ] Explore as "local vibe" + venues-as-hosts model
- [ ] Trip/adventure planning + group adventures
- [ ] Beli-style friends' refuel spots
- [ ] Add-a-venue (moderated)
- [ ] Clustering config upgrade (`venueClusterEngine.ts`, `osmSportTags.ts`)
- **Done when:** discover places to play, see friends' spots, plan an outing, add a missing venue.

### [ ] PHASE 4 — AI Trainer & Data (~2 weeks) ← fast-follow
- [ ] AI training journal/tracker (self-reported + heuristic)
- [ ] AI chatbot (Claude via server route + AI Gateway)
- [ ] Movement/wearable data schema (no ML yet)
- [ ] Heuristic global ranking (powers matchmaking)

### [ ] PHASE 5 — Matchmaking & Teams (~2 weeks)
- [ ] Matchmaking wires "Similar" tab (ranking + filters)
- [ ] Teams (create/add/compete/chat) + tables
- [ ] Referee invites (mutual agreement)

### [ ] PHASE 6 — Profile & Content polish (ongoing)
- [ ] Reimagine profile; normalize stories/posts/reels tables; stories in feed/explore
- [ ] Player ratings & reviews (skill + behavior)
- [ ] Clean post/note UI; like comments/messages; image/gif in comments & DMs; History view

### [ ] PHASE 7+ — Business & later bets (when justified)
- [ ] Business pages + promoted-event monetization + subscriptions
- [ ] Then: e-commerce / ML ranking / betting / 3D / **React Native + AWS port** (parked until a live user base justifies them)

---

## Verification

No test framework → manual + headless. Per phase:
- [ ] `cd "Redesign FUN sports map/" && npm run dev` (iCloud-on-Desktop = slow first build)
- [ ] Headless map checks via CDP + `window.__FUN_MAP__` + localStorage venue seeding — players/games render, notes expire, venues persist across nav
- [ ] `supabase db query --linked` / Supabase Studio (prod ref `gdzhyhmqufqmcdsvvotj`) — verify new tables/RPCs/**RLS** after each migration; `NOTIFY pgrst, 'reload schema';`
- [ ] Each phase's "Done when" line is the acceptance check

## Open decisions (resolve at each phase, not now)
- Presence default — keep Ghost or flip opted-in users to fuzzed-visible? (Sprint 1b)
- Events vs games — separate `events` table referencing games (lean: yes)
- Google Places cost/quota for enrichment (before Phase 3)
- AI provider — default Claude (latest) via server route + AI Gateway (Phase 4)
