/** Canonical sports list (filters, search, create-game) — derived from the sport registry. */
import { SPORT_LABELS, SPORTS_CATALOG } from "./sportsCatalog";

export const SPORT_OPTIONS: readonly string[] = SPORT_LABELS;

/** Widened to `string` now that the list is registry-driven (labels are free-form). */
export type SportOption = string;

/**
 * Informal / regional / typo-prone tokens → canonical `SPORT_OPTIONS` label.
 * Built from each catalog entry's `aliases`; keys are lowercase (see `normalizeSportQuery`).
 * First writer wins in catalog order, so earlier sports claim shared aliases.
 */
export const SPORT_ALIAS_TO_CANONICAL: Readonly<Record<string, string>> = (() => {
  const out: Record<string, string> = {};
  for (const s of SPORTS_CATALOG) {
    for (const a of s.aliases ?? []) {
      const k = a.trim().toLowerCase();
      if (!(k in out)) out[k] = s.id;
    }
  }
  return out;
})();

/** Normalize user text for alias + fuzzy sport matching. */
export function normalizeSportQuery(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[-_/]+/g, " ")
    .replace(/\s+/g, " ");
}
