import { useEffect, useState } from "react";
import {
  fetchDirections,
  formatDirectionsSummary,
  type DirectionsProfile,
  type DirectionsResult,
} from "../lib/directions";

type Coords = { lat: number; lng: number };

type UseRouteDirectionsArgs = {
  from: Coords | null | undefined;
  to: Coords | null | undefined;
  profile?: DirectionsProfile;
  enabled?: boolean;
};

/**
 * Quantizes a coordinate to a stable string key.
 *
 * 5 decimals is ~1.1 m — far finer than a walking route notices, and coarse enough
 * that float jitter from a re-render can't mint a "new" destination.
 */
export function coordKey(c: Coords | null | undefined): string | null {
  if (!c || !Number.isFinite(c.lat) || !Number.isFinite(c.lng)) return null;
  return `${c.lat.toFixed(5)},${c.lng.toFixed(5)}`;
}

/** Inverse of {@link coordKey}. */
export function parseCoordKey(key: string): Coords {
  const [lat, lng] = key.split(",");
  return { lat: Number(lat), lng: Number(lng) };
}

export function useRouteDirections({
  from,
  to,
  profile = "walking",
  enabled = true,
}: UseRouteDirectionsArgs) {
  const [result, setResult] = useState<DirectionsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fromKey = coordKey(from);
  const toKey = coordKey(to);

  // INVARIANT: every dependency below is a primitive derived from *value*, never from
  // object identity, and the request is rebuilt from those same keys. That makes the
  // request a pure function of the deps, so a resolved fetch cannot re-arm the effect
  // that started it. Putting `from`/`to` back in this array reopens a refetch loop that
  // spins at network speed and trips the proxy's 40 req/60s limit within seconds —
  // callers legitimately pass freshly allocated { lat, lng } on every render.
  useEffect(() => {
    if (!enabled || !fromKey || !toKey) {
      setResult(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void fetchDirections({
      from: parseCoordKey(fromKey),
      to: parseCoordKey(toKey),
      profile,
    }).then(({ data, error: err }) => {
      if (cancelled) return;
      setResult(data);
      setError(err);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [enabled, fromKey, toKey, profile]);

  const summary =
    result != null ? formatDirectionsSummary(profile, result) : null;

  return { result, loading, error, summary, profile };
}
