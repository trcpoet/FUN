const MAPBOX_TOKEN = (import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as string | undefined)?.trim() || undefined;

export type ForwardGeocodeFeature = {
  id: string;
  place_name: string;
  /** [lng, lat] */
  center: [number, number];
};

/**
 * Forward geocode (lazy / debounced callers should pass trimmed query, min length 2).
 */
export async function forwardGeocodeSearch(
  query: string,
  options?: { limit?: number; proximity?: [number, number] }
): Promise<ForwardGeocodeFeature[]> {
  const q = query.trim();
  if (!MAPBOX_TOKEN || q.length < 2) return [];

  const encoded = encodeURIComponent(q);
  const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json`);
  url.searchParams.set("access_token", MAPBOX_TOKEN);
  url.searchParams.set("autocomplete", "true");
  url.searchParams.set("types", "country,region,postcode,district,place,locality,neighborhood,address,poi");
  url.searchParams.set("limit", String(options?.limit ?? 5));
  if (options?.proximity) {
    url.searchParams.set("proximity", `${options.proximity[0]},${options.proximity[1]}`);
  }

  try {
    const res = await fetch(url.toString());
    if (!res.ok) return [];
    const data = await res.json();
    const features = data.features as Array<{
      id: string;
      place_name: string;
      center: [number, number];
    }>;
    if (!Array.isArray(features)) return [];
    return features.map((f) => ({
      id: f.id,
      place_name: f.place_name,
      center: f.center,
    }));
  } catch {
    return [];
  }
}
