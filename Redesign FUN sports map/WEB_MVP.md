# FUN web MVP – map, create game, join, event chat

This app implements the loop: **Open map → see nearby games → tap card/pin → join → event chat opens.**

## What’s in place

- **Map:** Mapbox GL JS (dark style), centered on your location via the browser Geolocation API.
- **Backend:** Supabase with PostGIS. Geo query: `get_games_nearby(lat, lng, radius_km)`.
- **Create game:** Green “+” FAB or “Start a Game” card → sheet with title, sport, spots → game is created at your current location and appears on the map.
- **Join:** Tap a game card or map marker → “Join” → you’re added to the game; a placeholder “Event chat” panel appears (real chat can be added later).

## Run it

1. **Supabase**
   - Create a project at [supabase.com](https://supabase.com).
   - In **SQL Editor**, run the contents of `../supabase/schema.sql`.
   - In **Authentication → Providers**, enable **Anonymous** (so the app can create/join games without a sign-up form).
   - In **Settings → API**, copy **Project URL** and **anon public** key.

2. **Mapbox**
   - At [mapbox.com](https://mapbox.com), create an account and copy a **default public token** (or create one).

3. **Env**
   - Copy `.env.example` to `.env` and set:
     - `VITE_SUPABASE_URL`
     - `VITE_SUPABASE_ANON_KEY`
     - `VITE_MAPBOX_ACCESS_TOKEN`

4. **Install and dev**
   ```bash
   npm install
   npm run dev
   ```
   Open the URL shown (e.g. http://localhost:5173). Allow location when prompted.

## Web vs mobile

- **This repo:** Web only. Uses **Mapbox GL JS** and the **browser Geolocation API** (no React Native, no Expo).
- **Mobile later:** You’d use React Native (e.g. Expo), `react-native-maps` or Mapbox React Native, and `expo-location`. Same product flow, different APIs.

See `../docs/WEB_VS_MOBILE.md` for details.
