import { useMemo, type ReactNode, type Ref } from "react";
import { ChevronUp, Loader2 } from "lucide-react";
import { MessageBubble, type MessageBubbleProps } from "./MessageBubble";
import { DateSeparator, TimeGapMarker } from "./DateSeparator";
import { buildChatList } from "./chatGrouping";
import type { ChatMessage } from "./messageTypes";
import { cn } from "../ui/utils";

/**
 * The messages in a thread, whichever kind of thread it is.
 *
 * Renders a fragment rather than a wrapper so the parent's scroller owns the
 * layout. What to draw is decided by `buildChatList` — a pure function over the
 * array — and this only maps its output onto components, which is why grouping
 * can be tested without a browser.
 */
export type MessageListProps = {
  messages: ChatMessage[];
  loading: boolean;
  currentUserId: string | null;
  /** Shown when there is nothing yet. Omit for no empty state at all. */
  empty?: ReactNode;
  /** Above the first message — a map note's own post. */
  header?: ReactNode;
  /** Below the last — the post-game panel. */
  footer?: ReactNode;
  authorFor?: (message: ChatMessage) => MessageBubbleProps["author"];
  /** True for a message that should sit behind one tap. */
  isVeiled?: (message: ChatMessage) => boolean;
  revealedIds?: ReadonlySet<string>;
  /** Called with every id in a veiled run — one tap opens the whole turn. */
  onReveal?: (ids: string[]) => void;
  footerSlotFor?: (message: ChatMessage) => ReactNode;
  onOpenAuthor?: (userId: string) => void;
  /** There is older history to fetch. */
  canLoadOlder?: boolean;
  loadingOlder?: boolean;
  onLoadOlder?: () => void;
  /** The note thread's spinner is smaller — it sits under the pinned post. */
  spinnerClassName?: string;
  spinnerPadClassName?: string;
  /** Scroll target at the very bottom of the thread. */
  endRef?: Ref<HTMLDivElement>;
};

function veilLabel(count: number): string {
  return count === 1
    ? "Stranger sent a message — tap to read"
    : `Stranger sent ${count} messages — tap to read`;
}

export function MessageList({
  messages,
  loading,
  currentUserId,
  empty,
  header,
  footer,
  authorFor,
  isVeiled,
  revealedIds,
  onReveal,
  footerSlotFor,
  onOpenAuthor,
  canLoadOlder,
  loadingOlder,
  onLoadOlder,
  spinnerClassName = "w-8 h-8",
  spinnerPadClassName = "py-12",
  endRef,
}: MessageListProps) {
  const items = useMemo(
    () => buildChatList(messages, { currentUserId, isVeiled, revealedIds }),
    [messages, currentUserId, isVeiled, revealedIds],
  );

  return (
    <>
      {canLoadOlder ? (
        <div className="flex justify-center pb-1">
          <button
            type="button"
            onClick={onLoadOlder}
            disabled={loadingOlder}
            className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.05] px-3 py-1 text-[11px] font-semibold text-slate-300 transition-colors hover:bg-white/[0.09] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40 disabled:opacity-60"
          >
            {loadingOlder ? (
              <Loader2 className="size-3 animate-spin" aria-hidden />
            ) : (
              <ChevronUp className="size-3" aria-hidden />
            )}
            {loadingOlder ? "Loading…" : "Older messages"}
          </button>
        </div>
      ) : null}

      {header}

      {loading ? (
        <div className={cn("flex justify-center text-slate-500", spinnerPadClassName)}>
          <Loader2 className={cn("animate-spin opacity-60", spinnerClassName)} />
        </div>
      ) : messages.length === 0 ? (
        empty ?? null
      ) : (
        items.map((item) => {
          switch (item.kind) {
            case "day":
              return <DateSeparator key={item.key} atMs={item.atMs} />;
            case "gap":
              return <TimeGapMarker key={item.key} atMs={item.atMs} />;
            case "veiledRun": {
              // One bubble for the whole run, carrying the run's own count.
              const first = item.messages[0];
              const ids = item.messages.map((m) => m.id);
              return (
                <MessageBubble
                  key={item.key}
                  message={first}
                  mine={false}
                  author={authorFor?.(first)}
                  veil={{
                    label: veilLabel(item.messages.length),
                    onReveal: () => onReveal?.(ids),
                  }}
                  onOpenAuthor={
                    onOpenAuthor && first.authorId
                      ? () => onOpenAuthor(first.authorId!)
                      : undefined
                  }
                />
              );
            }
            case "message":
              return (
                <MessageBubble
                  key={item.key}
                  message={item.message}
                  mine={item.mine}
                  run={{ start: item.runStart, end: item.runEnd }}
                  author={authorFor?.(item.message)}
                  footerSlot={footerSlotFor?.(item.message)}
                  onOpenAuthor={
                    onOpenAuthor && item.message.authorId
                      ? () => onOpenAuthor(item.message.authorId!)
                      : undefined
                  }
                />
              );
          }
        })
      )}

      {footer}
      <div ref={endRef} />
    </>
  );
}
