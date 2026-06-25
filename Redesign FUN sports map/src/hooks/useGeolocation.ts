import { useState, useEffect } from "react";

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

export function useGeolocation(): {
  coords: Coords;
  error: string | null;
  loading: boolean;
} {
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
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000,
    });
  }, []);

  return { coords, error, loading };
}
