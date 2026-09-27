import { format, isToday, isYesterday } from "date-fns";

/**
 * Where one day ends and the next begins.
 *
 * "Today" and "Yesterday" rather than the date, because that is how people refer
 * to the last two days and a chat is mostly about the last two days. Anything
 * older gets a real date, and anything from another year gets the year too —
 * scrolling far enough back should not leave you guessing.
 */
export function DateSeparator({ atMs }: { atMs: number }) {
  const at = new Date(atMs);
  const label = isToday(at)
    ? "Today"
    : isYesterday(at)
      ? "Yesterday"
      : at.getFullYear() === new Date().getFullYear()
        ? format(at, "EEEE, MMM d")
        : format(at, "MMM d, yyyy");
  return (
    <div className="flex items-center justify-center py-2" role="separator" aria-label={label}>
      <span className="rounded-full bg-white/[0.05] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </span>
    </div>
  );
}

/**
 * A long silence inside one day.
 *
 * Quieter than a date separator on purpose: it marks a pause, not a boundary, so
 * it prints the clock time alone with no pill around it.
 */
export function TimeGapMarker({ atMs }: { atMs: number }) {
  return (
    <div className="flex items-center justify-center py-1.5" role="separator">
      <span className="text-[10px] tabular-nums text-slate-600">
        {format(new Date(atMs), "h:mm a")}
      </span>
    </div>
  );
}
