import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { format, formatDistanceToNow } from "date-fns";
import { ArrowLeft, ChevronDown, Info, Loader2, MapPin, Maximize2, Minimize2, Share2, StickyNote, Users } from "lucide-react";
import { useNavigate } from "react-router";
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
import { glassMessengerPanel } from "../styles/glass";
import type {
  DmInboxRow,
  DmMessageRow,
  GameInboxRow,
  GameMessageRow,
  GameRow,
  GameVisibility,
  MapNoteCommentRow,
  MapNoteVisibility,
  NoteInboxRow,
} from "../../lib/supabase";
import {
  archiveGameChat,
  fetchGameChatMembers,
  type GameChatMember,
  fetchGameMessages,
  fetchMyGameInbox,
  sendGameMessage,
  subscribeGameMessages,
  unarchiveGameChat,
} from "../../lib/gameChat";
import { fetchDmMessages, fetchMyDmInbox, sendDmMessage, subscribeDmMessages } from "../../lib/dmChat";
import { useNearBottom } from "../../hooks/useNearBottom";
import { useUnread } from "../contexts/UnreadContext";
import {
  fetchThreadReadReceipts,
  subscribeThreadReads,
  type ReadReceiptRow,
} from "../../lib/chatReads";
import { ReadReceipts } from "./chat/ReadReceipts";
import {
  formatUrgentCountdown,
  getCountdownRemainingMs,
  getGameEndsAtMs,
  isGameEnded,
} from "../../lib/mapGameTimer";
import {
  addNoteComment,
  fetchMyNoteInbox,
  fetchNoteById,
  fetchNoteComments,
  getGameLatLng,
  subscribeNoteComments,
} from "../../lib/api";
import { InviteAdminPanel } from "./chat/InviteAdminPanel";
import { Composer } from "./chat/Composer";
import { InboxRow } from "./chat/InboxRow";
import { MessageList } from "./chat/MessageList";
import { NoteThreadHeaderCard } from "./chat/NoteThreadHeaderCard";
import { TrustBadge } from "./chat/TrustBadge";
import {
  dmMessageToChat,
  gameMessageToChat,
  newClientId,
  noteCommentToChat,
  pendingToChat,
  type ChatMessage,
  type PendingMessage,
} from "./chat/messageTypes";
import { useChatTrust, type ChatTrust } from "../../hooks/useChatTrust";
import { NoteCommentLikeButton } from "./feed/NoteCommentLikeButton";
import { GameActionBar } from "./game/GameActionBar";
import { gameViewerRole } from "../lib/gameViewerRole";
import { inboxGameRow, threadGameRow } from "../lib/threadGameRow";
import { PostGamePanel } from "./chat/PostGamePanel";
import { toast } from "sonner";

export type GameThreadFocus = {
  kind: "game";
  gameId: string;
  title: string;
  sport: string;
  /** Scheduled start (ISO). From inbox or map when available. */
  startsAt?: string | null;
  /** Scheduled end (`starts_at + duration_minutes`, ISO). */
  endsAt?: string | null;
  /** When the host pressed End (ISO). Beats every scheduled window. */
  endedAt?: string | null;
  /** When the host pressed Start (ISO). The only end anchor an untimed game has. */
  liveStartedAt?: string | null;
  /** Lifecycle status, when the opener knew it. Falls back to the inbox row. */
  status?: GameRow["status"];
  durationMinutes?: number | null;
  /** For untimed games: map TTL countdown (from `games.created_at`). */
  createdAt?: string | null;
  participantCount?: number;
  spotsRemaining?: number;
  /** Game host id — used to enable invite admin / rematch controls. */
  createdBy?: string | null;
  /** Drives chat membership UX (stranger badges, invite panel, etc.). */
  visibility?: GameVisibility | null;
  /** Sharable token for invite-only games (`/g/<token>`). */
  /** Coords + label so "Plan rematch" pre-fills location without an extra fetch. */
  lat?: number | null;
  lng?: number | null;
  locationLabel?: string | null;
};

export type DmThreadFocus = {
  kind: "dm";
  threadId: string;
  otherUserId: string;
  displayName: string | null;
  avatarUrl: string | null;
};

export type NoteThreadFocus = {
  kind: "note";
  noteId: string;
  /** Hydrated post body (lazy-loaded if missing). */
  body?: string | null;
  visibility?: MapNoteVisibility | null;
  createdAt?: string | null;
  createdBy?: string | null;
  placeName?: string | null;
  /** For "View on map" deep-link without a re-fetch. */
  lat?: number | null;
  lng?: number | null;
};

export type MessengerThreadFocus = GameThreadFocus | DmThreadFocus | NoteThreadFocus;

export type PlanRematchPayload = {
  fromGameId: string;
  fromTitle: string;
  sport: string;
  spotsNeeded: number;
  durationMinutes: number | null;
  visibility: GameVisibility | null;
  lat: number | null;
  lng: number | null;
  locationLabel: string | null;
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
  /** Leave chat and also unjoin the game (so the thread disappears). Return an Error on failure, null on success. */
  onLeaveThread?: (gameId: string) => Promise<Error | null | void>;
  /**
   * Host controls for the game this thread belongs to.
   *
   * The inbox is the only list in the app holding every game you are in, at any date — the
   * map hides games absorbed by a venue pin and the live strip only reaches three hours out.
   * Without these a host had no way to start, end or delete a game they made for next week.
   */
  onStartHostedGame?: (game: GameRow) => Promise<void> | void;
  onEndHostedGame?: (game: GameRow) => Promise<void> | void;
  onDeleteHostedGame?: (game: GameRow) => Promise<boolean> | void;
  /** Idle-prefetched rows so the list can paint before network round-trips. */
  inboxBootstrap?: GameInboxRow[] | null;
  /**
   * Bump to force an inbox reload. The app owns the lifecycle RPCs (start, end),
   * and their result lands in the row this sheet reasons with.
   */
  inboxRefreshKey?: number;
  dmInboxBootstrap?: DmInboxRow[] | null;
  /** Caller opens CreateGameModal pre-filled from the ended game's metadata. */
  onPlanRematch?: (payload: PlanRematchPayload) => void;
};

/**
 * Decide whether an inbox row should be in the "Past games" section.
 *
 * This used to be a private copy of the rules that checked `status` and `ends_at`
 * only, so a game the host ended early — `ended_at` set, `ends_at` still an hour
 * out — stayed in the active list while its own thread header called it over.
 * One predicate now answers for both.
 */
function isInboxRowEnded(row: GameInboxRow, nowMs: number): boolean {
  return isGameEnded(inboxGameRow(row), nowMs);
}

/** Split inbox rows into "still active" and "ended" buckets, preserving sort order. */
function partitionInboxByLifecycle(
  rows: GameInboxRow[],
  nowMs: number,
): { active: GameInboxRow[]; ended: GameInboxRow[] } {
  const active: GameInboxRow[] = [];
  const ended: GameInboxRow[] = [];
  for (const r of rows) {
    if (isInboxRowEnded(r, nowMs)) ended.push(r);
    else active.push(r);
  }
  return { active, ended };
}

/**
 * The two lines under the thread title.
 *
 * Reads the same `GameRow` the action bar does — this used to build its own partial stub,
 * which meant the header could describe a game the buttons disagreed about.
 */
function threadScheduleLines(
  game: GameRow,
  nowMs: number,
): { timeLine: string; countdownLine: string; ended: boolean } {
  if (game.starts_at) {
    const d = new Date(game.starts_at);
    const t = d.getTime();
    const timeLine = format(d, "EEE, MMM d · h:mm a");

    if (isGameEnded(game, nowMs)) {
      return { timeLine, countdownLine: "Game ended · Plan rematch?", ended: true };
    }
    if (t <= nowMs) {
      const ends = getGameEndsAtMs(game);
      if (ends != null) {
        return {
          timeLine,
          countdownLine: `Live · ${formatUrgentCountdown(ends - nowMs)} left`,
          ended: false,
        };
      }
      return { timeLine, countdownLine: "Live", ended: false };
    }
    return {
      timeLine,
      countdownLine: `Starts in ${formatUrgentCountdown(t - nowMs)}`,
      ended: false,
    };
  }
  if (game.created_at) {
    const rem = getCountdownRemainingMs(game, nowMs);
    const timeLine = "No set time";
    if (rem == null) return { timeLine, countdownLine: "No longer on map", ended: true };
    return { timeLine, countdownLine: `${formatUrgentCountdown(rem)} left on map`, ended: false };
  }
  return { timeLine: "Set time", countdownLine: "", ended: false };
}

function SquadMemberRow({
  member,
  trust,
  isYou,
  onOpenProfile,
}: {
  member: GameChatMember;
  trust: ChatTrust | undefined;
  isYou: boolean;
  onOpenProfile?: (userId: string) => void;
}) {
  const label = member.display_name?.trim() || "Player";
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpenProfile?.(member.user_id)}
        className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40"
        aria-label={`Open ${label}'s profile`}
      >
        <Avatar className="size-9 shrink-0 border border-white/10">
          {member.avatar_url?.trim() ? (
            <AvatarImage src={member.avatar_url} alt="" className="object-cover" />
          ) : null}
          <AvatarFallback className="bg-slate-800 text-xs text-slate-200">
            {label.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-sm font-medium text-slate-100">
            <span className="truncate">{label}</span>
            {isYou ? (
              <span className="text-[10px] font-normal text-cyan-400/90">(you)</span>
            ) : (
              <TrustBadge trust={trust} />
            )}
          </p>
          <p className="text-[10px] text-slate-500 capitalize">{member.role}</p>
        </div>
      </button>
    </li>
  );
}

function SquadMemberList({
  membersLoading,
  chatMembers,
  currentUserId,
  trustByUserId,
  groupByTrust,
  onOpenProfile,
}: {
  membersLoading: boolean;
  chatMembers: GameChatMember[];
  currentUserId: string | null;
  /** Optional trust map; when present roster can group / badge. */
  trustByUserId?: Map<string, ChatTrust>;
  /** When true (public games), roster splits into Friends · You · Strangers. */
  groupByTrust?: boolean;
  onOpenProfile?: (userId: string) => void;
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

  if (!groupByTrust || !trustByUserId) {
    return (
      <ul className="space-y-1">
        {chatMembers.map((mem) => (
          <SquadMemberRow
            key={mem.user_id}
            member={mem}
            trust={trustByUserId?.get(mem.user_id)}
            isYou={currentUserId != null && mem.user_id === currentUserId}
            onOpenProfile={onOpenProfile}
          />
        ))}
      </ul>
    );
  }

  const groups: { key: string; label: string; rows: GameChatMember[] }[] = [
    { key: "self_host", label: "You & host", rows: [] },
    { key: "friends", label: "Friends", rows: [] },
    { key: "strangers", label: "Strangers", rows: [] },
  ];
  for (const m of chatMembers) {
    const t = trustByUserId.get(m.user_id) ?? "stranger";
    if (t === "self" || t === "host") groups[0].rows.push(m);
    else if (t === "friend" || t === "mutual") groups[1].rows.push(m);
    else groups[2].rows.push(m);
  }

  return (
    <div className="space-y-3">
      {groups
        .filter((g) => g.rows.length > 0)
        .map((g) => (
          <section key={g.key}>
            <h4 className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              {g.label} · {g.rows.length}
            </h4>
            <ul className="space-y-1">
              {g.rows.map((mem) => (
                <SquadMemberRow
                  key={mem.user_id}
                  member={mem}
                  trust={trustByUserId.get(mem.user_id)}
                  isYou={currentUserId != null && mem.user_id === currentUserId}
                  onOpenProfile={onOpenProfile}
                />
              ))}
            </ul>
          </section>
        ))}
    </div>
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
  onStartHostedGame,
  onEndHostedGame,
  onDeleteHostedGame,
  inboxBootstrap = null,
  inboxRefreshKey = 0,
  dmInboxBootstrap = null,
  onPlanRematch,
}: GameMessengerSheetProps) {
  const navigate = useNavigate();
  const unread = useUnread();
  const [mode, setMode] = useState<"groups" | "direct" | "notes">("groups");
  const [inbox, setInbox] = useState<GameInboxRow[]>([]);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [messages, setMessages] = useState<GameMessageRow[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [dmInbox, setDmInbox] = useState<DmInboxRow[]>([]);
  const [dmInboxLoading, setDmInboxLoading] = useState(false);
  const [dmMessages, setDmMessages] = useState<DmMessageRow[]>([]);
  const [dmMessagesLoading, setDmMessagesLoading] = useState(false);
  // Map-notes Inbox + per-note thread state.
  const [noteInbox, setNoteInbox] = useState<NoteInboxRow[]>([]);
  const [noteInboxLoading, setNoteInboxLoading] = useState(false);
  /** Segmented Notes inbox: my own notes vs notes I've commented in. */
  const [notesView, setNotesView] = useState<"mine" | "commented">("mine");
  const [noteComments, setNoteComments] = useState<MapNoteCommentRow[]>([]);
  const [noteCommentsLoading, setNoteCommentsLoading] = useState(false);
  /** Hydrated note details for the currently focused note thread. */
  const [activeNote, setActiveNote] = useState<{
    id: string;
    body: string;
    visibility: MapNoteVisibility;
    created_at: string;
    created_by: string | null;
    place_name: string | null;
    lat: number | null;
    lng: number | null;
  } | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [leavingThread, setLeavingThread] = useState(false);
  const [leaveThreadError, setLeaveThreadError] = useState<string | null>(null);
  /** Wide layout: chat centered with members on the right (desktop). */
  const [threadExpanded, setThreadExpanded] = useState(false);
  /** Full-width inbox: all conversations / groups in a grid. */
  const [inboxExpanded, setInboxExpanded] = useState(false);
  const [chatMembers, setChatMembers] = useState<GameChatMember[]>([]);
  const nameForUserId = useCallback(
    (uid: string) => {
      const m = chatMembers.find((x) => x.user_id === uid);
      return m?.display_name?.trim() || "Player";
    },
    [chatMembers],
  );
  const avatarForUserId = useCallback(
    (uid: string) => {
      const m = chatMembers.find((x) => x.user_id === uid);
      return m?.avatar_url?.trim() || null;
    },
    [chatMembers],
  );

  const [membersLoading, setMembersLoading] = useState(false);
  const [headerNow, setHeaderNow] = useState(() => Date.now());
  const [squadInfoOpen, setSquadInfoOpen] = useState(false);
  const [openingLocation, setOpeningLocation] = useState(false);
  const [shareBusyGameId, setShareBusyGameId] = useState<string | null>(null);
  const listEndRef = useRef<HTMLDivElement>(null);
  /** There is history older than what is loaded. */
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  /** Messages that arrived while the reader was up in the history. */
  const [unseenCount, setUnseenCount] = useState(0);
  const { ref: scrollerRef, atBottom, scrollToBottom } = useNearBottom();
  /** The newest message we have already reacted to, so we react once. */
  const lastSeenMessageId = useRef<string | null>(null);
  /** Everyone else's read watermark in the open thread. */
  const [receipts, setReceipts] = useState<ReadReceiptRow[]>([]);
  /** Messages drawn before the server confirmed them. */
  const [pending, setPending] = useState<PendingMessage[]>([]);
  /** Bumped to force the open thread to re-hydrate. */
  const [reloadKey, setReloadKey] = useState(0);

  const handleOpenThreadLocation = useCallback(async () => {
    if (!focusThread) return;
    setOpeningLocation(true);
    try {
      if (focusThread.kind === "game") {
        if (onSelectGameOnMap) {
          navigate("/");
          requestAnimationFrame(() => onSelectGameOnMap(focusThread.gameId));
          onOpenChange(false);
          return;
        }
        const coords = await getGameLatLng(focusThread.gameId);
        const urlLine = coords
          ? `https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lng}`
          : "";
        if (urlLine) window.open(urlLine, "_blank", "noopener,noreferrer");
      } else if (focusThread.kind === "note") {
        // Use the deep-link the App.tsx focusNoteId effect already understands.
        navigate(`/?focusNoteId=${encodeURIComponent(focusThread.noteId)}`);
        onOpenChange(false);
      }
    } finally {
      setOpeningLocation(false);
    }
  }, [focusThread, onSelectGameOnMap, navigate, onOpenChange]);

  const handleShareGameChat = useCallback(
    async (args: { gameId: string; title: string; sport: string; startsAt: string | null | undefined }) => {
      setShareBusyGameId(args.gameId);
      try {
        const titleLine = args.title?.trim() || "Pickup game";
        const whenLine = args.startsAt
          ? format(new Date(args.startsAt), "MMM d, h:mm a")
          : "See app";
        const coords = await getGameLatLng(args.gameId);
        const urlLine = coords
          ? `https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lng}`
          : "";
        const text = [titleLine, `${args.sport} · ${whenLine}`, urlLine].filter(Boolean).join("\n");
        const shareData: ShareData = { title: titleLine, text, url: urlLine || undefined };
        const canNativeShare =
          typeof navigator.share === "function" &&
          (!navigator.canShare || navigator.canShare(shareData));
        if (canNativeShare) {
          try {
            await navigator.share(shareData);
            return;
          } catch (e) {
            if ((e as Error).name === "AbortError") return;
          }
        }
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          window.prompt("Copy this:", urlLine || text);
        }
      } finally {
        setShareBusyGameId(null);
      }
    },
    [],
  );

  const loadInbox = useCallback(() => {
    setInboxLoading(true);
    fetchMyGameInbox().then(({ data, error }) => {
      setInboxLoading(false);
      if (error) {
        console.warn("[FUN] inbox", error);
        setInbox([]);
        return;
      }
      const rows = (data ?? []).slice().sort((a, b) => {
        const ta = Date.parse(a.last_message_at ?? a.starts_at ?? "") || 0;
        const tb = Date.parse(b.last_message_at ?? b.starts_at ?? "") || 0;
        return tb - ta;
      });
      const filtered = joinedGameIds ? rows.filter((r) => joinedGameIds.has(r.id)) : rows;
      setInbox(filtered);
    });
  }, [joinedGameIds]);

  useEffect(() => {
    if (!open) return;
    if (focusThread) return;
    if (mode !== "groups") return;
    if (inboxBootstrap?.length) {
      setInbox((prev) => {
        if (prev.length > 0) return prev;
        const filtered = joinedGameIds ? inboxBootstrap.filter((r) => joinedGameIds.has(r.id)) : inboxBootstrap;
        return filtered;
      });
    }
    loadInbox();
  }, [open, focusThread, mode, loadInbox, inboxBootstrap, joinedGameIds]);

  /**
   * A lifecycle change elsewhere in the app invalidates the inbox.
   *
   * Unlike the effect above, this deliberately ignores `focusThread` and `mode`:
   * the thread you are looking at is exactly the one whose row went stale when
   * you pressed End on it.
   */
  const seenRefreshKey = useRef(inboxRefreshKey);
  useEffect(() => {
    if (seenRefreshKey.current === inboxRefreshKey) return;
    seenRefreshKey.current = inboxRefreshKey;
    if (!open) return;
    loadInbox();
  }, [inboxRefreshKey, open, loadInbox]);

  const loadDmInbox = useCallback(() => {
    setDmInboxLoading(true);
    fetchMyDmInbox().then(({ data, error }) => {
      setDmInboxLoading(false);
      if (error) {
        console.warn("[FUN] dm inbox", error);
        setDmInbox([]);
        return;
      }
      const rows = (data ?? []).slice().sort((a, b) => {
        const ta = Date.parse(a.last_message_at ?? "") || 0;
        const tb = Date.parse(b.last_message_at ?? "") || 0;
        return tb - ta;
      });
      setDmInbox(rows);
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    if (focusThread) return;
    if (mode !== "direct") return;
    if (dmInboxBootstrap?.length) {
      setDmInbox((prev) => (prev.length > 0 ? prev : dmInboxBootstrap));
    }
    loadDmInbox();
  }, [open, focusThread, mode, loadDmInbox, dmInboxBootstrap]);

  const loadNoteInbox = useCallback(() => {
    setNoteInboxLoading(true);
    void fetchMyNoteInbox().then(({ data, error }) => {
      setNoteInboxLoading(false);
      if (error) {
        console.warn("[FUN] note inbox", error);
        setNoteInbox([]);
        return;
      }
      const rows = (data ?? []).slice().sort((a, b) => {
        const ta = Date.parse(a.last_comment_at ?? a.created_at ?? "") || 0;
        const tb = Date.parse(b.last_comment_at ?? b.created_at ?? "") || 0;
        return tb - ta;
      });
      setNoteInbox(rows);
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    if (focusThread) return;
    if (mode !== "notes") return;
    loadNoteInbox();
  }, [open, focusThread, mode, loadNoteInbox]);

  useEffect(() => {
    if (!open) return;
    if (!focusThread) return;
    if (focusThread.kind === "dm") setMode("direct");
    if (focusThread.kind === "game") setMode("groups");
    if (focusThread.kind === "note") setMode("notes");
  }, [open, focusThread]);

  useEffect(() => {
    if (!open || !focusThread || focusThread.kind !== "game") {
      setMessages([]);
      return;
    }

    let cancelled = false;
    setMessagesLoading(true);
    setHasOlder(false);
    fetchGameMessages(focusThread.gameId).then(({ data, error, hasMore }) => {
      if (cancelled) return;
      setMessagesLoading(false);
      if (error) {
        console.warn("[FUN] messages", error);
        setMessages([]);
        return;
      }
      setMessages(data ?? []);
      setHasOlder(hasMore);
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
  }, [open, focusThread, reloadKey]);

  useEffect(() => {
    if (!open || !focusThread || focusThread.kind !== "dm") {
      setDmMessages([]);
      return;
    }

    let cancelled = false;
    setDmMessagesLoading(true);
    setHasOlder(false);
    fetchDmMessages(focusThread.threadId).then(({ data, error, hasMore }) => {
      if (cancelled) return;
      setDmMessagesLoading(false);
      if (error) {
        console.warn("[FUN] dm messages", error);
        setDmMessages([]);
        return;
      }
      setHasOlder(hasMore);
      setDmMessages(data ?? []);
    });

    const { unsubscribe } = subscribeDmMessages({
      threadId: focusThread.threadId,
      onInsert: (row) => {
        setDmMessages((prev) => {
          if (prev.some((m) => m.id === row.id)) return prev;
          return [...prev, row];
        });
      },
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [open, focusThread, reloadKey]);

  // Note threads: hydrate the post + comments + realtime fan-out for new comments.
  useEffect(() => {
    if (!open || !focusThread || focusThread.kind !== "note") {
      setNoteComments([]);
      setActiveNote(null);
      return;
    }

    let cancelled = false;

    // Use the inbox row first if we have it; otherwise fetch by id.
    const inboxRow = noteInbox.find((r) => r.id === focusThread.noteId);
    const seed: typeof activeNote = inboxRow
      ? {
          id: inboxRow.id,
          body: inboxRow.body,
          visibility: inboxRow.visibility,
          created_at: inboxRow.created_at,
          created_by: inboxRow.created_by,
          place_name: inboxRow.place_name,
          lat: inboxRow.lat,
          lng: inboxRow.lng,
        }
      : focusThread.body
        ? {
            id: focusThread.noteId,
            body: focusThread.body,
            visibility: (focusThread.visibility ?? "public") as MapNoteVisibility,
            created_at: focusThread.createdAt ?? new Date().toISOString(),
            created_by: focusThread.createdBy ?? null,
            place_name: focusThread.placeName ?? null,
            lat: focusThread.lat ?? null,
            lng: focusThread.lng ?? null,
          }
        : null;
    setActiveNote(seed);

    if (!seed) {
      // Need to fetch the note itself.
      void fetchNoteById(focusThread.noteId).then(({ data }) => {
        if (cancelled || !data) return;
        setActiveNote({
          id: data.id,
          body: data.body,
          visibility: data.visibility,
          created_at: data.created_at,
          created_by: data.created_by,
          place_name: data.place_name,
          lat: data.lat,
          lng: data.lng,
        });
      });
    }

    setNoteCommentsLoading(true);
    void fetchNoteComments(focusThread.noteId).then(({ data, error }) => {
      if (cancelled) return;
      setNoteCommentsLoading(false);
      if (error) {
        console.warn("[FUN] note comments", error);
        setNoteComments([]);
        return;
      }
      setNoteComments(data ?? []);
    });

    const unsub = subscribeNoteComments(focusThread.noteId, (row) => {
      setNoteComments((prev) => {
        if (prev.some((c) => c.id === row.id)) return prev;
        return [...prev, row];
      });
    });

    return () => {
      cancelled = true;
      unsub();
    };
    // `noteInbox` intentionally excluded — we only seed once per focus change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, focusThread]);


  /** A new thread starts at the newest message with nothing outstanding. */
  useEffect(() => {
    lastSeenMessageId.current = null;
    setUnseenCount(0);
    setPending([]);
  }, [focusThread]);

  useEffect(() => {
    if (!focusThread) setThreadExpanded(false);
    else setInboxExpanded(false);
    setLeaveThreadError(null);
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
  }, [open, focusThread]);

  useEffect(() => {
    if (!open || !focusThread || focusThread.kind !== "game") {
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
  }, [open, focusThread]);

  /**
   * Who has read the open thread.
   *
   * One RPC on open and one realtime channel while it is open — not one per
   * thread in the inbox. `subscribeThreadReads` listens for `*` rather than
   * INSERT because the first time someone reads a thread is an insert and every
   * time after that is an update; listening for one of the two means "Seen"
   * either never appears or never moves.
   *
   * Map notes are skipped entirely. They have no audience, the RPC returns
   * nothing for them, and `chat_reads` has no peer-read policy for note rows.
   */
  useEffect(() => {
    if (!open || !focusThread || focusThread.kind === "note") {
      setReceipts([]);
      return;
    }
    const kind = focusThread.kind;
    const threadId = kind === "game" ? focusThread.gameId : focusThread.threadId;
    let cancelled = false;
    const load = () => {
      void fetchThreadReadReceipts(kind, threadId).then((rows) => {
        if (!cancelled) setReceipts(rows);
      });
    };
    load();
    const unsub = subscribeThreadReads(threadId, load);
    return () => {
      cancelled = true;
      unsub();
    };
  }, [open, focusThread]);

  /**
   * Put the message on screen, then try to send it.
   *
   * The bubble appears before the round trip and stays there, dimmed, until the
   * row comes back. A failure turns it amber with "tap to retry" rather than
   * dropping the text on the floor, which is what a lost send used to do beyond
   * an error line above the composer.
   *
   * Retry is safe because of the `(user_id, client_id)` unique index: if the
   * first attempt actually landed and only the response was lost, the second
   * raises 23505, which `sendGameMessage` reports as `duplicate` and this treats
   * as success. Re-hydrating afterwards guarantees the confirmed row is on
   * screen even if its realtime event was the thing that went missing.
   *
   * Note comments are sent the old way: `add_note_comment` is an RPC that takes
   * no client id, so there is nothing to reconcile a pending bubble against, and
   * matching on body would mis-merge two identical replies.
   */
  const deliver = useCallback(
    async (body: string, clientId: string) => {
      if (!focusThread) return;

      setPending((prev) => {
        const without = prev.filter((p) => p.clientId !== clientId);
        return [
          ...without,
          { clientId, body, createdAtMs: Date.now(), status: "sending" as const },
        ];
      });
      setSendError(null);

      const fail = (message: string) => {
        setPending((prev) =>
          prev.map((p) => (p.clientId === clientId ? { ...p, status: "failed" as const } : p)),
        );
        setSendError(message);
      };
      const settle = () => setPending((prev) => prev.filter((p) => p.clientId !== clientId));

      if (focusThread.kind === "game") {
        const { data: sent, error, duplicate } = await sendGameMessage(
          focusThread.gameId,
          body,
          clientId,
        );
        if (error) return fail(error.message);
        settle();
        if (sent) {
          setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
        } else if (duplicate) {
          setReloadKey((n) => n + 1);
        }
        loadInbox();
        return;
      }

      if (focusThread.kind === "dm") {
        const { data: sent, error, duplicate } = await sendDmMessage(
          focusThread.threadId,
          body,
          clientId,
        );
        if (error) return fail(error.message);
        settle();
        if (sent) {
          setDmMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
        } else if (duplicate) {
          setReloadKey((n) => n + 1);
        }
        loadDmInbox();
        return;
      }

      const { data: sent, error } = await addNoteComment({
        noteId: focusThread.noteId,
        body,
      });
      if (error) return fail(error.message);
      settle();
      if (sent) {
        setNoteComments((prev) => (prev.some((c) => c.id === sent.id) ? prev : [...prev, sent]));
      }
      loadNoteInbox();
    },
    [focusThread, loadInbox, loadDmInbox, loadNoteInbox],
  );

  const handleSend = async () => {
    if (!focusThread || !draft.trim()) return;
    setSendError(null);
    if (ensureSession && !(await ensureSession())) {
      setSendError("Sign in to send messages.");
      return;
    }
    const body = draft.trim();
    // Clear the composer first. Holding the text hostage until the server
    // answers is what makes a slow connection feel broken.
    setDraft("");
    setSending(true);
    try {
      await deliver(body, newClientId());
    } finally {
      setSending(false);
    }
  };

  const handleRetry = useCallback(
    (message: ChatMessage) => {
      if (!message.clientId) return;
      void deliver(message.body, message.clientId);
    },
    [deliver],
  );

  const handleLeaveChat = async () => {
    if (!focusThread || focusThread.kind !== "game" || !onLeaveThread || leavingThread) return;
    setLeaveThreadError(null);
    setLeavingThread(true);
    try {
      const err = await onLeaveThread(focusThread.gameId);
      if (err) setLeaveThreadError(err.message);
    } finally {
      setLeavingThread(false);
    }
  };

  /**
   * Archive the thread, then step back to the inbox so the user sees it gone.
   *
   * Undo is offered rather than a confirm: archiving is cheap to reverse and a dialog on a
   * harmless action trains people to dismiss dialogs.
   */
  const handleArchiveChat = async (gameId: string) => {
    setLeaveThreadError(null);
    const err = await archiveGameChat(gameId);
    if (err) {
      setLeaveThreadError(err.message);
      return;
    }
    onFocusThreadChange(null);
    loadInbox();
    toast.success("Chat archived", {
      description: "It comes back if anyone posts.",
      action: {
        label: "Undo",
        onClick: () => {
          void unarchiveGameChat(gameId).then((e) => {
            if (e) toast.error("Couldn't restore this chat", { description: e.message });
            else loadInbox();
          });
        },
      },
    });
  };

  const showList = !focusThread;

  const inboxRow =
    focusThread?.kind === "game" ? inbox.find((r) => r.id === focusThread.gameId) : undefined;
  // Schedule, status and duration now come off `threadGame` below — one merged row instead of
  // a field-by-field re-merge at every use site.
  const threadVisibility =
    focusThread?.kind === "game" ? focusThread.visibility ?? inboxRow?.visibility ?? null : null;
  const threadHostId =
    focusThread?.kind === "game" ? focusThread.createdBy ?? inboxRow?.created_by ?? null : null;
  const participantTotal =
    focusThread?.kind === "game"
      ? Math.max(focusThread.participantCount ?? inboxRow?.participant_count ?? 0, chatMembers.length)
      : 0;
  const spotsLeft =
    focusThread?.kind === "game" ? focusThread.spotsRemaining ?? inboxRow?.spots_remaining ?? undefined : undefined;

  // One row for the whole header: the schedule lines and the action bar read the same object,
  // so what the thread says and what its buttons allow can never drift apart.
  const threadGame = useMemo(
    () =>
      focusThread?.kind === "game"
        ? threadGameRow(focusThread, inboxRow ?? null)
        : null,
    [focusThread, inboxRow],
  );

  const threadRole = useMemo(
    () =>
      threadGame
        ? gameViewerRole(threadGame, {
            currentUserId,
            // Being in the thread at all means you are in the game; the inbox only ever
            // returns games you hold a participant row for.
            joinedGameIds: new Set([threadGame.id]),
            nowMs: headerNow,
          })
        : null,
    [threadGame, currentUserId, headerNow],
  );

  const schedule = threadGame
    ? threadScheduleLines(threadGame, headerNow)
    : { timeLine: "", countdownLine: "", ended: false };

  // Resolve every visible chat member into a trust tier so we can badge / collapse / group.
  const trustMembers = useMemo(
    () =>
      chatMembers.map((m) => ({
        userId: m.user_id,
        isHost: m.user_id === threadHostId,
      })),
    [chatMembers, threadHostId],
  );
  const trustByUserId = useChatTrust({
    currentUserId,
    hostUserId: threadHostId,
    members: trustMembers,
  });
  const isPublicChat = threadVisibility === "public";

  // Stranger messages start collapsed in public chats; tap to expand. Reset
  // when switching threads so collapsed state never leaks across games.
  const [revealedMessageIds, setRevealedMessageIds] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    setRevealedMessageIds(new Set());
  }, [focusThread]);
  const revealMessages = useCallback((ids: string[]) => {
    setRevealedMessageIds((prev) => {
      if (ids.every((id) => prev.has(id))) return prev;
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
  }, []);

  const handlePlanRematch = () => {
    if (!focusThread || focusThread.kind !== "game" || !onPlanRematch || !threadGame) return;
    onPlanRematch({
      fromGameId: threadGame.id,
      fromTitle: threadGame.title || "Pickup game",
      sport: threadGame.sport,
      // 4 only when the source game tells us nothing — a rematch for nobody isn't a rematch.
      spotsNeeded: threadGame.spots_needed || 4,
      durationMinutes: threadGame.duration_minutes ?? null,
      visibility: threadGame.visibility ?? null,
      lat: threadGame.lat || null,
      lng: threadGame.lng || null,
      locationLabel: threadGame.location_label ?? null,
    });
  };

  const rosterSummary =
    focusThread?.kind === "game"
      ? membersLoading && participantTotal === 0
        ? "Loading roster…"
        : `${participantTotal} ${participantTotal === 1 ? "player" : "players"}${spotsLeft != null ? ` · ${spotsLeft} spots left` : ""}`
      : "";

  /**
   * The thread's messages, normalised.
   *
   * One list for all three kinds. Which table they came from stops mattering
   * here; what differs downstream is who is named, who is veiled and what sits
   * next to the timestamp, and those are the three functions below.
   */
  const chatMessages = useMemo<ChatMessage[]>(() => {
    const kind = focusThread?.kind;
    const base =
      kind === "dm"
        ? dmMessages.map(dmMessageToChat)
        : kind === "note"
          ? noteComments.map(noteCommentToChat)
          : kind === "game"
            ? messages.map(gameMessageToChat)
            : [];
    if (!kind || pending.length === 0) return base;
    // Pending bubbles always sit at the end: they are the most recent thing you
    // did, whatever the server's clock later says about them.
    return [...base, ...pending.map((p) => pendingToChat(p, currentUserId, kind))];
  }, [focusThread, dmMessages, noteComments, messages, pending, currentUserId]);

  const chatLoading =
    focusThread?.kind === "dm"
      ? dmMessagesLoading
      : focusThread?.kind === "note"
        ? noteCommentsLoading
        : messagesLoading;

  const isNoteThread = focusThread?.kind === "note";

  /** A group thread names its speakers; a 1:1 does not need to. */
  const chatAuthorFor = useCallback(
    (m: ChatMessage) => {
      if (!m.authorId) return null;
      return {
        displayName: nameForUserId(m.authorId),
        avatarUrl: avatarForUserId(m.authorId),
        badge: <TrustBadge trust={trustByUserId.get(m.authorId)} />,
      };
    },
    [nameForUserId, avatarForUserId, trustByUserId],
  );

  /**
   * Strangers in a public game chat start behind one tap.
   *
   * A predicate rather than a rendered veil: `buildChatList` needs to know which
   * messages are hidden *before* it can collapse a consecutive run of them into
   * one, and that decision cannot be made a bubble at a time.
   */
  const chatIsVeiled = useCallback(
    (m: ChatMessage) => {
      if (!isPublicChat || !m.authorId) return false;
      return trustByUserId.get(m.authorId) === "stranger";
    },
    [isPublicChat, trustByUserId],
  );

  /**
   * Fetch the page before the oldest message we hold, and keep the reader's place.
   *
   * Prepending to a scroller moves everything down by the height of what was
   * added, which without correction teleports the reader. Measuring the scroller
   * before and after and adding the difference back leaves the message they were
   * looking at exactly where it was.
   *
   * Note threads are not paginated: their comments come from an RPC with no
   * cursor, so that waits for the inbox migration that recreates it.
   */
  const handleLoadOlder = useCallback(async () => {
    if (!focusThread || loadingOlder) return;
    const scroller = scrollerRef.current;
    const heightBefore = scroller?.scrollHeight ?? 0;
    const topBefore = scroller?.scrollTop ?? 0;
    setLoadingOlder(true);
    try {
      if (focusThread.kind === "game") {
        const oldest = messages[0]?.created_at;
        if (!oldest) return;
        const { data, hasMore } = await fetchGameMessages(focusThread.gameId, { before: oldest });
        const seen = new Set(messages.map((m) => m.id));
        const older = (data ?? []).filter((m) => !seen.has(m.id));
        // The cursor is inclusive, so a page of nothing new means we are at the
        // start of the thread — whatever the server said about there being more.
        if (older.length === 0) setHasOlder(false);
        else {
          setMessages((prev) => [...older, ...prev]);
          setHasOlder(hasMore);
        }
      } else if (focusThread.kind === "dm") {
        const oldest = dmMessages[0]?.created_at;
        if (!oldest) return;
        const { data, hasMore } = await fetchDmMessages(focusThread.threadId, { before: oldest });
        const seen = new Set(dmMessages.map((m) => m.id));
        const older = (data ?? []).filter((m) => !seen.has(m.id));
        if (older.length === 0) setHasOlder(false);
        else {
          setDmMessages((prev) => [...older, ...prev]);
          setHasOlder(hasMore);
        }
      }
    } finally {
      setLoadingOlder(false);
      requestAnimationFrame(() => {
        const el = scrollerRef.current;
        if (!el) return;
        el.scrollTop = topBefore + (el.scrollHeight - heightBefore);
      });
    }
  }, [focusThread, loadingOlder, messages, dmMessages, scrollerRef]);

  /** Only a note comment can be liked. */
  const chatFooterSlotFor = useCallback(
    (m: ChatMessage) => {
      if (!m.noteComment) return null;
      const mine = currentUserId != null && m.authorId === currentUserId;
      return (
        <NoteCommentLikeButton
          comment={m.noteComment}
          className={cn(
            "px-1.5 py-0",
            mine ? "text-violet-50/90 hover:text-rose-200" : "text-slate-400 hover:text-rose-300",
          )}
        />
      );
    },
    [currentUserId],
  );

  /**
   * "Seen" hangs under the last thing *you* said, not under the last thing in the
   * thread — which is what you actually want to know has landed.
   */
  const myLastMessageId = useMemo(() => {
    if (!currentUserId) return null;
    for (let i = chatMessages.length - 1; i >= 0; i -= 1) {
      if (chatMessages[i].authorId === currentUserId) return chatMessages[i].id;
    }
    return null;
  }, [chatMessages, currentUserId]);

  const seenByAfterMine = useMemo(() => {
    if (!myLastMessageId) return [];
    const mine = chatMessages.find((m) => m.id === myLastMessageId);
    if (!mine) return [];
    return receipts.filter((r) => Date.parse(r.last_read_at) >= mine.createdAtMs);
  }, [receipts, myLastMessageId, chatMessages]);

  /**
   * Follow the conversation only if the reader is already following it.
   *
   * The old effect scrolled to the bottom smoothly on every change to any of the
   * three message arrays, which took the thread away from anyone reading history
   * and animated two hundred bubbles past them to do it. Now: land on the newest
   * message when a thread opens, stay pinned while the reader is at the bottom,
   * follow your own sends wherever you are, and otherwise count what arrived and
   * offer to catch up.
   */
  useEffect(() => {
    if (!open || !focusThread) return;
    const last = chatMessages[chatMessages.length - 1];
    if (!last) return;
    if (lastSeenMessageId.current === last.id) return;
    const opening = lastSeenMessageId.current === null;
    lastSeenMessageId.current = last.id;
    const mine = currentUserId != null && last.authorId === currentUserId;
    if (opening || mine || atBottom) {
      // Instant on open: smooth-scrolling a whole thread is the jank.
      scrollToBottom(opening ? "auto" : "smooth");
      setUnseenCount(0);
    } else {
      setUnseenCount((n) => n + 1);
    }
  }, [chatMessages, open, focusThread, currentUserId, atBottom, scrollToBottom]);

  /**
   * Opening a thread reads it, and so does every message that arrives while you
   * are looking at it — but only while the tab is actually in front of someone.
   * `markRead` debounces and the server refuses to move a watermark backwards,
   * so calling it on every new message is cheap.
   */
  const markRead = unread.markRead;
  useEffect(() => {
    if (!open || !focusThread) return;
    if (focusThread.kind === "game") markRead("game", focusThread.gameId);
    else if (focusThread.kind === "note") markRead("note", focusThread.noteId);
    else markRead("dm", focusThread.threadId);
  }, [open, focusThread, markRead, chatMessages.length]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn(
          "h-full p-0 gap-0 sm:max-w-none flex flex-col overflow-hidden",
          glassMessengerPanel("border-l border-cyan-400/15 border-t-0 border-r-0 border-b-0"),
          (threadExpanded && focusThread) || (inboxExpanded && showList)
            ? "!left-0 !right-0 !w-full !max-w-full !rounded-none"
            : "w-[20vw] min-w-[300px] max-w-[420px] rounded-l-2xl",
        )}
        aria-describedby={undefined}
      >
        <SheetHeader className="border-b border-white/[0.08] bg-white/[0.02] px-4 py-3 space-y-0 shrink-0 shadow-[inset_0_-1px_0_rgba(255,255,255,0.04)]">
          {showList ? (
            <div className="flex items-start gap-2 pr-12">
              <div className="min-w-0 flex-1 flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <SheetTitle className="text-left text-base text-white truncate">
                    {mode === "groups"
                      ? "Group chats"
                      : mode === "notes"
                        ? "Map notes"
                        : "Direct messages"}
                  </SheetTitle>
                  <SheetDescription className="text-left text-xs text-slate-500">
                    {mode === "groups"
                      ? inboxExpanded
                        ? "All your groups — tap a card to open the thread."
                        : "Pickups you joined — one thread per game."
                      : mode === "notes"
                        ? "Notes you dropped or replied to — comments live here."
                        : "1:1 conversations — open a profile and tap Message to start."}
                  </SheetDescription>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setMode("groups")}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                        mode === "groups"
                          ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-100"
                          : "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.06]",
                      )}
                    >
                      Groups
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode("direct")}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                        mode === "direct"
                          ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-100"
                          : "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.06]",
                      )}
                    >
                      Direct
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode("notes")}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors inline-flex items-center gap-1",
                        mode === "notes"
                          ? "border-cyan-300/50 bg-cyan-400/15 text-cyan-100"
                          : "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.06]",
                      )}
                      aria-label="Notes — your map note conversations"
                    >
                      <StickyNote className="size-3" />
                      Notes
                    </button>
                  </div>
                </div>
                {mode === "groups" ? (
                  <button
                    type="button"
                    onClick={() => setInboxExpanded((v) => !v)}
                    className="inline-flex size-5 shrink-0 items-center justify-center rounded border border-cyan-500/25 bg-cyan-500/5 text-cyan-400/90 hover:border-cyan-400/45 hover:bg-cyan-500/15 hover:text-cyan-300 transition-colors mt-0.5"
                    aria-label={
                      inboxExpanded
                        ? "Collapse conversation list"
                        : "Expand — full width, all conversations"
                    }
                    title={inboxExpanded ? "Compact list" : "Expand — full width chat with all groups"}
                  >
                    {inboxExpanded ? (
                      <Minimize2 className="size-2.5" />
                    ) : (
                      <Maximize2 className="size-2.5" />
                    )}
                  </button>
                ) : null}
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
                    if (mode === "groups") loadInbox();
                    else if (mode === "direct") loadDmInbox();
                    else if (mode === "notes") loadNoteInbox();
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
                {focusThread?.kind === "game" ? (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        void handleShareGameChat({
                          gameId: focusThread.gameId,
                          title: focusThread.title,
                          sport: focusThread.sport,
                          startsAt: focusThread.startsAt,
                        })
                      }
                      disabled={shareBusyGameId === focusThread.gameId}
                      className="p-2 rounded-full hover:bg-white/10 text-slate-300 shrink-0 disabled:opacity-50 disabled:pointer-events-none"
                      aria-label="Share game"
                      title="Share"
                    >
                      {shareBusyGameId === focusThread.gameId ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Share2 className="w-5 h-5" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleOpenThreadLocation()}
                      disabled={openingLocation}
                      className="p-2 rounded-full hover:bg-white/10 text-slate-300 shrink-0 disabled:opacity-50 disabled:pointer-events-none"
                      aria-label="Open game location"
                      title="Location"
                    >
                      {openingLocation ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <MapPin className="w-5 h-5" />
                      )}
                    </button>
                  </>
                ) : focusThread?.kind === "note" ? (
                  <button
                    type="button"
                    onClick={() => void handleOpenThreadLocation()}
                    disabled={openingLocation}
                    className="p-2 rounded-full hover:bg-white/10 text-slate-300 shrink-0 disabled:opacity-50 disabled:pointer-events-none"
                    aria-label="View note on map"
                    title="View on map"
                  >
                    {openingLocation ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <MapPin className="w-5 h-5" />
                    )}
                  </button>
                ) : null}
                {/* Leave used to live here, offered to hosts too — and `leave_game` refuses
                    hosts, so it could only ever fail. The controls now sit below, gated by the
                    same role helper every other surface uses. */}
              </div>
              {focusThread?.kind === "game" && leaveThreadError ? (
                <p className="text-xs text-amber-400 px-1" role="alert">
                  {leaveThreadError}
                </p>
              ) : null}
              <div className="min-w-0 space-y-1">
                <div className="flex items-start gap-1.5 min-w-0">
                  <SheetTitle className="text-left text-sm font-semibold text-white break-words leading-snug min-w-0 flex-1">
                    {focusThread?.kind === "game"
                      ? focusThread.title || "Game chat"
                      : focusThread?.kind === "dm"
                        ? focusThread.displayName?.trim() || "Direct message"
                        : focusThread?.kind === "note"
                          ? "Map note"
                          : "Message"}
                  </SheetTitle>
                  {focusThread?.kind === "game" ? (
                    <button
                      type="button"
                      onClick={() => setSquadInfoOpen(true)}
                      className="lg:hidden shrink-0 inline-flex size-8 items-center justify-center rounded-md border border-cyan-500/25 bg-cyan-500/5 text-cyan-400/90 hover:border-cyan-400/45 hover:bg-cyan-500/15 hover:text-cyan-300 transition-colors mt-0.5"
                      aria-label="Squad — view all members"
                      title="Squad"
                    >
                      <Info className="size-4" strokeWidth={2} />
                    </button>
                  ) : null}
                </div>
                <div className="space-y-1 text-left" aria-live="polite">
                  {focusThread?.kind === "game" ? (
                    <>
                      <p className="text-xs text-slate-300 leading-snug">{schedule.timeLine}</p>
                      {schedule.countdownLine ? (
                        <p
                          className={cn(
                            "text-xs font-medium tabular-nums",
                            schedule.ended ? "text-amber-300" : "text-cyan-400/95",
                          )}
                        >
                          {schedule.countdownLine}
                        </p>
                      ) : null}
                      {schedule.ended && onPlanRematch ? (
                        <button
                          type="button"
                          onClick={handlePlanRematch}
                          className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-cyan-400/45 bg-cyan-500/15 px-3 py-1 text-[11px] font-semibold text-cyan-100 hover:bg-cyan-500/25 transition-colors"
                          aria-label="Plan a rematch with the same crew"
                        >
                          <span aria-hidden>↻</span>
                          Plan rematch
                        </button>
                      ) : null}
                    </>
                  ) : focusThread?.kind === "note" ? (
                    <p className="text-xs text-slate-300 leading-snug">
                      {(activeNote?.place_name ?? focusThread.placeName)?.trim()
                        ? activeNote?.place_name ?? focusThread.placeName
                        : "Pinned to this location"}
                      {activeNote?.created_at || focusThread.createdAt
                        ? ` · ${formatDistanceToNow(
                            new Date(activeNote?.created_at ?? focusThread.createdAt ?? Date.now()),
                            { addSuffix: true },
                          )}`
                        : ""}
                    </p>
                  ) : (
                    <p className="text-xs text-slate-500 leading-snug">Direct messages</p>
                  )}
                  <p className="text-[11px] text-slate-500 leading-snug">
                    {focusThread?.kind === "game" ? (
                      <>
                        {focusThread.sport}
                        {rosterSummary ? ` · ${rosterSummary}` : ""}
                      </>
                    ) : focusThread?.kind === "note" ? (
                      <>
                        {(activeNote?.visibility ?? focusThread.visibility) === "friends"
                          ? "Friends only"
                          : (activeNote?.visibility ?? focusThread.visibility) === "private"
                            ? "Private"
                            : "Public"}
                        {" · "}
                        {noteComments.length} {noteComments.length === 1 ? "comment" : "comments"}
                      </>
                    ) : null}
                  </p>
                </div>

                {/*
                  Run the game from the thread.

                  Its own row rather than the icon strip above: back / expand / share /
                  location already fill that on a phone. This is the only surface listing
                  every game you are in whatever its date, so it is where a game next week
                  gets started, ended, deleted — or, once it is over, archived.

                  Outside the aria-live block on purpose: the countdown in there reprints
                  every second, and a live region re-announces everything it contains.
                */}
                {threadGame && threadRole ? (
                  <GameActionBar
                    game={threadGame}
                    role={threadRole}
                    density="compact"
                    className="pt-1"
                    onLeave={onLeaveThread ? () => void handleLeaveChat() : undefined}
                    onArchive={(g) => handleArchiveChat(g.id)}
                    onStart={onStartHostedGame}
                    onEnd={onEndHostedGame}
                    onDelete={onDeleteHostedGame}
                    onDeleted={() => onFocusThreadChange(null)}
                  />
                ) : null}
                <SheetDescription className="sr-only">
                  {focusThread?.kind === "game"
                    ? `${focusThread.title}. ${schedule.timeLine}. ${schedule.countdownLine || ""}. ${rosterSummary || ""}`
                    : focusThread?.kind === "dm"
                      ? `Direct messages with ${focusThread.displayName?.trim() || "Player"}`
                      : focusThread?.kind === "note"
                        ? `Map note · ${noteComments.length} comments`
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
            {mode === "groups" ? (
              inboxLoading ? (
                <div className="flex justify-center py-12 text-slate-500">
                  <Loader2 className="w-8 h-8 animate-spin opacity-60" />
                </div>
              ) : inbox.length === 0 ? (
                <p className="text-sm text-slate-500 text-center px-4 py-10 leading-relaxed">
                  Join a game on the map to unlock its chat. Your threads will show up here.
                </p>
              ) : (
                (() => {
                  const partitions = partitionInboxByLifecycle(inbox, headerNow);
                  const renderRow = (row: GameInboxRow, ended: boolean) => {
                    const unreadCount = unread.countFor("game", row.id);
                    const openThread = () => {
                      setThreadExpanded(inboxExpanded);
                      onFocusThreadChange({
                        kind: "game",
                        gameId: row.id,
                        title: row.title,
                        sport: row.sport,
                        startsAt: row.starts_at,
                        endsAt: row.ends_at ?? null,
                        endedAt: row.ended_at ?? null,
                        liveStartedAt: row.live_started_at ?? null,
                        status: row.status,
                        durationMinutes: row.duration_minutes ?? null,
                        participantCount: row.participant_count,
                        spotsRemaining: row.spots_remaining,
                        createdBy: row.created_by ?? null,
                        visibility: row.visibility ?? null,
                        lat: row.lat ?? null,
                        lng: row.lng ?? null,
                        locationLabel: row.location_label ?? null,
                      });
                    };
                    return (
                      <li key={row.id}>
                        <InboxRow
                          unread={unreadCount}
                          onOpen={openThread}
                          ended={ended}
                          label={`${row.title} — open chat`}
                        >
                          <div className="flex justify-between gap-2 items-center">
                            <span className="flex items-center gap-1.5 min-w-0 flex-1">
                              <span className="font-semibold text-slate-100 text-sm truncate">
                                {row.title}
                              </span>
                              {ended ? (
                                <span className="shrink-0 inline-flex items-center rounded-full border border-amber-400/40 bg-amber-500/15 px-1.5 py-[1px] text-[9px] font-semibold uppercase tracking-wide text-amber-200">
                                  Ended
                                </span>
                              ) : null}
                            </span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleShareGameChat({
                                    gameId: row.id,
                                    title: row.title,
                                    sport: row.sport,
                                    startsAt: row.starts_at,
                                  });
                                }}
                                disabled={shareBusyGameId === row.id}
                                className="inline-flex size-7 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.06] hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40 disabled:opacity-50"
                                aria-label="Share game"
                                title="Share"
                              >
                                {shareBusyGameId === row.id ? (
                                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                                ) : (
                                  <Share2 className="size-3.5" aria-hidden />
                                )}
                              </button>
                              {!ended && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onSelectGameOnMap?.(row.id);
                                  }}
                                  className="inline-flex size-7 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.06] hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40"
                                  aria-label="View on map"
                                  title="View on map"
                                >
                                  <MapPin className="size-3.5" aria-hidden />
                                </button>
                              )}
                              <span className="text-[10px] uppercase tracking-wide text-slate-500">
                                {row.starts_at ? format(new Date(row.starts_at), "MMM d") : "—"}
                              </span>
                            </div>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {row.sport}
                            {!ended ? ` · ${row.spots_remaining} spots left` : ""}
                          </p>
                          <p className="text-xs text-slate-400 mt-1.5 line-clamp-2">
                            {row.last_message_body?.trim() ? row.last_message_body : "No messages yet — say hi!"}
                          </p>
                          {row.last_message_at && (
                            <p className="text-[10px] text-slate-600 mt-1">
                              {format(new Date(row.last_message_at), "MMM d, h:mm a")}
                            </p>
                          )}
                        </InboxRow>
                      </li>
                    );
                  };
                  const listClass = inboxExpanded
                    ? "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3"
                    : "space-y-1.5";
                  return (
                    <>
                      <ul className={listClass}>
                        {partitions.active.map((row) => renderRow(row, false))}
                      </ul>
                      {partitions.ended.length > 0 ? (
                        <>
                          <div className="mt-4 mb-2 flex items-center gap-2 px-1">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                              Past games · {partitions.ended.length}
                            </span>
                            <span className="h-px flex-1 bg-white/[0.06]" />
                          </div>
                          <ul className={listClass}>
                            {partitions.ended.map((row) => renderRow(row, true))}
                          </ul>
                        </>
                      ) : null}
                    </>
                  );
                })()
              )
            ) : mode === "notes" ? (
              noteInboxLoading ? (
                <div className="flex justify-center py-12 text-slate-500">
                  <Loader2 className="w-8 h-8 animate-spin opacity-60" />
                </div>
              ) : (() => {
                const myNotes = noteInbox.filter((r) => r.is_author);
                const commentedNotes = noteInbox.filter((r) => !r.is_author);
                const filtered = notesView === "mine" ? myNotes : commentedNotes;
                const renderNoteRow = (row: NoteInboxRow) => {
                    const unreadCount = unread.countFor("note", row.id);
                    const visLabel =
                      row.visibility === "friends"
                        ? "Friends"
                        : row.visibility === "private"
                          ? "Private"
                          : "Public";
                    const openThread = () => {
                      setThreadExpanded(false);
                      onFocusThreadChange({
                        kind: "note",
                        noteId: row.id,
                        body: row.body,
                        visibility: row.visibility,
                        createdAt: row.created_at,
                        createdBy: row.created_by,
                        placeName: row.place_name,
                        lat: row.lat,
                        lng: row.lng,
                      });
                    };
                    const lastLine = row.last_comment_body?.trim()
                      ? row.last_comment_body
                      : row.body?.trim()
                        ? row.body
                        : "Pinned to this location";
                    return (
                      <li key={row.id}>
                        <InboxRow
                          unread={unreadCount}
                          onOpen={openThread}
                          label={`${row.is_author ? "Your note" : "Note"} — open thread`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-500/10 text-cyan-300">
                              <StickyNote className="size-4" aria-hidden />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-semibold text-slate-100 text-sm truncate min-w-0">
                                  {row.is_author ? "Your note" : "Note"}
                                </span>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-wider text-slate-300">
                                    {visLabel}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigate(`/?focusNoteId=${encodeURIComponent(row.id)}`);
                                      onOpenChange(false);
                                    }}
                                    className="inline-flex size-7 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.06] hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40"
                                    aria-label="View note on map"
                                    title="View on map"
                                  >
                                    <MapPin className="size-3.5" aria-hidden />
                                  </button>
                                </div>
                              </div>
                              <p className="text-xs text-slate-400 mt-1 line-clamp-2">{lastLine}</p>
                              <p className="text-[10px] text-slate-600 mt-1">
                                {row.comment_count} {row.comment_count === 1 ? "comment" : "comments"}
                                {row.last_comment_at
                                  ? ` · ${formatDistanceToNow(new Date(row.last_comment_at), { addSuffix: true })}`
                                  : row.created_at
                                    ? ` · ${formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}`
                                    : ""}
                              </p>
                            </div>
                          </div>
                        </InboxRow>
                      </li>
                    );
                  };
                  return (
                    <div className="space-y-3">
                      <div
                        className="relative inline-flex w-full items-center rounded-full border border-white/10 bg-white/[0.03] p-0.5 text-[11px] font-semibold"
                        role="tablist"
                        aria-label="Notes view"
                      >
                        {(["mine", "commented"] as const).map((key) => {
                          const active = notesView === key;
                          const label = key === "mine" ? "My notes" : "Commented in";
                          const count = key === "mine" ? myNotes.length : commentedNotes.length;
                          return (
                            <button
                              key={key}
                              type="button"
                              role="tab"
                              aria-selected={active}
                              onClick={() => setNotesView(key)}
                              className={cn(
                                "relative flex-1 rounded-full px-3 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40",
                                active ? "text-white" : "text-slate-400 hover:text-slate-200",
                              )}
                            >
                              {active ? (
                                <motion.span
                                  layoutId="notes-segment-indicator"
                                  className="absolute inset-0 rounded-full border border-cyan-300/25 bg-cyan-500/15 shadow-[0_0_18px_rgba(34,211,238,0.18)]"
                                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                                />
                              ) : null}
                              <span className="relative z-10 inline-flex items-center gap-1.5">
                                {label}
                                <span
                                  className={cn(
                                    "rounded-full px-1.5 text-[10px] tabular-nums",
                                    active ? "bg-white/20 text-white" : "bg-white/[0.06] text-slate-400",
                                  )}
                                >
                                  {count}
                                </span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      <AnimatePresence mode="wait" initial={false}>
                        <motion.div
                          key={notesView}
                          initial={{ opacity: 0, x: notesView === "mine" ? -16 : 16 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: notesView === "mine" ? 16 : -16 }}
                          transition={{ duration: 0.18, ease: "easeOut" }}
                        >
                          {filtered.length === 0 ? (
                            <p className="text-sm text-slate-500 text-center px-4 py-10 leading-relaxed">
                              {notesView === "mine"
                                ? "Drop a note on the map and your conversation will land here."
                                : "Notes you've commented on will show up here."}
                            </p>
                          ) : (
                            <ul className="space-y-1.5">{filtered.map(renderNoteRow)}</ul>
                          )}
                        </motion.div>
                      </AnimatePresence>
                    </div>
                  );
                })()
            ) : dmInboxLoading ? (
              <div className="flex justify-center py-12 text-slate-500">
                <Loader2 className="w-8 h-8 animate-spin opacity-60" />
              </div>
            ) : dmInbox.length === 0 ? (
              <p className="text-sm text-slate-500 text-center px-4 py-10 leading-relaxed">
                No direct messages yet. Open a profile and tap <span className="text-slate-300">Message</span>.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {dmInbox.map((row) => {
                  const unreadCount = unread.countFor("dm", row.thread_id);
                  const label = row.display_name?.trim() || "Player";
                  const openThread = () => {
                    setThreadExpanded(false);
                    onFocusThreadChange({
                      kind: "dm",
                      threadId: row.thread_id,
                      otherUserId: row.other_user_id,
                      displayName: row.display_name ?? null,
                      avatarUrl: row.avatar_url ?? null,
                    });
                  };
                  return (
                    <li key={row.thread_id}>
                      <InboxRow
                        unread={unreadCount}
                        onOpen={openThread}
                        label={`${label} — open conversation`}
                      >
                        <div className="flex items-start gap-3">
                          <Avatar className="size-10 shrink-0 border border-white/10">
                            {row.avatar_url?.trim() ? (
                              <AvatarImage src={row.avatar_url.trim()} alt="" className="object-cover" />
                            ) : null}
                            <AvatarFallback className="bg-slate-800 text-xs text-slate-200">
                              {label.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-slate-100 text-sm truncate min-w-0">{label}</span>
                              {row.last_message_at ? (
                                <span className="text-[10px] text-slate-600 shrink-0">
                                  {format(new Date(row.last_message_at), "MMM d")}
                                </span>
                              ) : null}
                            </div>
                            <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                              {row.last_message_body?.trim() ? row.last_message_body : "Say hi 👋"}
                            </p>
                          </div>
                        </div>
                      </InboxRow>
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
              {focusThread?.kind === "game" ? (
                <InviteAdminPanel
                  gameId={focusThread.gameId}
                  visibility={focusThread.visibility ?? inboxRow?.visibility ?? null}
                  isHost={
                    currentUserId != null &&
                    (focusThread.createdBy ?? inboxRow?.created_by ?? null) === currentUserId
                  }
                />
              ) : null}
              <div className="relative flex-1 min-h-0">
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_circle_at_20%_0%,rgba(34,211,238,0.12),transparent_45%),radial-gradient(900px_circle_at_85%_35%,rgba(124,58,237,0.14),transparent_52%)]"
                />
                <div
                  ref={scrollerRef}
                  className="relative flex-1 h-full overflow-y-auto px-3 py-2"
                >
                <MessageList
                  messages={chatMessages}
                  loading={chatLoading}
                  currentUserId={currentUserId}
                  header={
                    isNoteThread && (activeNote?.body ?? focusThread.body)?.trim() ? (
                      <NoteThreadHeaderCard
                        body={(activeNote?.body ?? focusThread.body) as string}
                        createdAt={activeNote?.created_at ?? focusThread.createdAt}
                      />
                    ) : null
                  }
                  empty={
                    isNoteThread ? (
                      <p className="text-xs text-slate-500 text-center py-6">
                        Be the first to reply.
                      </p>
                    ) : undefined
                  }
                  footer={
                    /* The post-game loop, at the bottom of the thread where the
                       conversation ends: did it happen, how were they, run it back.
                       Renders nothing until the game is over, and nothing at all
                       without 20260927160000_post_game_loop applied. */
                    focusThread?.kind === "game" && schedule.ended && currentUserId ? (
                      <PostGamePanel
                        gameId={focusThread.gameId}
                        hostId={threadHostId}
                        currentUserId={currentUserId}
                        onPlanRematch={onPlanRematch ? handlePlanRematch : undefined}
                        className="mt-2"
                      />
                    ) : null
                  }
                  authorFor={focusThread?.kind === "game" ? chatAuthorFor : undefined}
                  isVeiled={focusThread?.kind === "game" ? chatIsVeiled : undefined}
                  revealedIds={revealedMessageIds}
                  onReveal={revealMessages}
                  footerSlotFor={isNoteThread ? chatFooterSlotFor : undefined}
                  renderAfter={(m) =>
                    m.id === myLastMessageId && seenByAfterMine.length > 0 ? (
                      <ReadReceipts readers={seenByAfterMine} />
                    ) : null
                  }
                  onOpenAuthor={(uid) => navigate(`/athlete/${uid}`)}
                  onRetry={handleRetry}
                  canLoadOlder={hasOlder && !chatLoading}
                  loadingOlder={loadingOlder}
                  onLoadOlder={() => void handleLoadOlder()}
                  spinnerClassName={isNoteThread ? "w-6 h-6" : "w-8 h-8"}
                  spinnerPadClassName={isNoteThread ? "py-8" : "py-12"}
                  endRef={listEndRef}
                />
                </div>

                {unseenCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      scrollToBottom("smooth");
                      setUnseenCount(0);
                    }}
                    className="absolute bottom-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-[11px] font-bold text-slate-950 shadow-[0_8px_24px_rgba(0,0,0,0.45)] transition-transform hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                    aria-label={`${unseenCount} new ${unseenCount === 1 ? "message" : "messages"} — jump to the newest`}
                  >
                    {unseenCount} new
                    <ChevronDown className="size-3.5" aria-hidden />
                  </button>
                ) : null}
              </div>

              <Composer
                value={draft}
                onChange={setDraft}
                onSend={() => void handleSend()}
                sending={sending}
                error={sendError}
                placeholder={
                  focusThread?.kind === "note"
                    ? "Write a reply…"
                    : focusThread?.kind === "dm"
                      ? "Send a message…"
                      : "Message the squad…"
                }
              />
            </div>

            {threadExpanded && (
              <aside className="hidden lg:flex w-full shrink-0 flex-col border-t border-white/[0.08] bg-white/[0.015] backdrop-blur-2xl lg:w-[min(20rem,34vw)] lg:border-l lg:border-t-0">
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
                    trustByUserId={trustByUserId}
                    groupByTrust={isPublicChat}
                    onOpenProfile={(uid) => navigate(`/athlete/${uid}`)}
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
              trustByUserId={trustByUserId}
              groupByTrust={isPublicChat}
              onOpenProfile={(uid) => navigate(`/athlete/${uid}`)}
            />
          </div>
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}
