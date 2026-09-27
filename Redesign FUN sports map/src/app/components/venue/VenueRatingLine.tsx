import { StarRating } from "../ui/StarRating";
import { cn } from "../ui/utils";

/**
 * FUN's own rating and Google's, on one line, never blended.
 *
 * Google's terms forbid presenting their rating as interchangeable with a first
 * party's, and beyond the licensing it would be dishonest: eight people who
 * played here and 400 people who drove past are not the same signal. So they sit
 * side by side, each labelled with its source, and only FUN's gets the stars —
 * Google's is a number with its name next to it.
 *
 * Renders nothing when neither source has anything, which for most venues is the
 * case until someone reviews them.
 */
export type VenueRatingLineProps = {
  /** FUN's own average and count, from `get_venue_reviews`. */
  funRating?: number | null;
  funCount?: number | null;
  googleRating?: number | null;
  googleCount?: number | null;
  /** Jump to the Reviews tab. */
  onOpenReviews?: () => void;
  className?: string;
};

export function VenueRatingLine({
  funRating,
  funCount,
  googleRating,
  googleCount,
  onOpenReviews,
  className,
}: VenueRatingLineProps) {
  const hasFun = typeof funRating === "number" && (funCount ?? 0) > 0;
  const hasGoogle = typeof googleRating === "number";
  if (!hasFun && !hasGoogle) return null;

  return (
    <p className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]", className)}>
      {hasFun ? (
        <button
          type="button"
          onClick={onOpenReviews}
          disabled={!onOpenReviews}
          className="inline-flex items-center gap-1.5 rounded text-slate-200 transition-colors enabled:hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-default"
        >
          <StarRating value={funRating} size={11} />
          <span className="font-semibold tabular-nums">{funRating!.toFixed(1)}</span>
          <span className="text-slate-500">
            ({funCount}
            {funCount === 1 ? " review" : " reviews"})
          </span>
        </button>
      ) : null}

      {hasFun && hasGoogle ? (
        <span aria-hidden className="text-slate-600">
          ·
        </span>
      ) : null}

      {hasGoogle ? (
        <span className="inline-flex items-center gap-1.5 text-slate-400">
          <span className="font-semibold tabular-nums text-slate-300">
            {googleRating!.toFixed(1)}
          </span>
          {/* Labelled, always. Not stars — those are FUN's. */}
          <span>on Google{googleCount ? ` (${googleCount})` : ""}</span>
        </span>
      ) : null}
    </p>
  );
}
