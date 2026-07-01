import { useEffect, useState } from "react";
import {
  fetchDirections,
  formatDirectionsSummary,
  type DirectionsProfile,
  type DirectionsResult,
} from "../lib/directions";

type UseRouteDirectionsArgs = {
  from: { lat: number; lng: number } | null | undefined;
  to: { lat: number; lng: number } | null | undefined;
  profile?: DirectionsProfile;
  enabled?: boolean;
};

export function useRouteDirections({
  from,
  to,
  profile = "walking",
  enabled = true,
}: UseRouteDirectionsArgs) {
  const [result, setResult] = useState<DirectionsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fromKey =
    from && Number.isFinite(from.lat) && Number.isFinite(from.lng)
      ? `${from.lat.toFixed(5)},${from.lng.toFixed(5)}`
      : null;
  const toKey =
    to && Number.isFinite(to.lat) && Number.isFinite(to.lng)
      ? `${to.lat.toFixed(5)},${to.lng.toFixed(5)}`
      : null;

  useEffect(() => {
    if (!enabled || !fromKey || !toKey || !from || !to) {
      setResult(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void fetchDirections({ from, to, profile }).then(({ data, error: err }) => {
      if (cancelled) return;
      setResult(data);
      setError(err);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [enabled, fromKey, toKey, from, to, profile]);

  const summary =
    result != null ? formatDirectionsSummary(profile, result) : null;

  return { result, loading, error, summary, profile };
}
