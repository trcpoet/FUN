import { SPORT_OPTIONS, SPORT_ALIAS_TO_CANONICAL, normalizeSportQuery } from "./sports";
import type { GameRow } from "./supabase";

export type SportMatchKind = "exact" | "alias" | "prefix" | "contains" | "token" | "typos";

export type SportSearchHit = {
  sport: string;
  matchKind: SportMatchKind;
  score: number;
};

function singularize(token: string): string {
  if (token.length <= 2) return token;
  if (token.endsWith("ies") && token.length > 4) return `${token.slice(0, -3)}y`;
  if (token.length > 4 && token.endsWith("es") && token[token.length - 4] !== "s") return token.slice(0, -2);
  if (token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
  return token;
}

/** True if Levenshtein distance ≤ 1 (insert/delete/substitute). */
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    edits++;
    if (edits > 1) return false;
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/**
 * Ranked sport suggestions from free text (aliases, plurals, prefix/substring, light typos).
 * Not a full NLP parser — combine with parallel place/people search in the UI.
 */
export function findSportSearchResults(query: string, maxResults = 6): SportSearchHit[] {
  const raw = normalizeSportQuery(query);
  if (raw.length < 2) return [];

  const tokens = raw.split(" ").filter(Boolean);
  const best = new Map<string, SportSearchHit>();

  const bump = (sport: string, matchKind: SportMatchKind, score: number) => {
    const prev = best.get(sport);
    if (!prev || score > prev.score) best.set(sport, { sport, matchKind, score });
  };

  // Whole-query alias (e.g. "pickle ball", "bball")
  const aliasHit = SPORT_ALIAS_TO_CANONICAL[raw];
  if (aliasHit) bump(aliasHit, "alias", 120);

  for (const t of tokens) {
    const sing = singularize(t);
    const a1 = SPORT_ALIAS_TO_CANONICAL[t];
    const a2 = SPORT_ALIAS_TO_CANONICAL[sing];
    if (a1) bump(a1, "alias", 118);
    if (a2 && a2 !== a1) bump(a2, "alias", 116);
  }

  for (const s of SPORT_OPTIONS) {
    const sl = s.toLowerCase();
    const slCompact = sl.replace(/\s+/g, "");

    if (raw === sl) {
      bump(s, "exact", 200);
      continue;
    }
    if (raw.startsWith(`${sl} `) || raw.endsWith(` ${sl}`) || tokens.includes(sl)) {
      bump(s, "exact", 190);
      continue;
    }

    if (raw.startsWith(sl) && raw.length >= 2) bump(s, "prefix", 150);
    else if (tokens.some((tok) => sl.startsWith(tok) && tok.length >= 2)) bump(s, "prefix", 140);

    if (raw.includes(sl) || sl.includes(raw)) bump(s, "contains", 110);

    if (raw.replace(/\s+/g, "") === slCompact) bump(s, "exact", 195);

    for (const tok of tokens) {
      if (tok.length < 2) continue;
      if (tok === sl || singularize(tok) === sl || sl.startsWith(tok)) {
        bump(s, "token", 130);
      }
      if (tok.length >= 4 && withinOneEdit(tok, sl)) bump(s, "typos", 70);
      if (tok.length >= 4 && sl.includes(" ") && tok.length >= 4) {
        for (const part of sl.split(" ")) {
          if (part.length >= 4 && withinOneEdit(tok, part)) bump(s, "typos", 65);
        }
      }
    }
  }

  return [...best.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);
}

/** Best single sport match (backward compatible with older call sites). */
export function findSportMatch(query: string): string | null {
  return findSportSearchResults(query, 1)[0]?.sport ?? null;
}

export function gameMatchesSport(gameSport: string, canonicalSport: string): boolean {
  return gameSport.trim().toLowerCase() === canonicalSport.trim().toLowerCase();
}

export function gamesMatchingSport(games: GameRow[], canonicalSport: string): GameRow[] {
  return games.filter((g) => gameMatchesSport(g.sport, canonicalSport));
}

export function countGamesForSport(games: GameRow[], canonicalSport: string): number {
  return gamesMatchingSport(games, canonicalSport).length;
}

/** Nearest game by `distance_km` from RPC (already sorted by distance optional). */
export function closestGame(games: GameRow[]): GameRow | null {
  if (games.length === 0) return null;
  return games.reduce((a, b) => (a.distance_km <= b.distance_km ? a : b));
}
