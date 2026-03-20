import React, { useCallback, useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { ArrowLeft, Loader2, Send } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "./ui/sheet";
import { cn } from "./ui/utils";
import type { GameInboxRow, GameMessageRow } from "../../lib/supabase";
import {
  fetchGameMessages,
  fetchMyGameInbox,
  sendGameMessage,
  subscribeGameMessages,
} from "../../lib/gameChat";

export type MessengerThreadFocus = {
  gameId: string;
  title: string;
  sport: string;
};

type GameMessengerSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, show thread; when null, show conversation list. */
  focusThread: MessengerThreadFocus | null;
  onFocusThreadChange: (focus: MessengerThreadFocus | null) => void;
  currentUserId: string | null;
  ensureSession?: () => Promise<boolean>;
  /** Client-side truth: only show games the user is joined to. */
  joinedGameIds?: Set<string>;
  /** Center the map on the selected conversation's game. */
  onSelectGameOnMap?: (gameId: string) => void;
  /** Leave chat and also unjoin the game (so the thread disappears). */
  onLeaveThread?: (gameId: string) => Promise<void> | void;
};

export function GameMessengerSheet({
  open,
  onOpenChange,
  focusThread,
  onFocusThreadChange,
  currentUserId,
  ensureSession,
  joinedGameIds,
  onSelectGameOnMap,
  onLeaveThread,
}: GameMessengerSheetProps) {
  const [inbox, setInbox] = useState<GameInboxRow[]>([]);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [messages, setMessages] = useState<GameMessageRow[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [leavingThread, setLeavingThread] = useState(false);
  const listEndRef = useRef<HTMLDivElement>(null);

  const loadInbox = useCallback(() => {
    setInboxLoading(true);
    fetchMyGameInbox().then(({ data, error }) => {
      setInboxLoading(false);
      if (error) {
        console.warn("[FUN] inbox", error);
        setInbox([]);
        return;
      }
      const rows = data ?? [];
      const filtered = joinedGameIds ? rows.filter((r) => joinedGameIds.has(r.id)) : rows;
      setInbox(filtered);
    });
  }, [joinedGameIds]);

  useEffect(() => {
    if (!open) return;
    if (focusThread) return;
    loadInbox();
  }, [open, focusThread, loadInbox]);

  useEffect(() => {
    if (!open || !focusThread) {
      setMessages([]);
      return;
    }

    let cancelled = false;
    setMessagesLoading(true);
    fetchGameMessages(focusThread.gameId).then(({ data, error }) => {
      if (cancelled) return;
      setMessagesLoading(false);
      if (error) {
        console.warn("[FUN] messages", error);
        setMessages([]);
        return;
      }
      setMessages(data ?? []);
    });

    const unsub = subscribeGameMessages(focusThread.gameId, (row) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === row.id)) return prev;
        return [...prev, row];
      });
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [open, focusThread?.gameId]);

  useEffect(() => {
    if (!open || !focusThread) return;
    listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open, focusThread]);

  const handleSend = async () => {
    if (!focusThread || !draft.trim()) return;
    setSendError(null);
    if (ensureSession && !(await ensureSession())) {
      setSendError("Sign in to send messages.");
      return;
    }
    setSending(true);
    const { data: sent, error } = await sendGameMessage(focusThread.gameId, draft);
    setSending(false);
    if (error) {
      setSendError(error.message);
      return;
    }
    setDraft("");
    if (sent) {
      setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
    }
    loadInbox();
  };

  const handleLeaveChat = async () => {
    if (!focusThread || !onLeaveThread || leavingThread) return;
    setLeavingThread(true);
    try {
      await onLeaveThread(focusThread.gameId);
    } finally {
      setLeavingThread(false);
    }
  };

  const showList = !focusThread;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn(
          // Drawer: about 20% of viewport width (capped on very large screens),
          // full height, anchored to the right.
          "h-full w-[20vw] min-w-[260px] max-w-[420px] rounded-l-2xl border-slate-700 bg-[#0c1222] text-slate-100 p-0 gap-0",
          // Override the default SheetContent width (w-3/4 + sm:max-w-sm).
          "sm:max-w-none",
          "flex flex-col overflow-hidden"
        )}
        aria-describedby={undefined}
      >
        <SheetHeader className="border-b border-white/[0.08] px-4 py-3 space-y-0 shrink-0">
          <div className="flex items-center gap-2 pr-10">
            {!showList && (
              <button
                type="button"
                onClick={() => {
                  onFocusThreadChange(null);
                  loadInbox();
                }}
                className="p-2 rounded-full hover:bg-white/10 text-slate-300 -ml-2"
                aria-label="Back to conversations"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-left text-base text-white truncate">
                {showList ? "Game chats" : focusThread.title || "Game chat"}
              </SheetTitle>
              <SheetDescription className="text-left text-xs text-slate-500">
                {showList
                  ? "Pickups you joined — one thread per game."
                  : `${focusThread.sport} · with your squad`}
              </SheetDescription>
            </div>
            {!showList && onLeaveThread && (
              <button
                type="button"
                onClick={() => void handleLeaveChat()}
                disabled={leavingThread}
                className="ml-auto px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-medium border border-slate-600 disabled:opacity-50 disabled:pointer-events-none transition-colors"
                aria-label="Leave chat and unjoin game"
              >
                {leavingThread ? "Leaving…" : "Leave chat"}
              </button>
            )}
          </div>
        </SheetHeader>

        {showList ? (
          <div className="flex-1 overflow-y-auto px-3 py-2">
            {inboxLoading ? (
              <div className="flex justify-center py-12 text-slate-500">
                <Loader2 className="w-8 h-8 animate-spin opacity-60" />
              </div>
            ) : inbox.length === 0 ? (
              <p className="text-sm text-slate-500 text-center px-4 py-10 leading-relaxed">
                Join a game on the map to unlock its chat. Your threads will show up here.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {inbox.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onFocusThreadChange({
                          gameId: row.id,
                          title: row.title,
                          sport: row.sport,
                        });
                        onSelectGameOnMap?.(row.id);
                      }}
                      className="w-full text-left rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-3 hover:bg-white/[0.06] transition-colors"
                    >
                      <div className="flex justify-between gap-2 items-start">
                        <span className="font-semibold text-slate-100 text-sm truncate">
                          {row.title}
                        </span>
                        <span className="text-[10px] uppercase tracking-wide text-slate-500 shrink-0">
                          {row.starts_at
                            ? format(new Date(row.starts_at), "MMM d")
                            : "TBD"}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {row.sport} · {row.spots_remaining} spots left
                      </p>
                      <p className="text-xs text-slate-400 mt-1.5 line-clamp-2">
                        {row.last_message_body?.trim()
                          ? row.last_message_body
                          : "No messages yet — say hi!"}
                      </p>
                      {row.last_message_at && (
                        <p className="text-[10px] text-slate-600 mt-1">
                          {format(new Date(row.last_message_at), "MMM d, h:mm a")}
                        </p>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
              {messagesLoading ? (
                <div className="flex justify-center py-12 text-slate-500">
                  <Loader2 className="w-8 h-8 animate-spin opacity-60" />
                </div>
              ) : (
                messages.map((m) => {
                  const mine = currentUserId != null && m.user_id === currentUserId;
                  return (
                    <div
                      key={m.id}
                      className={cn("flex", mine ? "justify-end" : "justify-start")}
                    >
                      <div
                        className={cn(
                          "max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed",
                          mine
                            ? "bg-violet-600/90 text-white rounded-br-md"
                            : "bg-white/[0.08] text-slate-200 rounded-bl-md"
                        )}
                      >
                        {!mine && (
                          <p className="text-[10px] text-slate-500 mb-0.5">Teammate</p>
                        )}
                        <p className="whitespace-pre-wrap break-words">{m.body}</p>
                        <p
                          className={cn(
                            "text-[10px] mt-1 opacity-70",
                            mine ? "text-violet-100" : "text-slate-500"
                          )}
                        >
                          {format(new Date(m.created_at), "h:mm a")}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={listEndRef} />
            </div>

            <div className="border-t border-white/[0.08] p-3 shrink-0 bg-[#0c1222]">
              {sendError && (
                <p className="text-xs text-amber-400 mb-2 px-1">{sendError}</p>
              )}
              <div className="flex gap-2 items-end">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (!sending && draft.trim()) void handleSend();
                    }
                  }}
                  placeholder="Message the squad…"
                  rows={2}
                  className="flex-1 resize-none rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                />
                <button
                  type="button"
                  disabled={sending || !draft.trim()}
                  onClick={() => void handleSend()}
                  className="shrink-0 h-11 w-11 rounded-xl bg-violet-600 text-white flex items-center justify-center disabled:opacity-40 disabled:pointer-events-none hover:bg-violet-500 transition-colors"
                  aria-label="Send"
                >
                  {sending ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Send className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
