import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import type { ReadReceiptRow } from "../../../lib/chatReads";
import { cn } from "../ui/utils";

/**
 * Who has read this far.
 *
 * Be clear-eyed about what this is: every member of a game chat can now see
 * roughly when every other member last opened it. That is what Messenger does
 * and it is a deliberate choice, not a side effect — and the single-table design
 * behind it makes a later `profiles.read_receipts_enabled` opt-out a one-column
 * addition rather than a rewrite.
 *
 * Named, not just counted, because in a twelve-person pickup chat "seen by 4" is
 * useless and "the host has seen it" is the whole question. Capped at three faces
 * so a full squad does not push the composer off the screen.
 *
 * Map notes never render this. A note is a public thread with an undefined
 * audience; there is nobody whose "Seen" would mean anything, and the database
 * enforces that too — `chat_reads` has no peer-read policy for note rows.
 */
export type ReadReceiptsProps = {
  readers: ReadReceiptRow[];
  /** How many faces before it becomes "+N". */
  max?: number;
  className?: string;
};

export function ReadReceipts({ readers, max = 3, className }: ReadReceiptsProps) {
  if (readers.length === 0) return null;
  const shown = readers.slice(0, max);
  const extra = readers.length - shown.length;
  const names = readers
    .map((r) => r.display_name?.trim() || "a player")
    .join(", ");

  return (
    <div
      className={cn("mt-0.5 flex items-center justify-end gap-1 pr-0.5", className)}
      // The faces are the display; this is what a screen reader gets instead.
      aria-label={`Seen by ${names}`}
      title={`Seen by ${names}`}
    >
      {shown.map((r) => (
        <Avatar
          key={r.user_id}
          className="size-3.5 overflow-hidden rounded-full border border-white/20"
        >
          {r.avatar_url?.trim() ? (
            <AvatarImage src={r.avatar_url} alt="" className="object-cover" />
          ) : null}
          <AvatarFallback className="bg-slate-700 text-[7px] font-semibold text-slate-200">
            {(r.display_name?.trim() || "P").slice(0, 1).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      ))}
      {extra > 0 ? (
        <span className="text-[9px] font-semibold tabular-nums text-slate-500">+{extra}</span>
      ) : null}
    </div>
  );
}
