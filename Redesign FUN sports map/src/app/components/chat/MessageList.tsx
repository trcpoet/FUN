import type { ReactNode, Ref } from "react";
import { Loader2 } from "lucide-react";
import { MessageBubble, type MessageBubbleProps } from "./MessageBubble";
import type { ChatMessage } from "./messageTypes";
import { cn } from "../ui/utils";

/**
 * The messages in a thread, whichever kind of thread it is.
 *
 * Renders a fragment rather than a wrapper so the parent's `space-y` still
 * applies to the bubbles themselves — a wrapper here would silently collapse the
 * gaps between messages.
 *
 * Grouping, date separators and the veiled-run collapse live in `chatGrouping.ts`
 * and are switched on in the pass after this one; this version draws the flat
 * list the sheet drew before, bubble for bubble.
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
  veilFor?: (message: ChatMessage) => MessageBubbleProps["veil"];
  footerSlotFor?: (message: ChatMessage) => ReactNode;
  onOpenAuthor?: (userId: string) => void;
  /** The note thread's spinner is smaller — it sits under the pinned post. */
  spinnerClassName?: string;
  spinnerPadClassName?: string;
  /** Scroll target at the very bottom of the thread. */
  endRef?: Ref<HTMLDivElement>;
};

export function MessageList({
  messages,
  loading,
  currentUserId,
  empty,
  header,
  footer,
  authorFor,
  veilFor,
  footerSlotFor,
  onOpenAuthor,
  spinnerClassName = "w-8 h-8",
  spinnerPadClassName = "py-12",
  endRef,
}: MessageListProps) {
  return (
    <>
      {header}

      {loading ? (
        <div className={cn("flex justify-center text-slate-500", spinnerPadClassName)}>
          <Loader2 className={cn("animate-spin opacity-60", spinnerClassName)} />
        </div>
      ) : messages.length === 0 ? (
        empty ?? null
      ) : (
        messages.map((message) => {
          const mine = currentUserId != null && message.authorId === currentUserId;
          return (
            <MessageBubble
              key={message.id}
              message={message}
              mine={mine}
              author={authorFor?.(message)}
              veil={veilFor?.(message)}
              footerSlot={footerSlotFor?.(message)}
              onOpenAuthor={
                onOpenAuthor && message.authorId
                  ? () => onOpenAuthor(message.authorId!)
                  : undefined
              }
            />
          );
        })
      )}

      {footer}
      <div ref={endRef} />
    </>
  );
}
