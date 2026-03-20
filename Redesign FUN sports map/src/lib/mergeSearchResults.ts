import type { ProfileSearchRow } from "./supabase";
import type { SportSearchHit } from "./sportSearch";
import { normalizeSportQuery } from "./sports";

export type SearchSectionId = "places" | "sports" | "people";

/**
 * Simple product ordering: strong exact sport → sports first; strong person match → people first;
 * "players near me" → people first. Otherwise Places → Sports → People.
 */
export function mergeSearchSectionOrder(input: {
  query: string;
  sportHits: SportSearchHit[];
  people: ProfileSearchRow[];
  placesCount: number;
  playersNearMe: boolean;
}): SearchSectionId[] {
  if (input.playersNearMe) return ["people", "sports", "places"];

  const pq = input.query.trim().toLowerCase();
  const pqNorm = normalizeSportQuery(input.query);

  const sportsStrong =
    input.sportHits.length > 0 &&
    input.sportHits[0] != null &&
    (input.sportHits[0].matchKind === "exact" ||
      input.sportHits[0].matchKind === "alias" ||
      (input.sportHits[0].matchKind === "prefix" && input.sportHits[0].score >= 140));

  const sportsExactName =
    input.sportHits.some((h) => h.sport.toLowerCase().replace(/\s+/g, " ") === pqNorm) ||
    input.sportHits.some((h) => pqNorm === h.sport.toLowerCase());

  const peopleStrong = input.people.some((p) => {
    const name = p.display_name?.trim().toLowerCase();
    const handle = p.handle?.replace(/^@/, "").toLowerCase();
    const pqH = pq.replace(/^@/, "");
    return (name && name === pq) || (handle && handle === pqH);
  });

  if (sportsExactName && !peopleStrong) return ["sports", "places", "people"];
  if (peopleStrong && !sportsExactName) return ["people", "places", "sports"];
  if (sportsStrong && !peopleStrong && input.placesCount <= 1) return ["sports", "places", "people"];
  if (input.placesCount >= 3 && input.sportHits.length === 0) return ["places", "people", "sports"];

  return ["places", "sports", "people"];
}
