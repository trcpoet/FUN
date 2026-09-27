import type { ReactNode } from "react";
import { format } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import type { ChatMessage } from "./messageTypes";
import { cn } from "../ui/utils";

/**
 * One message. There is only one of these now.
 *
 * There used to be four: a game message, a DM, a note comment in the messenger,
 * and a note comment in the feed's dialog. Only the game one showed who was
 * speaking, which is why a DM or a note reply gave no clue who wrote what. The
 * three genuine differences between them are the three optional props here —
 * `author` (a group thread names its speakers, a 1:1 does not), `veil` (a
 * stranger in a public game chat), `footerSlot` (a note comment can be liked) —
 * so a new kind of thread is an argument, not another copy.
 */
export type MessageBubbleAuthor = {
  displayName: string;
  avatarUrl: string | null;
  /** The trust badge, passed in so the bubble need not know what trust is. */
  badge?: ReactNode;
};

export type MessageBubbleProps = {
  message: ChatMessage;
  mine: boolean;
  /**
   * Position within a run of consecutive messages from the same person. Defaults
   * to a run of one, which is every message until grouping is switched on.
   */
  run?: { start: boolean; end: boolean };
  /** Omit or pass null in a thread with one other person. */
  author?: MessageBubbleAuthor | null;
  /** Present means the body is behind a tap. Absent means it is readable. */
  veil?: { label: string; onReveal: () => void } | null;
  /** Sits opposite the timestamp. Today: the note-comment Like button. */
  footerSlot?: ReactNode;
  onOpenAuthor?: () => void;
  className?: string;
};

const SOLO_RUN = { start: true, end: true } as const;

export function MessageBubble({
  message,
  mine,
  run = SOLO_RUN,
  author,
  veil,
  footerSlot,
  onOpenAuthor,
  className,
}: MessageBubbleProps) {
  const veiled = veil != null;
  const showAuthor = !mine && author != null && run.start;
  const time = format(new Date(message.createdAt), "h:mm a");

  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start", className)}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed border shadow-[0_10px_26px_rgba(0,0,0,0.25)]",
          mine
            ? "bg-gradient-to-b from-violet-500/85 via-violet-600/75 to-fuchsia-600/70 text-white border-white/10 rounded-br-md"
            : veiled
              ? "bg-slate-800/40 text-slate-400 border-slate-700/60 rounded-bl-md"
              : "bg-white/[0.06] text-slate-200 border-white/10 rounded-bl-md",
        )}
      >
        {showAuthor ? (
          <div className="mb-1 flex items-center gap-2">
            <Avatar className="size-6 shrink-0 overflow-hidden rounded-full border border-white/10">
              {author.avatarUrl ? (
                <AvatarImage src={author.avatarUrl} alt="" className="object-cover" />
              ) : null}
              <AvatarFallback className="bg-slate-800 text-[10px] font-semibold text-slate-200">
                {author.displayName.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <button
              type="button"
              onClick={onOpenAuthor}
              disabled={!onOpenAuthor}
              className="text-[10px] font-semibold text-cyan-300/90 hover:text-cyan-200 transition-colors disabled:cursor-default"
              aria-label={`Open ${author.displayName}'s profile`}
              title="Open profile"
            >
              {author.displayName}
            </button>
            {author.badge}
          </div>
        ) : null}

        {veiled ? (
          <button
            type="button"
            onClick={veil.onReveal}
            className="text-left text-xs text-slate-300 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40"
            aria-label="Reveal message from a stranger"
          >
            {veil.label}
          </button>
        ) : (
          <p className="whitespace-pre-wrap break-words">{message.body}</p>
        )}

        {/* The timestamp rides on the last bubble of a run, so a burst of four
            messages carries one time rather than four. */}
        {run.end ? (
          footerSlot ? (
            <div className="mt-1 flex items-center justify-between gap-2 opacity-90">
              <p className={cn("text-[10px] opacity-80", mine ? "text-violet-50/90" : "text-slate-400/80")}>
                {time}
              </p>
              {footerSlot}
            </div>
          ) : (
            <p className={cn("text-[10px] mt-1 opacity-70", mine ? "text-violet-50/90" : "text-slate-400/80")}>
              {time}
            </p>
          )
        ) : null}
      </div>
    </div>
  );
}
