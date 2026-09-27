import { badgeText } from "../../../lib/unreadCounts";

/**
 * The count on an inbox row.
 *
 * The same span was written out three times — groups, DMs and notes — byte for
 * byte. `badgeText` already decides when a number is worth showing and when it
 * becomes "9+", so there is nothing left for a caller to get wrong.
 *
 * Teal, not red. Red said "something is wrong"; an unread message is not wrong,
 * it is the app working. Not `--alert` either — Blaze Orange is reserved for
 * live games and genuine alerts, and a badge on every inbox row would spend it.
 */
export function UnreadBadge({ count }: { count: number }) {
  const label = badgeText(count);
  if (!label) return null;
  return (
    <span
      className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-extrabold tabular-nums text-primary-foreground shadow-[0_2px_10px_rgba(0,242,254,0.35)] ring-2 ring-surface-1"
      aria-label={`${label} unread`}
    >
      {label}
    </span>
  );
}
