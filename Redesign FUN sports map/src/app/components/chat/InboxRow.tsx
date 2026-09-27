import type { ReactNode } from "react";
import { UnreadBadge } from "./UnreadBadge";
import { cn } from "../ui/utils";

/**
 * The tappable shell around an inbox row.
 *
 * The three inboxes show different things — a game's spots, a note's visibility,
 * a person's avatar — but the shell was identical in all three: the same rounded
 * border, the same glow, the same `role="button"` with an Enter/Space handler
 * bolted on because it is a `div`, and the same absolutely-positioned badge. Only
 * the contents differ, so only the contents are passed in.
 */
export type InboxRowProps = {
  /** Unread count; the badge decides for itself whether to appear. */
  unread: number;
  onOpen: () => void;
  /** A finished game dims: it is still reachable, just no longer live. */
  ended?: boolean;
  /** Announced to screen readers, which cannot see the row's contents at a glance. */
  label?: string;
  className?: string;
  children: ReactNode;
};

export function InboxRow({ unread, onOpen, ended, label, className, children }: InboxRowProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={label}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        "relative min-w-0 cursor-pointer rounded-xl border px-3 py-3 text-left outline-none transition-colors",
        ended
          ? "border-white/[0.05] bg-white/[0.015] hover:bg-white/[0.04] opacity-90"
          : "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.055]",
        "shadow-[0_0_0_1px_rgba(34,211,238,0.06),0_10px_28px_rgba(0,0,0,0.28)]",
        "hover:border-cyan-300/20",
        "focus-visible:ring-2 focus-visible:ring-cyan-500/40",
        className,
      )}
    >
      <UnreadBadge count={unread} />
      {children}
    </div>
  );
}
