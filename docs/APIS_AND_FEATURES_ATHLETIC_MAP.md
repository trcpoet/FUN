# APIs & Features: Making the Map Feel Athletic, Brave, Playful

This doc suggests APIs and features that support **athleticism, sports, bravery, improvement, energy, and playfulness** — and how to use a **3D game avatar** (not a profile photo) on the map.

---

## 1. 3D Game Avatar (Not a Profile Picture)

**Goal:** Each user is represented by a **3D character** on the map (athlete, runner, player) — customizable, animated, game-like. No profile photos.

### Options

| Approach | Pros | Cons |
|----------|------|------|
| **Ready Player Me (RPM)** | Full-body 3D avatars, GLB export, customizable via iframe; used in games | Requires user to create once; or use a default “athlete” avatar ID |
| **Static GLB “athlete”** | One model for everyone (e.g. runner, generic player); no account needed | Less personal; need to source a licensed GLB (Sketchfab, Mixamo, etc.) |
| **VRM / anime-style** | Very game-like, many free models | Need to pick a default or let users choose from a small set |

### Recommended: Ready Player Me + Mapbox

1. **Avatar source**
   - **Option A:** User picks/customizes once → you store `avatarId` in `profiles` → use `https://models.readyplayer.me/{avatarId}.glb?quality=medium` for the map.
   - **Option B:** Use a **default athlete avatar ID** from RPM (or a static GLB) so everyone has a 3D character without signing up to RPM.

2. **Rendering on the map**
   - **threebox-gl** (or Mapbox + Three.js custom layer): Add a **custom 3D layer** that:
     - Converts user lat/lng → Mapbox Mercator.
     - Loads the GLB with Three.js `GLTFLoader`.
     - Places and scales the model (e.g. small figure so it fits the map).
   - Optional: **Idle animation** (e.g. running in place, or waving) if the GLB has animations — makes the map feel alive.

3. **Fallback**
   - Until 3D is wired: keep a **2D sprite** (e.g. sporty icon or Lottie animation) so the “you” marker still feels like a character, not a photo.

### APIs / libs

- **Ready Player Me**
  - Docs: https://docs.readyplayer.me/
  - Avatar URL: `GET https://models.readyplayer.me/{avatarId}.glb?quality=medium`
  - Web: iframe Avatar Creator → `v1.avatar.exported` → get avatar URL/ID.
- **Three.js + GLTFLoader** (or **threebox-gl**): Load GLB, render in Mapbox custom layer.
- **Mapbox custom layer**: `type: 'custom'`, `renderingMode: '3d'`, use `MercatorCoordinate` for position.

---

## 2. APIs That Entice Athleticism & Energy

### Map & environment

- **Mapbox**
  - **3D terrain** (you have this): suggests “real world, go run there.”
  - **Custom style** (Mapbox Studio): Dark “stadium” or “arena” look; high-contrast greens/oranges for fields and courts.
  - **Animated layers**: e.g. subtle pulse on “live games” or “hotspots” to draw the eye.
- **Weather** (OpenWeather, Tomorrow.io, etc.)
  - “Sun in 2 hours — good time for a game” / “Rain in 1h — finish strong.”
  - Encourages planning and a bit of “bravery” (play in changing conditions).

### Gamification & improvement

- **Your own backend (Supabase)**
  - **Streaks:** “7 days in a row,” “3 games this week.”
  - **Badges:** First game, 10 games, “night owl,” “early bird,” “rain or shine.”
  - **Leaderboards:** Most games, most sports, reliability score.
  - **“Level” or XP:** E.g. points per game completed → level up title (Rookie → Regular → Beast).
- **Optional: Strava (or similar)**
  - If user connects: “You ran 12 km this week” or “Ready for a game?” — ties improvement to the map.

### Social & bravery

- **Supabase Realtime**
  - “3 people just joined a game 0.5 km away” / “New game near you.”
  - Live roster updates and “spots filling” to create urgency and FOMO.
- **Challenges**
  - “First to 10 games this month,” “Play 3 different sports this week” — bravery and variety.

### Playfulness & energy

- **Sound (Web Audio API or Howler.js)**
  - Short sounds: whistle, ball bounce, light crowd cheer when joining a game or when result is confirmed.
- **Confetti / particles**
  - On “game joined” or “result confirmed” (e.g. canvas-confetti or small particle effect).
- **Haptics (Vibration API)**
  - On mobile: short vibration when you join a game or get an invite.
- **Time-of-day / “prime time”**
  - Simple logic: “Peak hour for games near you” or “Golden hour — get outside” to nudge energy.

---

## 3. Feature Suggestions (Prioritized)

**High impact, moderate effort**

1. **3D game avatar on map** (RPM or default GLB + threebox/Three.js) — replaces profile pic, reinforces “game character” identity.
2. **Custom Mapbox style** — darker, sporty colors, subtle glow on live games.
3. **Realtime “just joined” / “new game”** — Supabase Realtime; small toast or pulse on the map.
4. **Streaks & simple badges** — DB only; show on profile or in a small “stats” strip.

**Medium impact, lower effort**

5. **Sound and haptics** — one “join” sound, one “success” sound; one haptic on join (mobile).
6. **Confetti on join/result** — single library, one trigger per action.
7. **Weather nudge** — one weather API; “Play before rain” or “Great weather for a game.”

**Later**

8. **Strava (or similar) link** — “You’re on fire this week” or “Ready for a game?”
9. **Challenges** — “First to 10 games,” “3 sports in a week.”
10. **Animated 3D avatar** — idle/run animation in the GLB on the map.

---

## 4. Quick 3D Avatar Implementation Path

1. **Choose avatar source**
   - Default: one RPM avatar ID (or one static GLB) for all users.
   - Later: store `avatar_id` (RPM) or `avatar_glb_url` in `profiles`.
2. **Add threebox-gl** (or raw Three.js custom layer) to the Mapbox app.
3. **Custom layer:** For the current user (and optionally others), at their coordinates:
   - Load GLB from `https://models.readyplayer.me/{id}.glb?quality=medium` (or your URL).
   - Scale to map size (e.g. ~10–20 m equivalent).
   - Render in the 3D layer; no photo texture.
4. **Optional:** Play idle/run animation from GLB if available.
5. **Remove** any profile-picture-based user marker once 3D is in place.

This keeps the map focused on a **game avatar** that supports athleticism and playfulness rather than a social profile picture.
