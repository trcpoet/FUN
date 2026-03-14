# Map features: 3D, character marker, players & events

## 1. 3D map

Mapbox GL JS can show **3D terrain** and **tilted view (pitch)** so the map feels 3D.

- **Terrain:** Elevation (hills, mountains) is visible; the map style must support it (e.g. `mapbox://styles/mapbox/outdoors-v12` or `streets-v12`). We enable it in code with `map.setTerrain()` and a `raster-dem` source.
- **Pitch:** Tilting the camera (e.g. 60°) makes buildings and terrain look 3D. Set with `map.setPitch(50)`.

**In this app:** The map component supports an optional **3D mode** (terrain + pitch). You can enable it via a prop or a UI toggle.

---

## 2. Anime-style character instead of a dot

To show an **animated character** (e.g. Japanese anime style) as the user marker:

1. **Image:** Use a PNG/SVG of your character (standing, idle). Put it in `public/` or use a URL.
2. **Marker:** Replace the blue dot with an `<img>` (or a div with background-image) inside the user marker element. Size it (e.g. 48×48 or 64×64).
3. **Animation:** Options:
   - **CSS:** Add a class with `animation` (e.g. gentle bounce, pulse, or idle sway). We add a small bounce in the component.
   - **Sprite sheet:** For walk/run cycles, use a sprite sheet and switch the `background-position` in JavaScript on a timer.
   - **Lottie:** For complex anime motion, use a Lottie JSON and render it in the marker div (e.g. `lottie-web`).

**In this app:** You can pass `userAvatarUrl` to the map (e.g. a character image URL). The user marker will show that image with a light idle animation. For a sprite sheet or Lottie, you’d extend the marker component yourself.

---

## 3. Seeing events and other players on the map

### Events (games)

- **Already in the app:** Events are **games** from Supabase. They’re loaded with `get_games_nearby(lat, lng, radius_km)` and shown as:
  - **Map:** Colored circle markers (green/orange). Tap to select.
  - **Bottom carousel:** Cards with title, sport, distance, “Join”.
- So you **already see events** (games) on the map and in the carousel.

### Other players

- **Not built yet:** “Other players” means people who are **nearby and visible** (e.g. “mingle” mode). To add that you need:
  1. **Backend:** A way to store/update each user’s location (e.g. a `profiles` or `presence` table with `lat`, `lng`, `updated_at`), and a function like `get_profiles_nearby(lat, lng, radius_km)`.
  2. **Privacy:** Only show users who have opted in (e.g. “Show me on map” / “Mingle on”).
  3. **Realtime (optional):** Use Supabase Realtime or polling so positions update without refresh.
  4. **Frontend:** Pass the list of nearby profiles to the map component; the map draws a marker per profile (avatar or dot) and avoids showing the current user in that list.

**In this app:** The map component can accept an optional `nearbyProfiles` prop and render small markers for each. Once you add the backend (table + RPC + opt-in), you’d fetch nearby profiles and pass them in; the map will then show other players.
