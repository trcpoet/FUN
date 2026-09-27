import { Clock } from "lucide-react";
import {
  formatClockTime,
  formatOpeningHours,
  isOpenNow,
  nextTransition,
} from "../../lib/openingHours";
import { cn } from "../ui/utils";

/**
 * "Open · closes 9pm", the single most Google-Maps-like thing the card was missing.
 *
 * Two sources, in priority order:
 *
 *  1. The venue's own OSM `opening_hours`, parsed by `openingHours.ts`. Only
 *     1.37% of venues carry one, but when they do it is first-hand and it can
 *     say *when* the venue closes, which Google's cached boolean cannot.
 *  2. Google's `openNow`, already sitting in the `google_details` column that
 *     `fetchVenueById` reads and every previous version of this card threw away.
 *
 * Renders nothing when neither can answer. A wrong "Open now" is worse than no
 * badge — the parser returns `null` rather than guessing for exactly that
 * reason, and this respects it.
 */
export type VenueOpenChipProps = {
  /** Raw OSM `opening_hours`. */
  spec?: string | null;
  /** Google's cached boolean, used only when the spec cannot be parsed. */
  googleOpenNow?: boolean | null;
  /** Injected so the chip is pure and testable; pass a shared clock. */
  now: Date;
  className?: string;
};

export function VenueOpenChip({ spec, googleOpenNow, now, className }: VenueOpenChipProps) {
  const parsed = isOpenNow(spec, now);
  const open = parsed ?? googleOpenNow ?? null;
  if (open == null) return null;

  // Only the parser can say when — Google gives a boolean and nothing else.
  const transition = parsed != null ? nextTransition(spec, now) : null;
  const detail =
    transition?.kind === "closes"
      ? `closes ${formatClockTime(transition.at)}`
      : transition?.kind === "opens"
      ? `opens ${formatClockTime(transition.at)}`
      : null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[13px] font-medium",
        open ? "text-primary" : "text-slate-400",
        className,
      )}
      // The source matters for trust, so say it where a screen reader can hear it.
      title={
        parsed != null
          ? formatOpeningHours(spec) ?? spec ?? undefined
          : "Hours reported by Google"
      }
    >
      <Clock className="size-3.5 shrink-0" aria-hidden />
      {open ? "Open" : "Closed"}
      {detail ? (
        <>
          <span aria-hidden className="text-slate-600">
            ·
          </span>
          <span className="font-normal text-slate-400">{detail}</span>
        </>
      ) : null}
    </span>
  );
}
