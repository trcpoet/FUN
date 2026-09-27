import type { ReactNode } from "react";
import { format } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import type { ChatMessage } from "./messageTypes";
import { cn } from "../ui/utils";

/**
 * One message. There is only one of these.
 *
 * The three genuine differences between a game message, a DM and a note comment
 * are the three optional props — `author` (a group thread names its speakers, a
 * 1:1 does not), `veil` (a stranger in a public game chat), `footerSlot` (a note
 * comment can be liked) — so a new kind of thread is an argument, not a copy.
 *
 * Runs are what makes this feel like a messenger rather than a log. Within a run
 * the name prints once at the top, the avatar sits beside the *last* bubble, and
 * only that last bubble carries a timestamp. The old code put an avatar and a
 * time on every single bubble, which is the clearest tell that a chat was built
 * by drawing each row on its own.
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
  /** Position within a run of consecutive messages from the same person. */
  run?: { start: boolean; end: boolean };
  /** Omit or pass null in a thread with one other person. */
  author?: MessageBubbleAuthor | null;
  /** Present means the body is behind a tap. Absent means it is readable. */
  veil?: { label: string; onReveal: () => void } | null;
  /** Sits opposite the timestamp. Today: the note-comment Like button. */
  footerSlot?: ReactNode;
  onOpenAuthor?: () => void;
  /** Offered when the send failed. */
  onRetry?: () => void;
  className?: string;
};

const SOLO_RUN = { start: true, end: true } as const;

/** Keeps the column under a run's avatar reserved, so bubbles stay in line. */
const GUTTER = "w-7 shrink-0";

export function MessageBubble({
  message,
  mine,
  run = SOLO_RUN,
  author,
  veil,
  footerSlot,
  onOpenAuthor,
  onRetry,
  className,
}: MessageBubbleProps) {
  const veiled = veil != null;
  const named = !mine && author != null;
  const time = format(new Date(message.createdAt), "h:mm a");
  const sending = message.status === "sending";
  const failed = message.status === "failed";

  return (
    <div
      className={cn(
        "flex items-end gap-2",
        mine ? "justify-end" : "justify-start",
        // A run is one block with air around it; inside it, bubbles nearly touch.
        run.start ? "mt-3 first:mt-0" : "mt-0.5",
        className,
      )}
    >
      {named ? (
        <div className={GUTTER}>
          {run.end ? (
            <Avatar className="size-7 overflow-hidden rounded-full border border-white/10">
              {author.avatarUrl ? (
                <AvatarImage src={author.avatarUrl} alt="" className="object-cover" />
              ) : null}
              <AvatarFallback className="bg-slate-800 text-[10px] font-semibold text-slate-200">
                {author.displayName.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          ) : null}
        </div>
      ) : null}

      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed shadow-[0_10px_26px_rgba(0,0,0,0.25)]",
          // A message in flight is dimmed rather than removed: it is there, it
          // just is not certain yet.
          sending && "opacity-60",
          failed && "ring-1 ring-amber-400/40",
          mine
            ? "bg-gradient-to-b from-violet-500/85 via-violet-600/75 to-fuchsia-600/70 text-white"
            : veiled
              ? "bg-slate-800/50 text-slate-400"
              : "bg-white/[0.06] text-slate-200",
          // Tighten the corners a run shares, so three bubbles read as one turn.
          !run.start && (mine ? "rounded-tr-md" : "rounded-tl-md"),
          run.end && (mine ? "rounded-br-md" : "rounded-bl-md"),
        )}
      >
        {named && run.start ? (
          <div className="mb-1 flex items-center gap-1.5">
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
          >
            {veil.label}
          </button>
        ) : (
          <p className="whitespace-pre-wrap break-words">{message.body}</p>
        )}

        {failed ? (
          <button
            type="button"
            onClick={onRetry}
            className="mt-1 text-[10px] font-semibold text-amber-200 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50"
          >
            Failed — tap to retry
          </button>
        ) : sending ? (
          <p className="mt-1 text-[10px] text-violet-50/70">Sending…</p>
        ) : run.end ? (
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
