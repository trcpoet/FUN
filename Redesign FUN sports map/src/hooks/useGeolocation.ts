import { useState, useEffect } from "react";
import { distanceKmBetween } from "../app/map/mapBounds";

export type Coords = { lat: number; lng: number } | null;

const LAST_COORDS_KEY = "fun_last_coords";

/**
 * Reads the most recently resolved geolocation from localStorage.
 *
 * Used to center the map on the user's last known position immediately on mount
 * (e.g. when returning to the map via the globe button), instead of flashing a
 * default location while the live `getCurrentPosition` call resolves.
 */
export function getLastKnownCoords(): Coords {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(LAST_COORDS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { lat?: unknown; lng?: unknown };
    if (typeof parsed?.lat === "number" && typeof parsed?.lng === "number") {
      return { lat: parsed.lat, lng: parsed.lng };
    }
  } catch {
    /* ignore malformed cache */
  }
  return null;
}

function persistLastKnownCoords(coords: { lat: number; lng: number }) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(LAST_COORDS_KEY, JSON.stringify(coords));
  } catch {
    /* ignore quota / disabled storage */
  }
}

type GeolocationOptions = {
  /**
   * A precise, never-cached fix, which can take the full timeout to arrive. The map
   * wants one (it draws you and publishes your presence); a list of things within
   * 25 km does not.
   */
  highAccuracy?: boolean;
};

export function useGeolocation(options?: GeolocationOptions): {
  coords: Coords;
  error: string | null;
  loading: boolean;
} {
  const highAccuracy = options?.highAccuracy ?? true;
  const [coords, setCoords] = useState<Coords>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!navigator?.geolocation) {
      setError("Geolocation is not supported");
      setLoading(false);
      return;
    }

    const handleSuccess = (position: GeolocationPosition) => {
      const next = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };
      setCoords(next);
      persistLastKnownCoords(next);
      setError(null);
      setLoading(false);
    };

    const handleError = (e: GeolocationPositionError) => {
      setError(e.message || "Could not get location");
      setCoords(null);
      setLoading(false);
    };

    navigator.geolocation.getCurrentPosition(handleSuccess, handleError, {
      enableHighAccuracy: highAccuracy,
      timeout: 10000,
      maximumAge: highAccuracy ? 0 : 5 * 60_000,
    });
  }, [highAccuracy]);

  return { coords, error, loading };
}

/**
 * How far a fresh fix has to land from the remembered one before a page re-queries
 * around it. The feed's radii are 25 km and up, so a fix a few hundred metres off the
 * last one changes nothing on screen — it would only re-fetch the same rows.
 */
const RESEED_DISTANCE_KM = 1;

export type ApproxLocation = {
  /** The remembered position until a fix arrives, then the fix if it moved. */
  coords: Coords;
  /** Nothing remembered and no fix yet: show a skeleton, not an error. */
  locating: boolean;
  /** Nothing remembered and the fix failed: location is off, denied or unsupported. */
  unavailable: boolean;
};

/**
 * Location for pages that list things *near* you: Feed, Recommended Games, Popular
 * Venues.
 *
 * Those pages used `useGeolocation` directly, which starts at `null` and waits for a
 * high-accuracy fix with `maximumAge: 0`. That cost every visit up to ten seconds
 * before a single request went out — and because "no coords" was the only signal,
 * the wait rendered as "Turn on location", even for someone whose location was on.
 *
 * This starts from the last position the app resolved, so the first requests leave
 * on mount, and tells "still locating" apart from "unavailable". The map keeps the
 * strict hook: it publishes presence from the fix, and a remembered position must
 * never be published as where someone is now.
 */
export function useApproxLocation(): ApproxLocation {
  const live = useGeolocation({ highAccuracy: false });
  const [coords, setCoords] = useState<Coords>(getLastKnownCoords);

  useEffect(() => {
    const fix = live.coords;
    if (!fix) return;
    setCoords((prev) =>
      prev && distanceKmBetween(prev.lat, prev.lng, fix.lat, fix.lng) < RESEED_DISTANCE_KM ? prev : fix
    );
  }, [live.coords]);

  return {
    coords,
    locating: coords == null && live.loading,
    unavailable: coords == null && !live.loading,
  };
}
