import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Bookmark, ChevronRight, Loader2 } from "lucide-react";
import { fetchMySavedVenues, type SavedVenueRow } from "../../../lib/api";
import { sportEmojiFor } from "../../../lib/sportDisplay";
import { cn } from "../ui/utils";

/**
 * The venues you saved.
 *
 * Offering Save without somewhere for saves to land is worse than not offering
 * it — the bookmark fills, and then the thing is gone. Each row deep-links back
 * to the map via `?focusVenueId=`, which is the same path the feed's venue tiles
 * already use, so there is one way into a venue card rather than two.
 */
export type SavedVenuesSectionProps = {
  /** Null while signed out; the section renders nothing. */
  currentUserId: string | null;
  className?: string;
};

function prettyType(row: SavedVenueRow): string {
  const sport = (row.sport ?? "").split(";")[0]?.trim().replace(/_/g, " ");
  const leisure = row.leisure?.trim().replace(/_/g, " ");
  return [sport, leisure].filter(Boolean).join(" · ") || "Sports venue";
}

export function SavedVenuesSection({ currentUserId, className }: SavedVenuesSectionProps) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<SavedVenueRow[] | null>(null);

  useEffect(() => {
    if (!currentUserId) return;
    let cancelled = false;
    void fetchMySavedVenues(50).then((r) => {
      if (!cancelled) setRows(r.data);
    });
    return () => {
      cancelled = true;
    };
  }, [currentUserId]);

  if (!currentUserId) return null;

  return (
    <section className={cn("space-y-4", className)}>
      <h3 className="text-sm font-black uppercase tracking-[0.2em] text-primary">Saved</h3>

      {rows === null ? (
        <p className="flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          Loading your places…
        </p>
      ) : rows.length === 0 ? (
        <p className="max-w-sm text-sm leading-relaxed text-slate-500">
          Nothing saved yet. Tap the bookmark on any venue and it will wait here for you.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((row) => (
            <li key={row.venue_id}>
              <button
                type="button"
                onClick={() =>
                  navigate(`/?focusVenueId=${encodeURIComponent(row.venue_id)}`)
                }
                className="flex w-full items-center gap-3 rounded-2xl bg-white/[0.03] px-3 py-2.5 text-left transition-colors hover:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              >
                <span className="text-lg leading-none" aria-hidden>
                  {sportEmojiFor(row.sport ?? "")}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-100">
                    {row.name?.trim() || "Sports venue"}
                  </span>
                  <span className="block truncate text-[11px] text-slate-500">
                    {prettyType(row)}
                  </span>
                </span>
                <Bookmark className="size-4 shrink-0 fill-primary text-primary" aria-hidden />
                <ChevronRight className="size-4 shrink-0 text-slate-600" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
