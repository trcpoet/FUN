import { useState, useEffect } from "react";

export type Coords = { lat: number; lng: number } | null;

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
      setCoords({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      });
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
