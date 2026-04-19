# Web MVP vs mobile: what to use when

## Preview = web first, product = mobile later

- **Web (now):** Build and test the full loop in the browser. You iterate fast (no app store, one codebase, easy to share). This is your “working model.”
- **Mobile (later):** Once the loop works on web, you rebuild the same flow in React Native (Expo). Same product idea, different tech (native maps, push, etc.).

So yes: **preview = web to iterate; product = phone later**, and building a working web MVP first is the right order.

---

## Do we need React Native Maps on web?

**No.** `react-native-maps` and `expo-location` are for **React Native (phone/tablet) only**. They don’t run in the browser.

For the **web MVP** you use:

| Concern    | Web (what we use)           | Mobile (later)        |
|-----------|-----------------------------|------------------------|
| Map       | **Mapbox GL JS** or Leaflet | react-native-maps or Mapbox RN |
| Location  | **Browser Geolocation API** (`navigator.geolocation`) | expo-location |

- **expo-location** = Expo/React Native API for device GPS (permissions, foreground/background). You’ll use it when you build the mobile app.
- On web, the browser’s built-in **Geolocation API** gives you “where am I?” and optional “keep updating”; no Expo needed.

---

## How the web map is different from React Native / Mapbox mobile

- **Same ideas:** center on user, show pins (games), tap to select, query “games near me.”
- **Different APIs:**
  - **Web:** Mapbox GL JS (or Leaflet) + `navigator.geolocation` → one map component, one geolocation hook.
  - **Mobile:** React Native Map component + Expo Location → different components and permission flow.

So: **web version ≠ react-native-maps or Mapbox mobile SDK**; it’s the **web** map and **web** location APIs. The product flow (open map → see games → tap → join → chat) is the same; only the libraries and platforms differ.
