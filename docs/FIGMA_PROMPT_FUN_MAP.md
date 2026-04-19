# Figma prompt: FUN map-first sports discovery screen

Use this prompt in Figma AI / Magician / UI generators. It defines layout, components, interactions, and constraints so the output is close to a shippable interface.

---

## Master prompt (paste this first)

Design a **mobile-first map interface** for a sports social app called **FUN** where athletes discover nearby games, players, and venues. The map is the product: it must occupy **85–90% of the screen**. All other UI supports the map and appears only when needed.

**Core principle:** No floating cards in the middle. No modals for primary flows. Use one collapsible bottom sheet and one radial action menu. Maximum **10–15 visible markers** at any zoom level; use clustering or fading when there are more.

**Target users:** Athletes of all ages, including older users. Use large tap targets, clear contrast, and simple hierarchy.

---

## 1. Layout structure (strict order)

**Top → Bottom:**

1. **Header strip** (compact)
   - Left: circular user avatar (40–44pt tap target).
   - Center: one large rounded search bar, placeholder: *"Search sports, venues, or players"*.
   - Right: filter/settings icon (same size as avatar for balance).

2. **Filter chips** (horizontal scroll, directly under search)
   - Chips: **Live Now** | **Basketball** | **Soccer** | **Nearby** | **Friends** | **Squads**.
   - Active chip: subtle glow or filled background; inactive: outline only.
   - Chips must not overlap the map.

3. **Map area** (fills remaining height)
   - Full-bleed. No cards or panels covering it.
   - Style: dark base (navy/charcoal), subtle grid or terrain, glowing activity zones where there is high activity.

4. **Floating controls** (right edge, over map)
   - Vertical stack: **Locate me** → **Compass** → **Activity toggle**.
   - Small circular buttons, semi-transparent background so map stays visible.

5. **Primary FAB** (bottom-right corner)
   - One large circular button (+).
   - On tap: expands into a **radial action menu** with: **Create Game** | **Go Live** | **Mingle On/Off** | **Invite Squad**.

6. **Bottom sheet** (single sheet, not multiple cards)
   - **Collapsed:** thin bar with label *"Live Games Nearby"* and a small drag handle.
   - **Expanded (swipe up):** list of nearby games; each row shows title, sport, spots left, distance, and **[Join]**.
   - Sheet overlays the bottom of the map but keeps the top of the map visible.

**When a marker is tapped:** The same bottom sheet becomes a **context sheet** for that marker (game details or player profile), with primary action (e.g. **Join Game**) and no full-screen modal.

---

## 2. Marker system (exactly three types)

Do not add a fourth marker type. Use only these.

### A. Player markers

- **Shape:** Circle.
- **Content:** User avatar (photo) as the main visual.
- **Ring:** One glow ring around the avatar. Ring color = skill level (see below).
- **Status dot:** Small dot or icon on the marker (e.g. bottom-right): online (green), in-game (orange), or away (grey).
- **Optional:** Very faint circle around the current user only to show “matchmaking radius”.

**Skill ring colors (use consistently):**
- **Blue** → Beginner (1–3).
- **Green** → Intermediate (4–6).
- **Orange** → Advanced (7–8).
- **Red** → Elite (9–10).

No numbers on the marker; skill is communicated only by ring color.

### B. Game markers

- **Shape:** Distinct from circles (e.g. rounded square or sport-specific shape).
- **Content:** Sport icon (basketball, soccer, tennis, etc.) — not an avatar.
- **Ring:** Glowing ring to show activity; optional subtle pulse.
- **Badge:** Small label or number for *"spots left"* (e.g. *"2 left"*).
- **Color by status:**
  - **Green** → Open.
  - **Orange** → Starting soon.
  - **Red** → Full or highly competitive.

### C. Venue markers

- **Shape:** Minimal icon (e.g. court, pin, or building).
- **Style:** Neutral (grey/white). No glow by default.
- **Active state:** If a game is happening at that venue, add a subtle highlight or glow so it stands out.

**Density rule:** At any zoom level, show no more than 10–15 individual markers. If there are more, show **clusters** (e.g. bubble with number “12”) or **activity heat zones** (soft glowing regions) instead of 12 separate markers.

---

## 3. Bottom sheet content (expanded)

When the sheet is expanded, show a list. Each list item (game card) includes:

- **Title** (e.g. *"Friday Night Lights"*).
- **Sport** and **spots left** (e.g. *"Basketball • 2 spots left"*).
- **Distance** (e.g. *"0.4 miles away"*).
- **Avatar stack** of players already in the game (small overlapping circles).
- **Primary button:** **[Join Game]** or **[View]**.

When a **player marker** is tapped, the sheet shows: avatar, display name, sport(s), skill ring color, and actions such as *"Invite to game"* or *"Message"*.

---

## 4. Visual style

- **Map:** Dark theme (navy #0A0F1C or charcoal). Subtle roads/grid; not noisy.
- **Accents:** Neon or bright colors for activity (e.g. green for open games, orange for “starting soon”).
- **Markers:** Glow effects (box-shadow or blur) so they feel alive.
- **Typography:** Clean, readable, large enough for accessibility (min 16pt for body).
- **Feel:** Athletic, energetic, premium — similar to Pokémon Go or Snapchat Map, not corporate.

---

## 5. Interaction rules

- **Map:** Always visible; no full-screen takeover by lists or forms.
- **Tap marker** → Bottom sheet opens as context sheet for that game/player; map stays visible above.
- **Tap FAB** → Radial menu opens; no modal.
- **Swipe sheet up** → Expand to list; swipe down → collapse to *"Live Games Nearby"* bar.
- **No modals** for: joining a game, viewing a player, or opening the action menu. Use only the bottom sheet and the radial menu.

---

## 6. Accessibility

- Minimum tap target size: 44pt.
- Sufficient contrast between text and background.
- Active filter chip and primary buttons clearly distinguishable.
- Labels for icons (e.g. “Locate me”, “Create game”) for screen readers.

---

## 7. Desktop variant (optional second frame)

For a responsive web version:

- **Layout:** Full-width map; left sidebar for filters; bottom panel for “Live games nearby” list.
- **Top:** Search bar and primary actions (e.g. Create game).
- **Map** remains the central focus; sidebar and bottom panel are secondary.
- Same marker system (player / game / venue) and same color rules.

---

## Short version (if character limit)

*Mobile map-first UI for sports app FUN. Map = 85–90% of screen. Top: avatar, search bar, filter icon. Below: horizontal chips (Live Now, Basketball, Nearby, Friends, Squads). Map: dark theme; 3 marker types only — (1) player = circular avatar + skill ring color blue/green/orange/red, (2) game = sport icon + glow + “spots left” badge, (3) venue = minimal grey icon. Max 10–15 markers visible; use clusters if more. Right: Locate, Compass. Bottom-right: one FAB (+) that opens radial menu (Create Game, Go Live, Mingle, Invite). One collapsible bottom sheet: collapsed = “Live Games Nearby”, expanded = game list with Join; tap marker = same sheet shows that game/player. No modals. Large tap targets, clear hierarchy, athletic premium look.*

---

Use the **Master prompt** plus sections **1–6** for full control; use the **Short version** when you need a single paragraph for Figma AI.
