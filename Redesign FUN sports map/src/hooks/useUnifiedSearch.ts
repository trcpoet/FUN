import { useEffect, useMemo, useRef, useState } from "react";
import { forwardGeocodeSearch, type ForwardGeocodeFeature } from "../lib/geocoding";
import { findSportSearchResults, countGamesForSport } from "../lib/sportSearch";
import type { SportSearchHit } from "../lib/sportSearch";
import { searchPeople } from "../lib/searchPeople";
import { mergeSearchSectionOrder, type SearchSectionId } from "../lib/mergeSearchResults";
import {
  MAX_PLACE_RESULTS,
  MAX_PEOPLE_RESULTS,
  MAX_SPORT_RESULTS,
  MIN_QUERY_LENGTH_FOR_PEOPLE,
  PLAYERS_NEAR_ME_RE,
} from "../lib/searchConstants";
import { supabase } from "../lib/supabase";
import type { GameRow, ProfileNearbyRow, ProfileSearchRow } from "../lib/supabase";

export type SportSearchHitWithCount = SportSearchHit & { nearbyCount: number };

function nearbyRowToSearchRow(r: ProfileNearbyRow): ProfileSearchRow {
  return {
    profile_id: r.profile_id,
    display_name: r.display_name,
    avatar_url: r.avatar_url,
    handle: null,
    city: null,
    favorite_sport: null,
    distance_km: r.distance_km,
    rank_score: null,
  };
}

export function useUnifiedSearch(opts: {
  debouncedQuery: string;
  anchorLat: number | null;
  anchorLng: number | null;
  excludeUserId: string | null;
  games: GameRow[];
}) {
  const [placesLoading, setPlacesLoading] = useState(false);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [places, setPlaces] = useState<ForwardGeocodeFeature[]>([]);
  const [people, setPeople] = useState<ProfileSearchRow[]>([]);

  const geoAbortRef = useRef<AbortController | null>(null);
  const peopleReqGen = useRef(0);

  const q = opts.debouncedQuery.trim();
  const playersNearMe = PLAYERS_NEAR_ME_RE.test(q);

  const sportHits: SportSearchHitWithCount[] = useMemo(() => {
    if (playersNearMe) return [];
    return findSportSearchResults(q, MAX_SPORT_RESULTS).map((h) => ({
      ...h,
      nearbyCount: countGamesForSport(opts.games, h.sport),
    }));
  }, [q, opts.games, playersNearMe]);

  const sectionOrder: SearchSectionId[] = useMemo(
    () =>
      mergeSearchSectionOrder({
        query: opts.debouncedQuery,
        sportHits,
        people,
        placesCount: places.length,
        playersNearMe,
      }),
    [opts.debouncedQuery, sportHits, people, places.length, playersNearMe],
  );

  // Mapbox places (skip for "players near me" — not a location string)
  useEffect(() => {
    if (playersNearMe) {
      geoAbortRef.current?.abort();
      setPlaces([]);
      setPlacesLoading(false);
      return;
    }
    if (q.length < 2) {
      geoAbortRef.current?.abort();
      setPlaces([]);
      setPlacesLoading(false);
      return;
    }

    geoAbortRef.current?.abort();
    const ac = new AbortController();
    geoAbortRef.current = ac;
    setPlacesLoading(true);

    void forwardGeocodeSearch(q, {
      proximity:
        opts.anchorLat != null && opts.anchorLng != null
          ? [opts.anchorLng, opts.anchorLat]
          : undefined,
      limit: MAX_PLACE_RESULTS,
      signal: ac.signal,
    }).then((rows) => {
      if (geoAbortRef.current !== ac) return;
      // Sort by straight-line distance to anchor so the closest result is always first
      const sorted =
        opts.anchorLat != null && opts.anchorLng != null
          ? [...rows].sort((a, b) => {
              const da = Math.hypot(a.center[1] - opts.anchorLat!, a.center[0] - opts.anchorLng!);
              const db = Math.hypot(b.center[1] - opts.anchorLat!, b.center[0] - opts.anchorLng!);
              return da - db;
            })
          : rows;
      setPlaces(sorted);
      setPlacesLoading(false);
    });

    return () => {
      ac.abort();
    };
  }, [q, opts.anchorLat, opts.anchorLng, playersNearMe]);

  // People: text RPC or "near me" browse list
  useEffect(() => {
    const gen = ++peopleReqGen.current;

    if (playersNearMe) {
      if (!supabase || opts.anchorLat == null || opts.anchorLng == null) {
        setPeople([]);
        setPeopleLoading(false);
        return;
      }
      setPeopleLoading(true);
      void supabase
        .rpc("get_profiles_nearby", {
          lat: opts.anchorLat,
          lng: opts.anchorLng,
          radius_km: 25,
          limit_count: 14,
        })
        .then(({ data, error }) => {
          if (peopleReqGen.current !== gen) return;
          setPeopleLoading(false);
          if (error || !data) {
            setPeople([]);
            return;
          }
          let rows = data as ProfileNearbyRow[];
          if (opts.excludeUserId) {
            rows = rows.filter((r) => r.profile_id !== opts.excludeUserId);
          }
          setPeople(rows.map(nearbyRowToSearchRow));
        });
      return;
    }

    if (q.length < MIN_QUERY_LENGTH_FOR_PEOPLE) {
      setPeople([]);
      setPeopleLoading(false);
      return;
    }

    setPeopleLoading(true);
    void searchPeople({
      q,
      lat: opts.anchorLat,
      lng: opts.anchorLng,
      limit: MAX_PEOPLE_RESULTS,
      excludeUserId: opts.excludeUserId,
    }).then((rows) => {
      if (peopleReqGen.current !== gen) return;
      setPeople(rows);
      setPeopleLoading(false);
    });
  }, [q, playersNearMe, opts.anchorLat, opts.anchorLng, opts.excludeUserId]);

  const anyLoading = placesLoading || peopleLoading;
  const hasAnyResults = places.length > 0 || sportHits.length > 0 || people.length > 0;
  const showDropdown =
    q.length >= 1 || anyLoading || hasAnyResults;

  return {
    places,
    placesLoading,
    sportHits,
    people,
    peopleLoading,
    sectionOrder,
    playersNearMe,
    anyLoading,
    hasAnyResults,
    showDropdown,
  };
}
