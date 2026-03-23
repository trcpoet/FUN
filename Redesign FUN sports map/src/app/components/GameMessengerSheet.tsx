import React, { useCallback, useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { ArrowLeft, Info, Loader2, Maximize2, Minimize2, Send, Users } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "./ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { cn } from "./ui/utils";
import type { GameInboxRow, GameMessageRow, GameRow } from "../../lib/supabase";
import {
  fetchGameChatMembers,
  type GameChatMember,
  fetchGameMessages,
  fetchMyGameInbox,
  sendGameMessage,
  subscribeGameMessages,
} from "../../lib/gameChat";
import {
  formatUrgentCountdown,
  getCountdownRemainingMs,
} from "../../lib/mapGameTimer";

export type MessengerThreadFocus = {
  gameId: string;
  title: string;
  sport: string;
  /** Scheduled start (ISO). From inbox or map when available. */
  startsAt?: string | null;
  /** For untimed games: map TTL countdown (from `games.created_at`). */
  createdAt?: string | null;
  participantCount?: number;
  spotsRemaining?: number;
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

function threadScheduleLines(args: {
  startsAt: string | null;
  createdAt: string | null;
  nowMs: number;
}): { timeLine: string; countdownLine: string } {
  if (args.startsAt) {
    const d = new Date(args.startsAt);
    const t = d.getTime();
    const timeLine = format(d, "EEE, MMM d · h:mm a");
    if (t <= args.nowMs) {
      return { timeLine, countdownLine: "Live" };
    }
    return { timeLine, countdownLine: `Starts in ${formatUrgentCountdown(t - args.nowMs)}` };
  }
  if (args.createdAt) {
    const rem = getCountdownRemainingMs(
      { starts_at: null, created_at: args.createdAt } as GameRow,
      args.nowMs
    );
    const timeLine = "No set time";
    if (rem == null) return { timeLine, countdownLine: "No longer on map" };
    return { timeLine, countdownLine: `${formatUrgentCountdown(rem)} left on map` };
  }
  return { timeLine: "Time TBD", countdownLine: "" };
}

function SquadMemberList({
  membersLoading,
  chatMembers,
  currentUserId,
}: {
  membersLoading: boolean;
  chatMembers: GameChatMember[];
  currentUserId: string | null;
}) {
  if (membersLoading) {
    return (
      <div className="flex justify-center py-8 text-slate-500">
        <Loader2 className="size-6 animate-spin opacity-60" />
      </div>
    );
  }
  if (chatMembers.length === 0) {
    return (
      <p className="px-2 py-4 text-center text-xs text-slate-500">No members loaded yet.</p>
    );
  }
  return (
    <ul className="space-y-1">
      {chatMembers.map((mem) => {
        const isYou = currentUserId != null && mem.user_id === currentUserId;
        const label = mem.display_name?.trim() || "Player";
        return (
          <li key={mem.user_id}>
            <div className="flex items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-white/[0.04]">
              <Avatar className="size-9 shrink-0 border border-white/10">
                {mem.avatar_url?.trim() ? (
                  <AvatarImage src={mem.avatar_url} alt="" className="object-cover" />
                ) : null}
                <AvatarFallback className="bg-slate-800 text-xs text-slate-200">
                  {label.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-100">
                  {label}
                  {isYou ? (
                    <span className="ml-1.5 text-[10px] font-normal text-cyan-400/90">(you)</span>
                  ) : null}
                </p>
                <p className="text-[10px] text-slate-500 capitalize">{mem.role}</p>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

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
  /** Wide layout: chat centered with members on the right (desktop). */
  const [threadExpanded, setThreadExpanded] = useState(false);
  /** Full-width inbox: all conversations / groups in a grid. */
  const [inboxExpanded, setInboxExpanded] = useState(false);
  const [chatMembers, setChatMembers] = useState<GameChatMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [headerNow, setHeaderNow] = useState(() => Date.now());
  const [squadInfoOpen, setSquadInfoOpen] = useState(false);
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

  useEffect(() => {
    if (!focusThread) setThreadExpanded(false);
    else setInboxExpanded(false);
  }, [focusThread]);

  useEffect(() => {
    if (!open) setInboxExpanded(false);
  }, [open]);

  useEffect(() => {
    if (!open) setSquadInfoOpen(false);
  }, [open]);

  useEffect(() => {
    if (!open || !focusThread) return;
    const id = window.setInterval(() => setHeaderNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [open, focusThread?.gameId]);

  useEffect(() => {
    if (!open || !focusThread) {
      setChatMembers([]);
      return;
    }
    let cancelled = false;
    setMembersLoading(true);
    fetchGameChatMembers(focusThread.gameId).then(({ data, error }) => {
      if (cancelled) return;
      setMembersLoading(false);
      if (error) {
        console.warn("[FUN] chat members", error);
        setChatMembers([]);
        return;
      }
      setChatMembers(data ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [open, focusThread?.gameId]);

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

  const inboxRow = focusThread ? inbox.find((r) => r.id === focusThread.gameId) : undefined;
  const threadStartsAt = focusThread?.startsAt ?? inboxRow?.starts_at ?? null;
  const threadCreatedAt = focusThread?.createdAt ?? null;
  const participantTotal = Math.max(
    focusThread?.participantCount ?? inboxRow?.participant_count ?? 0,
    chatMembers.length,
  );
  const spotsLeft =
    focusThread?.spotsRemaining ?? inboxRow?.spots_remaining ?? undefined;

  const schedule = focusThread
    ? threadScheduleLines({
        startsAt: threadStartsAt,
        createdAt: threadCreatedAt,
        nowMs: headerNow,
      })
    : { timeLine: "", countdownLine: "" };

  const rosterSummary =
    focusThread &&
    (membersLoading && participantTotal === 0
      ? "Loading roster…"
      : `${participantTotal} ${participantTotal === 1 ? "player" : "players"}${
          spotsLeft != null ? ` · ${spotsLeft} spots left` : ""
        }`);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn(
          "h-full border-slate-700 bg-[#0c1222] text-slate-100 p-0 gap-0 sm:max-w-none flex flex-col overflow-hidden",
          (threadExpanded && focusThread) || (inboxExpanded && showList)
            ? "!left-0 !right-0 !w-full !max-w-full !rounded-none"
            : "w-[20vw] min-w-[300px] max-w-[420px] rounded-l-2xl",
        )}
        aria-describedby={undefined}
      >
        <SheetHeader className="border-b border-white/[0.08] px-4 py-3 space-y-0 shrink-0">
          {showList ? (
            <div className="flex items-start gap-2 pr-12">
              <div className="min-w-0 flex-1 flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <SheetTitle className="text-left text-base text-white truncate">
                    Game chats
                  </SheetTitle>
                  <SheetDescription className="text-left text-xs text-slate-500">
                    {inboxExpanded
                      ? "All your groups — tap a card to open the thread."
                      : "Pickups you joined — one thread per game."}
                  </SheetDescription>
                </div>
                <button
                  type="button"
                  onClick={() => setInboxExpanded((v) => !v)}
                  className="inline-flex size-5 shrink-0 items-center justify-center rounded border border-cyan-500/25 bg-cyan-500/5 text-cyan-400/90 hover:border-cyan-400/45 hover:bg-cyan-500/15 hover:text-cyan-300 transition-colors mt-0.5"
                  aria-label={
                    inboxExpanded
                      ? "Collapse conversation list"
                      : "Expand — full width, all conversations"
                  }
                  title={
                    inboxExpanded
                      ? "Compact list"
                      : "Expand — full width chat with all groups"
                  }
                >
                  {inboxExpanded ? (
                    <Minimize2 className="size-2.5" />
                  ) : (
                    <Maximize2 className="size-2.5" />
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2 pr-12">
              <div className="flex items-center gap-2 min-h-10">
                <button
                  type="button"
                  onClick={() => {
                    onFocusThreadChange(null);
                    setThreadExpanded(false);
                    loadInbox();
                  }}
                  className="p-2 rounded-full hover:bg-white/10 text-slate-300 -ml-2 shrink-0"
                  aria-label="Back to conversations"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                {focusThread && (
                  <button
                    type="button"
                    onClick={() => setThreadExpanded((v) => !v)}
                    className="p-2 rounded-full hover:bg-white/10 text-slate-300 -ml-1 shrink-0"
                    aria-label={
                      threadExpanded
                        ? "Use compact chat panel"
                        : "Expand chat — messages center, members on the right"
                    }
                    title={threadExpanded ? "Compact" : "Expand"}
                  >
                    {threadExpanded ? (
                      <Minimize2 className="w-5 h-5 text-cyan-300" />
                    ) : (
                      <Maximize2 className="w-5 h-5 text-cyan-300" />
                    )}
                  </button>
                )}
                {onLeaveThread && (
                  <button
                    type="button"
                    onClick={() => void handleLeaveChat()}
                    disabled={leavingThread}
                    className="ml-auto shrink-0 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 text-[11px] font-medium border border-slate-600 disabled:opacity-50 disabled:pointer-events-none transition-colors"
                    aria-label="Leave chat and unjoin game"
                  >
                    {leavingThread ? "Leaving…" : "Leave"}
                  </button>
                )}
              </div>
              <div className="min-w-0 space-y-1">
                <div className="flex items-start gap-1.5 min-w-0">
                  <SheetTitle className="text-left text-sm font-semibold text-white break-words leading-snug min-w-0 flex-1">
                    {focusThread?.title || "Game chat"}
                  </SheetTitle>
                  <button
                    type="button"
                    onClick={() => setSquadInfoOpen(true)}
                    className="lg:hidden shrink-0 inline-flex size-8 items-center justify-center rounded-md border border-cyan-500/25 bg-cyan-500/5 text-cyan-400/90 hover:border-cyan-400/45 hover:bg-cyan-500/15 hover:text-cyan-300 transition-colors mt-0.5"
                    aria-label="Squad — view all members"
                    title="Squad"
                  >
                    <Info className="size-4" strokeWidth={2} />
                  </button>
                </div>
                <div className="space-y-0.5 text-left" aria-live="polite">
                  <p className="text-xs text-slate-300 leading-snug">{schedule.timeLine}</p>
                  {schedule.countdownLine ? (
                    <p className="text-xs font-medium text-cyan-400/95 tabular-nums">
                      {schedule.countdownLine}
                    </p>
                  ) : null}
                  <p className="text-[11px] text-slate-500 leading-snug">
                    {focusThread?.sport}
                    {rosterSummary ? ` · ${rosterSummary}` : ""}
                  </p>
                </div>
                <SheetDescription className="sr-only">
                  {focusThread
                    ? `${focusThread.title}. ${schedule.timeLine}. ${
                        schedule.countdownLine || ""
                      }. ${rosterSummary || ""}`
                    : ""}
                </SheetDescription>
              </div>
            </div>
          )}
        </SheetHeader>

        {showList ? (
          <div
            className={cn(
              "flex-1 overflow-y-auto px-3 py-2",
              inboxExpanded &&
                "px-4 md:px-8 lg:px-12 max-w-[1600px] mx-auto w-full",
            )}
          >
            {inboxLoading ? (
              <div className="flex justify-center py-12 text-slate-500">
                <Loader2 className="w-8 h-8 animate-spin opacity-60" />
              </div>
            ) : inbox.length === 0 ? (
              <p className="text-sm text-slate-500 text-center px-4 py-10 leading-relaxed">
                Join a game on the map to unlock its chat. Your threads will show up here.
              </p>
            ) : (
              <ul
                className={cn(
                  inboxExpanded
                    ? "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3"
                    : "space-y-1.5",
                )}
              >
                {inbox.map((row) => {
                  const openThread = () => {
                    // From expanded grid: open full-width thread (messages + members); compact list stays narrow.
                    setThreadExpanded(inboxExpanded);
                    onFocusThreadChange({
                      gameId: row.id,
                      title: row.title,
                      sport: row.sport,
                      startsAt: row.starts_at,
                      participantCount: row.participant_count,
                      spotsRemaining: row.spots_remaining,
                    });
                    onSelectGameOnMap?.(row.id);
                  };
                  return (
                    <li key={row.id}>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={openThread}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openThread();
                          }
                        }}
                        className="min-w-0 cursor-pointer rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-3 text-left outline-none transition-colors hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-cyan-500/40"
                      >
                        <div className="flex justify-between gap-2 items-center">
                          <span className="font-semibold text-slate-100 text-sm truncate min-w-0">
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
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : (
          <div
            className={cn(
              "flex min-h-0 flex-1 flex-col overflow-hidden",
              threadExpanded && "lg:flex-row lg:items-stretch",
            )}
          >
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
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
                              : "bg-white/[0.08] text-slate-200 rounded-bl-md",
                          )}
                        >
                          {!mine && (
                            <p className="text-[10px] text-slate-500 mb-0.5">Teammate</p>
                          )}
                          <p className="whitespace-pre-wrap break-words">{m.body}</p>
                          <p
                            className={cn(
                              "text-[10px] mt-1 opacity-70",
                              mine ? "text-violet-100" : "text-slate-500",
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
            </div>

            {threadExpanded && (
              <aside className="hidden lg:flex w-full shrink-0 flex-col border-t border-white/[0.08] bg-[#080d18] lg:w-[min(20rem,34vw)] lg:border-l lg:border-t-0">
                <div className="flex items-center gap-2 border-b border-white/[0.08] px-3 py-2.5">
                  <Users className="size-4 text-cyan-400" aria-hidden />
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Squad
                  </p>
                </div>
                <div className="flex-1 overflow-y-auto px-2 py-2">
                  <SquadMemberList
                    membersLoading={membersLoading}
                    chatMembers={chatMembers}
                    currentUserId={currentUserId}
                  />
                </div>
              </aside>
            )}
          </div>
        )}
      </SheetContent>

      <Dialog open={squadInfoOpen} onOpenChange={setSquadInfoOpen}>
        <DialogContent
          className="max-h-[min(80vh,28rem)] flex flex-col gap-0 overflow-hidden border-slate-700 bg-[#080d18] p-0 text-slate-100 sm:max-w-md"
          aria-describedby={undefined}
        >
          <DialogHeader className="border-b border-white/[0.08] px-4 py-3 shrink-0">
            <DialogTitle className="flex items-center gap-2 text-left text-base font-semibold text-white">
              <Users className="size-4 text-cyan-400 shrink-0" aria-hidden />
              Squad
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-2 py-3">
            <SquadMemberList
              membersLoading={membersLoading}
              chatMembers={chatMembers}
              currentUserId={currentUserId}
            />
          </div>
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}
