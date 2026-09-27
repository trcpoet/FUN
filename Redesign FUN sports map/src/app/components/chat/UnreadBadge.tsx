import { badgeText } from "../../../lib/unreadCounts";

/**
 * The count on an inbox row.
 *
 * The same span was written out three times — groups, DMs and notes — byte for
 * byte. `badgeText` already decides when a number is worth showing and when it
 * becomes "9+", so there is nothing left for a caller to get wrong.
 */
export function UnreadBadge({ count }: { count: number }) {
  const label = badgeText(count);
  if (!label) return null;
  return (
    <span
      className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-extrabold tabular-nums text-white shadow ring-2 ring-[#0b1020]"
      aria-label={`${label} unread`}
    >
      {label}
    </span>
  );
}
