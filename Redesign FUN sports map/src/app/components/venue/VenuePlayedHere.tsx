import { useMemo } from "react";
import { format } from "date-fns";
import { History, Loader2 } from "lucide-react";
import type { VenueGameRow } from "../../../lib/api";
import { sportEmojiFor } from "../../../lib/sportDisplay";
import { cn } from "../ui/utils";

/**
 * What people have actually played here.
 *
 * OpenStreetMap records what a place is *tagged* as, not what happens at it. A
 * park tagged `leisure=park` may have three hoops; a `pitch` may be locked every
 * evening. The games hosted at these coordinates are the only first-hand
 * evidence either way, and over time "Basketball · played 14×" answers the
 * question the tags cannot: can I actually play my sport at this place.
 *
 * `VenueGameRow` is deliberately not a `GameRow` — it has no `lat`/`lng` or
 * `created_by` — so `GameListRow`, `gameViewerRole` and `GameActionBar` do not
 * apply to it. These are finished games; there is nothing to join.
 */
export type VenuePlayedHereProps = {
  rows: VenueGameRow[];
  loading: boolean;
  className?: string;
};

/** How many individual games to list under the per-sport summary. */
const RECENT_LIMIT = 4;

export function VenuePlayedHere({ rows, loading, className }: VenuePlayedHereProps) {
  const past = useMemo(() => rows.filter((r) => r.is_past), [rows]);

  const bySport = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of past) {
      const key = r.sport?.trim() || "Other";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [past]);

  if (loading) {
    return (
      <div className={cn("flex items-center gap-2 text-xs text-slate-500", className)}>
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
        Looking at what has been played here…
      </div>
    );
  }

  // No history is not worth a heading. A brand-new venue says nothing rather
  // than "0 games", which would read as a judgement on the place.
  if (past.length === 0) return null;

  return (
    <section className={cn("space-y-2", className)}>
      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        <History className="size-3.5" aria-hidden />
        Played here
      </h3>

      {/* The confidence signal: which sports actually happen at this place. */}
      <ul className="flex flex-wrap gap-1.5">
        {bySport.map(([sport, count]) => (
          <li
            key={sport}
            className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-[11px] text-slate-300"
          >
            <span aria-hidden>{sportEmojiFor(sport)}</span>
            <span className="font-medium">{sport}</span>
            <span className="tabular-nums text-slate-500">
              {count}×
            </span>
          </li>
        ))}
      </ul>

      <ul className="space-y-1">
        {past.slice(0, RECENT_LIMIT).map((g) => {
          const when = g.starts_at ?? g.ended_at ?? g.ends_at;
          return (
            <li
              key={g.id}
              className="flex items-baseline justify-between gap-3 text-[11px] text-slate-500"
            >
              <span className="min-w-0 truncate">
                {when ? format(new Date(when), "MMM d") : "Recently"}
                <span aria-hidden className="mx-1.5 text-slate-700">
                  ·
                </span>
                {g.title?.trim() || g.sport?.trim() || "Pickup game"}
              </span>
              <span className="shrink-0 tabular-nums">
                {g.participant_count} {g.participant_count === 1 ? "player" : "players"}
              </span>
            </li>
          );
        })}
      </ul>

      {past.length > RECENT_LIMIT ? (
        <p className="text-[11px] text-slate-600">
          and {past.length - RECENT_LIMIT} more
        </p>
      ) : null}
    </section>
  );
}
