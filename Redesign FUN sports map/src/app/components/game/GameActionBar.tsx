import { useEffect, useState } from "react";
import { LogOut, MessageCircle, Play, Square, Trash2 } from "lucide-react";
import type { GameRow } from "../../../lib/supabase";
import type { GameViewerRole } from "../../lib/gameViewerRole";
import { cn } from "../ui/utils";

/**
 * Every action a viewer can take on a game, in one place.
 *
 * `full` reproduces the map popup's stacked buttons; `compact` is the strip that sits in a
 * list row (venue modal, colocated-games chooser). Both read the same `GameViewerRole`, which
 * is why a host now sees Start/End/Delete everywhere instead of only in the map popup.
 */
export type GameActionBarProps = {
  game: GameRow;
  role: GameViewerRole;
  density: "full" | "compact";
  onJoin?: (game: GameRow) => void;
  onLeave?: (game: GameRow) => void;
  onChat?: (game: GameRow) => void;
  onStart?: (game: GameRow) => Promise<void> | void;
  onEnd?: (game: GameRow) => Promise<void> | void;
  /** Resolves true when the row was actually removed. */
  onDelete?: (game: GameRow) => Promise<boolean> | void;
  /** Called after a successful delete, so a popup can dismiss itself. */
  onDeleted?: () => void;
  /** Fired once Start resolves, for callers that paint liveness outside this bar (e.g. a header chip). */
  onStarted?: () => void;
  className?: string;
};

const DELETE_CONFIRM =
  "Delete this game for everyone? Players will be removed and chat history will be lost. This cannot be undone.";
const END_CONFIRM = "End this game for everyone now?";

export function GameActionBar({
  game,
  role,
  density,
  onJoin,
  onLeave,
  onChat,
  onStart,
  onEnd,
  onDelete,
  onDeleted,
  onStarted,
  className,
}: GameActionBarProps) {
  const [busy, setBusy] = useState<"start" | "end" | "delete" | null>(null);
  // Pressing Start flips the buttons before the refetch lands, so the host isn't left staring
  // at a "Start game" button for a game they just started.
  const [optimisticLive, setOptimisticLive] = useState(false);

  useEffect(() => {
    setOptimisticLive(false);
    setBusy(null);
  }, [game.id]);

  const live = role.isLive || optimisticLive;
  const canStart = role.canStart && !optimisticLive && Boolean(onStart);
  const canEnd = role.isHost && live && !role.isEnded && Boolean(onEnd);
  const canDelete = role.canDelete && Boolean(onDelete);
  const isFull = game.spots_remaining != null && game.spots_remaining <= 0;

  const runStart = () => {
    if (!onStart) return;
    setBusy("start");
    void Promise.resolve(onStart(game))
      .then(() => {
        setOptimisticLive(true);
        onStarted?.();
      })
      .finally(() => setBusy(null));
  };

  // Ending is not reversible and, in `compact`, the control is a small icon button sitting
  // next to Chat — easy to hit by accident. The full popup keeps its original no-confirm
  // behaviour, where the button is large and clearly labelled.
  const runEnd = () => {
    if (!onEnd) return;
    if (density === "compact" && !window.confirm(END_CONFIRM)) return;
    setBusy("end");
    void Promise.resolve(onEnd(game)).finally(() => setBusy(null));
  };

  const runDelete = () => {
    if (!onDelete) return;
    if (!window.confirm(DELETE_CONFIRM)) return;
    setBusy("delete");
    void Promise.resolve(onDelete(game))
      .then((ok) => {
        if (ok !== false) onDeleted?.();
      })
      .finally(() => setBusy(null));
  };

  return density === "full"
    ? renderFull()
    : renderCompact();

  function renderFull() {
    return (
      <div className={className}>
        <div className="grid grid-cols-2 gap-2">
          {role.canJoin && onJoin ? (
            <button
              type="button"
              onClick={() => onJoin(game)}
              className={cn(
                "col-span-2 inline-flex h-10 items-center justify-center gap-2 rounded-lg text-white text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2",
                isFull
                  ? "bg-amber-600/80 hover:bg-amber-500 focus-visible:ring-amber-500/40"
                  : "bg-emerald-600 hover:bg-emerald-500 focus-visible:ring-emerald-500/40",
              )}
            >
              <span className="inline-flex items-center gap-2">
                <Play className="w-4 h-4 opacity-90" aria-hidden />
                {isFull ? "Join Waitlist" : "I'm In"}
              </span>
            </button>
          ) : null}

          {role.isJoined && role.isHost ? (
            <span className="col-span-2 inline-flex h-10 items-center justify-center rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-200 text-sm font-semibold">
              You&apos;re hosting
            </span>
          ) : null}

          {canStart ? (
            <button
              type="button"
              disabled={busy !== null}
              onClick={runStart}
              className={cn(
                "inline-flex h-10 items-center justify-center gap-2 rounded-lg border text-sm font-semibold transition-colors",
                "border-rose-500/40 bg-rose-600/15 text-rose-100 hover:bg-rose-600/22",
                "disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/30",
              )}
              aria-label="Start game"
            >
              <Play className="w-4 h-4" aria-hidden />
              {busy === "start" ? "Starting…" : "Start game"}
            </button>
          ) : null}

          {canEnd ? (
            <button
              type="button"
              disabled={busy !== null}
              onClick={runEnd}
              className={cn(
                "inline-flex h-10 items-center justify-center gap-2 rounded-lg border text-sm font-semibold transition-colors",
                "border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800",
                "disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/20",
              )}
              aria-label="End game"
            >
              <Square className="w-4 h-4" aria-hidden />
              {busy === "end" ? "Ending…" : "End game"}
            </button>
          ) : null}

          {role.canLeave ? (
            onLeave ? (
              <button
                type="button"
                onClick={() => onLeave(game)}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-rose-500/40 bg-rose-950/35 text-rose-100 text-sm font-semibold transition-colors hover:bg-rose-950/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/30"
              >
                {role.isSubstitute ? "Leave Waitlist" : "I'm Out"}
              </button>
            ) : (
              <span className="inline-flex h-10 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-200 text-sm font-semibold">
                {role.isSubstitute ? "On Waitlist" : "You're In"}
              </span>
            )
          ) : null}

          {role.canChat && onChat ? (
            <button
              type="button"
              onClick={() => onChat(game)}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900 text-slate-100 text-sm font-semibold transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/20"
              aria-label="Messages"
            >
              <MessageCircle className="w-4 h-4" aria-hidden />
              Messages
            </button>
          ) : null}
        </div>

        {canDelete ? (
          <button
            type="button"
            disabled={busy !== null}
            onClick={runDelete}
            className="mt-2 w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-red-500/50 bg-red-950/40 text-red-200 text-sm font-medium hover:bg-red-950/70 disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5 shrink-0" aria-hidden />
            {busy === "delete" ? "Deleting…" : "Delete game"}
          </button>
        ) : null}
      </div>
    );
  }

  function renderCompact() {
    const hasHostControls = canStart || canEnd || canDelete;
    return (
      <div className={cn("flex shrink-0 items-center gap-1.5", className)}>
        {role.canJoin && onJoin ? (
          <button
            type="button"
            onClick={() => onJoin(game)}
            className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-lg bg-amber-600/90 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-amber-500"
          >
            {isFull ? "Waitlist" : "Join"}
          </button>
        ) : null}

        {role.canChat && onChat ? (
          <button
            type="button"
            onClick={() => onChat(game)}
            className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-lg bg-teal-600/90 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-teal-500"
          >
            <MessageCircle className="h-3.5 w-3.5" aria-hidden />
            Chat
          </button>
        ) : null}

        {role.canLeave && onLeave ? (
          <IconAction
            label={role.isSubstitute ? "Leave waitlist" : "Leave game"}
            onClick={() => onLeave(game)}
            tone="rose"
          >
            {/* Not `Square` — that is the End-game glyph, and the two sat side by side. */}
            <LogOut className="h-3.5 w-3.5" aria-hidden />
          </IconAction>
        ) : null}

        {hasHostControls ? (
          <span className="mx-0.5 h-5 w-px shrink-0 bg-amber-500/25" aria-hidden />
        ) : null}

        {canStart ? (
          <IconAction label="Start game" onClick={runStart} disabled={busy !== null} tone="amber">
            <Play className="h-3.5 w-3.5" aria-hidden />
          </IconAction>
        ) : null}

        {canEnd ? (
          <IconAction label="End game" onClick={runEnd} disabled={busy !== null} tone="slate">
            <Square className="h-3.5 w-3.5" aria-hidden />
          </IconAction>
        ) : null}

        {canDelete ? (
          <IconAction label="Delete game" onClick={runDelete} disabled={busy !== null} tone="red">
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </IconAction>
        ) : null}
      </div>
    );
  }
}

const ICON_TONES = {
  amber: "border-amber-500/40 bg-amber-500/12 text-amber-200 hover:bg-amber-500/22",
  slate: "border-slate-600/60 bg-slate-800/70 text-slate-100 hover:bg-slate-700/80",
  rose: "border-rose-500/40 bg-rose-950/35 text-rose-200 hover:bg-rose-950/60",
  red: "border-red-500/45 bg-red-950/40 text-red-200 hover:bg-red-950/70",
} as const;

/**
 * Square icon button for list rows. 32px visually so it doesn't outweigh the row's Join/Chat
 * button, with the tap target pushed out to 44px via an inset pseudo-element.
 */
function IconAction({
  label,
  onClick,
  disabled,
  tone,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone: keyof typeof ICON_TONES;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "relative inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border transition-colors",
        "before:absolute before:-inset-1.5 before:content-['']",
        "disabled:opacity-50 disabled:pointer-events-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30",
        ICON_TONES[tone],
      )}
    >
      {children}
    </button>
  );
}
