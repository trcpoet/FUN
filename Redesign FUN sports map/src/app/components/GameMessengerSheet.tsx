import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { ArrowLeft, Info, Loader2, MapPin, Maximize2, Minimize2, Send, Share2, StickyNote, Users } from "lucide-react";
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
  fetchGameChatMembers,
  type GameChatMember,
  fetchGameMessages,
  fetchMyGameInbox,
  sendGameMessage,
  subscribeGameMessages,
} from "../../lib/gameChat";
import { fetchDmMessages, fetchMyDmInbox, sendDmMessage, subscribeDmMessages } from "../../lib/dmChat";
import { badgeText, clearUnread, getUnreadCount, incrementUnread, threadKey } from "../../lib/unreadCounts";
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
import { useChatTrust, type ChatTrust, trustBadgeLabel } from "../../hooks/useChatTrust";

export type GameThreadFocus = {
  kind: "game";
  gameId: string;
  title: string;
  sport: string;
  /** Scheduled start (ISO). From inbox or map when available. */
  startsAt?: string | null;
  /** Scheduled end (`starts_at + duration_minutes`, ISO). */
  endsAt?: string | null;
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
  inviteToken?: string | null;
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
  /** Idle-prefetched rows so the list can paint before network round-trips. */
  inboxBootstrap?: GameInboxRow[] | null;
  dmInboxBootstrap?: DmInboxRow[] | null;
  /** Caller opens CreateGameModal pre-filled from the ended game's metadata. */
  onPlanRematch?: (payload: PlanRematchPayload) => void;
};

/** Decide whether an inbox row should be in the "Past games" section. */
function isInboxRowEnded(row: GameInboxRow, nowMs: number): boolean {
  if (row.status === "completed" || row.status === "cancelled") return true;
  if (row.ends_at) {
    const t = Date.parse(row.ends_at);
    if (!Number.isNaN(t) && t <= nowMs) return true;
  }
  return false;
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

function threadScheduleLines(args: {
  startsAt: string | null;
  endsAt: string | null;
  durationMinutes: number | null;
  createdAt: string | null;
  status: GameInboxRow["status"];
  nowMs: number;
}): { timeLine: string; countdownLine: string; ended: boolean } {
  if (args.startsAt) {
    const d = new Date(args.startsAt);
    const t = d.getTime();
    const timeLine = format(d, "EEE, MMM d · h:mm a");

    const stub: GameRow = {
      id: "",
      title: "",
      sport: "",
      spots_needed: 0,
      starts_at: args.startsAt,
      created_by: null,
      created_at: args.startsAt,
      status: args.status ?? undefined,
      ends_at: args.endsAt ?? undefined,
      duration_minutes: args.durationMinutes ?? undefined,
      distance_km: 0,
      lat: 0,
      lng: 0,
    };

    if (isGameEnded(stub, args.nowMs)) {
      return { timeLine, countdownLine: "Game ended · Plan rematch?", ended: true };
    }
    if (t <= args.nowMs) {
      const ends = getGameEndsAtMs(stub);
      if (ends != null) {
        return {
          timeLine,
          countdownLine: `Live · ${formatUrgentCountdown(ends - args.nowMs)} left`,
          ended: false,
        };
      }
      return { timeLine, countdownLine: "Live", ended: false };
    }
    return {
      timeLine,
      countdownLine: `Starts in ${formatUrgentCountdown(t - args.nowMs)}`,
      ended: false,
    };
  }
  if (args.createdAt) {
    const rem = getCountdownRemainingMs(
      { starts_at: null, created_at: args.createdAt } as GameRow,
      args.nowMs
    );
    const timeLine = "No set time";
    if (rem == null) return { timeLine, countdownLine: "No longer on map", ended: true };
    return { timeLine, countdownLine: `${formatUrgentCountdown(rem)} left on map`, ended: false };
  }
  return { timeLine: "Set time", countdownLine: "", ended: false };
}

function TrustBadge({ trust }: { trust: ChatTrust | undefined }) {
  const label = trustBadgeLabel(trust);
  if (!label) return null;
  if (trust === "self") return null;
  const tone = (() => {
    switch (trust) {
      case "stranger":
        return "border-slate-500/40 bg-slate-700/30 text-slate-300";
      case "host":
        return "border-amber-400/40 bg-amber-500/15 text-amber-200";
      case "friend":
      case "mutual":
        return "border-emerald-400/40 bg-emerald-500/15 text-emerald-200";
      default:
        return "border-white/10 bg-white/5 text-slate-300";
    }
  })();
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-1.5 py-[1px] text-[9px] font-semibold uppercase tracking-wide",
        tone,
      )}
      aria-label={label}
      title={label}
    >
      {label}
    </span>
  );
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
  inboxBootstrap = null,
  dmInboxBootstrap = null,
  onPlanRematch,
}: GameMessengerSheetProps) {
  const navigate = useNavigate();
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
  const [unreadTick, setUnreadTick] = useState(0);

  const bumpUnreadTick = useCallback(() => setUnreadTick((n) => n + 1), []);

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
  }, [open, focusThread]);

  useEffect(() => {
    if (!open || !focusThread || focusThread.kind !== "dm") {
      setDmMessages([]);
      return;
    }

    let cancelled = false;
    setDmMessagesLoading(true);
    fetchDmMessages(focusThread.threadId).then(({ data, error }) => {
      if (cancelled) return;
      setDmMessagesLoading(false);
      if (error) {
        console.warn("[FUN] dm messages", error);
        setDmMessages([]);
        return;
      }
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
  }, [open, focusThread]);

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

  // While the sheet is open, listen for new messages in other threads to keep unread badges live.
  useEffect(() => {
    if (!open) return;

    const unsubs: Array<() => void> = [];

    // Groups: subscribe to joined game threads shown in inbox (cap to keep channels reasonable).
    const gameIds = inbox.slice(0, 25).map((r) => r.id);
    for (const gid of gameIds) {
      const unsub = subscribeGameMessages(gid, (row) => {
        const isActive = focusThread?.kind === "game" && focusThread.gameId === gid;
        if (isActive) return;
        incrementUnread(threadKey("game", gid), 1);
        bumpUnreadTick();
      });
      unsubs.push(unsub);
    }

    // DMs: subscribe to visible DM threads (cap). Skip the focused DM — the effect above already subscribes
    // with the same channel topic (`dm_messages:${tid}`); a second subscribe throws in Supabase Realtime.
    const dmThreadIds = dmInbox.slice(0, 25).map((r) => r.thread_id);
    for (const tid of dmThreadIds) {
      if (focusThread?.kind === "dm" && focusThread.threadId === tid) continue;
      const { unsubscribe } = subscribeDmMessages({
        threadId: tid,
        onInsert: () => {
          const isActive = focusThread?.kind === "dm" && focusThread.threadId === tid;
          if (isActive) return;
          incrementUnread(threadKey("dm", tid), 1);
          bumpUnreadTick();
        },
      });
      unsubs.push(unsubscribe);
    }

    // Notes: subscribe to inbox rows so unread bumps when someone replies.
    const noteIds = noteInbox.slice(0, 25).map((r) => r.id);
    for (const nid of noteIds) {
      if (focusThread?.kind === "note" && focusThread.noteId === nid) continue;
      const unsub = subscribeNoteComments(nid, () => {
        const isActive = focusThread?.kind === "note" && focusThread.noteId === nid;
        if (isActive) return;
        incrementUnread(threadKey("note", nid), 1);
        bumpUnreadTick();
      });
      unsubs.push(unsub);
    }

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [open, inbox, dmInbox, noteInbox, focusThread, bumpUnreadTick]);

  useEffect(() => {
    if (!open || !focusThread) return;
    listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, dmMessages, noteComments, open, focusThread]);

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

  const handleSend = async () => {
    if (!focusThread || !draft.trim()) return;
    setSendError(null);
    if (ensureSession && !(await ensureSession())) {
      setSendError("Sign in to send messages.");
      return;
    }

    setSending(true);
    if (focusThread.kind === "game") {
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
    } else if (focusThread.kind === "note") {
      const { data: sent, error } = await addNoteComment({ noteId: focusThread.noteId, body: draft });
      setSending(false);
      if (error) {
        setSendError(error.message);
        return;
      }
      setDraft("");
      if (sent) {
        setNoteComments((prev) => (prev.some((c) => c.id === sent.id) ? prev : [...prev, sent]));
      }
      loadNoteInbox();
    } else {
      const { data: sent, error } = await sendDmMessage(focusThread.threadId, draft);
      setSending(false);
      if (error) {
        setSendError(error.message);
        return;
      }
      setDraft("");
      if (sent) {
        setDmMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
      }
      loadDmInbox();
    }
  };

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

  const showList = !focusThread;

  const inboxRow =
    focusThread?.kind === "game" ? inbox.find((r) => r.id === focusThread.gameId) : undefined;
  const threadStartsAt =
    focusThread?.kind === "game" ? focusThread.startsAt ?? inboxRow?.starts_at ?? null : null;
  const threadEndsAt =
    focusThread?.kind === "game" ? focusThread.endsAt ?? inboxRow?.ends_at ?? null : null;
  const threadDurationMinutes =
    focusThread?.kind === "game"
      ? focusThread.durationMinutes ?? inboxRow?.duration_minutes ?? null
      : null;
  const threadStatus = focusThread?.kind === "game" ? inboxRow?.status ?? undefined : undefined;
  const threadCreatedAt = focusThread?.kind === "game" ? focusThread.createdAt ?? null : null;
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

  const schedule =
    focusThread?.kind === "game"
      ? threadScheduleLines({
          startsAt: threadStartsAt,
          endsAt: threadEndsAt,
          durationMinutes: threadDurationMinutes,
          createdAt: threadCreatedAt,
          status: threadStatus,
          nowMs: headerNow,
        })
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
  const revealMessage = useCallback((id: string) => {
    setRevealedMessageIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const handlePlanRematch = () => {
    if (!focusThread || focusThread.kind !== "game" || !onPlanRematch) return;
    onPlanRematch({
      fromGameId: focusThread.gameId,
      fromTitle: focusThread.title || "Pickup game",
      sport: focusThread.sport,
      spotsNeeded: focusThread.spotsRemaining != null && focusThread.participantCount != null
        ? focusThread.spotsRemaining + focusThread.participantCount
        : inboxRow?.participant_count != null && inboxRow?.spots_remaining != null
          ? inboxRow.participant_count + inboxRow.spots_remaining
          : 4,
      durationMinutes: threadDurationMinutes,
      visibility: threadVisibility,
      lat: focusThread.lat ?? inboxRow?.lat ?? null,
      lng: focusThread.lng ?? inboxRow?.lng ?? null,
      locationLabel: focusThread.locationLabel ?? inboxRow?.location_label ?? null,
    });
  };

  const rosterSummary =
    focusThread?.kind === "game"
      ? membersLoading && participantTotal === 0
        ? "Loading roster…"
        : `${participantTotal} ${participantTotal === 1 ? "player" : "players"}${spotsLeft != null ? ` · ${spotsLeft} spots left` : ""}`
      : "";

  // Mark thread read when opened.
  useEffect(() => {
    if (!open || !focusThread) return;
    if (focusThread.kind === "game") {
      clearUnread(threadKey("game", focusThread.gameId));
      bumpUnreadTick();
    } else if (focusThread.kind === "note") {
      clearUnread(threadKey("note", focusThread.noteId));
      bumpUnreadTick();
    } else {
      clearUnread(threadKey("dm", focusThread.threadId));
      bumpUnreadTick();
    }
  }, [open, focusThread, bumpUnreadTick]);

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
                {focusThread?.kind === "game" && onLeaveThread && (
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
                    void unreadTick;
                    const unread = getUnreadCount(threadKey("game", row.id));
                    const badge = badgeText(unread);
                    const openThread = () => {
                      setThreadExpanded(inboxExpanded);
                      onFocusThreadChange({
                        kind: "game",
                        gameId: row.id,
                        title: row.title,
                        sport: row.sport,
                        startsAt: row.starts_at,
                        endsAt: row.ends_at ?? null,
                        durationMinutes: row.duration_minutes ?? null,
                        participantCount: row.participant_count,
                        spotsRemaining: row.spots_remaining,
                        createdBy: row.created_by ?? null,
                        visibility: row.visibility ?? null,
                        inviteToken: row.invite_token ?? null,
                        lat: row.lat ?? null,
                        lng: row.lng ?? null,
                        locationLabel: row.location_label ?? null,
                      });
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
                          className={cn(
                            "relative min-w-0 cursor-pointer rounded-xl border px-3 py-3 text-left outline-none transition-colors",
                            ended
                              ? "border-white/[0.05] bg-white/[0.015] hover:bg-white/[0.04] opacity-90"
                              : "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.055]",
                            "shadow-[0_0_0_1px_rgba(34,211,238,0.06),0_10px_28px_rgba(0,0,0,0.28)]",
                            "hover:border-cyan-300/20",
                            "focus-visible:ring-2 focus-visible:ring-cyan-500/40",
                          )}
                        >
                          {badge ? (
                            <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-extrabold tabular-nums text-white shadow ring-2 ring-[#0b1020]">
                              {badge}
                            </span>
                          ) : null}
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
                        </div>
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
              ) : noteInbox.length === 0 ? (
                <p className="text-sm text-slate-500 text-center px-4 py-10 leading-relaxed">
                  Drop a note on the map and your conversation will land here.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {noteInbox.map((row) => {
                    void unreadTick;
                    const unread = getUnreadCount(threadKey("note", row.id));
                    const badge = badgeText(unread);
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
                          className={cn(
                            "relative min-w-0 cursor-pointer rounded-xl border px-3 py-3 text-left outline-none transition-colors",
                            "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.055]",
                            "shadow-[0_0_0_1px_rgba(34,211,238,0.06),0_10px_28px_rgba(0,0,0,0.28)]",
                            "hover:border-cyan-300/20",
                            "focus-visible:ring-2 focus-visible:ring-cyan-500/40",
                          )}
                        >
                          {badge ? (
                            <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-extrabold tabular-nums text-white shadow ring-2 ring-[#0b1020]">
                              {badge}
                            </span>
                          ) : null}
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
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )
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
                  void unreadTick;
                  const unread = getUnreadCount(threadKey("dm", row.thread_id));
                  const badge = badgeText(unread);
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
                        className={cn(
                          "relative min-w-0 cursor-pointer rounded-xl border px-3 py-3 text-left outline-none transition-colors",
                          "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.055]",
                          "shadow-[0_0_0_1px_rgba(34,211,238,0.06),0_10px_28px_rgba(0,0,0,0.28)]",
                          "hover:border-cyan-300/20",
                          "focus-visible:ring-2 focus-visible:ring-cyan-500/40",
                        )}
                      >
                        {badge ? (
                          <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-extrabold tabular-nums text-white shadow ring-2 ring-[#0b1020]">
                            {badge}
                          </span>
                        ) : null}
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
              {focusThread?.kind === "game" ? (
                <InviteAdminPanel
                  gameId={focusThread.gameId}
                  visibility={focusThread.visibility ?? inboxRow?.visibility ?? null}
                  inviteToken={focusThread.inviteToken ?? inboxRow?.invite_token ?? null}
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
                <div className="relative flex-1 overflow-y-auto px-3 py-2 space-y-2">
                {focusThread?.kind === "dm" ? (
                  dmMessagesLoading ? (
                    <div className="flex justify-center py-12 text-slate-500">
                      <Loader2 className="w-8 h-8 animate-spin opacity-60" />
                    </div>
                  ) : (
                    dmMessages.map((m) => {
                      const mine = currentUserId != null && m.user_id === currentUserId;
                      return (
                        <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                          <div
                            className={cn(
                              "max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed border shadow-[0_10px_26px_rgba(0,0,0,0.25)]",
                              mine
                                ? "bg-gradient-to-b from-violet-500/85 via-violet-600/75 to-fuchsia-600/70 text-white border-white/10 rounded-br-md"
                                : "bg-white/[0.06] text-slate-200 border-white/10 rounded-bl-md",
                            )}
                          >
                            <p className="whitespace-pre-wrap break-words">{m.body}</p>
                            <p className={cn("text-[10px] mt-1 opacity-70", mine ? "text-violet-50/90" : "text-slate-400/80")}>
                              {format(new Date(m.created_at), "h:mm a")}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )
                ) : focusThread?.kind === "note" ? (
                  <>
                    {/* Pinned post bubble — the note body itself. */}
                    {(activeNote?.body ?? focusThread.body)?.trim() ? (
                      <div className="flex justify-start">
                        <div className="max-w-[92%] rounded-2xl border border-cyan-400/25 bg-cyan-500/[0.07] px-3 py-2 shadow-[0_10px_26px_rgba(0,0,0,0.25)]">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-300/80 mb-1">
                            Note
                          </p>
                          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-100">
                            {activeNote?.body ?? focusThread.body}
                          </p>
                          <p className="text-[10px] mt-1 text-slate-500">
                            {(activeNote?.created_at ?? focusThread.createdAt)
                              ? format(
                                  new Date(activeNote?.created_at ?? focusThread.createdAt!),
                                  "MMM d · h:mm a",
                                )
                              : ""}
                          </p>
                        </div>
                      </div>
                    ) : null}
                    {noteCommentsLoading ? (
                      <div className="flex justify-center py-8 text-slate-500">
                        <Loader2 className="w-6 h-6 animate-spin opacity-60" />
                      </div>
                    ) : noteComments.length === 0 ? (
                      <p className="text-xs text-slate-500 text-center py-6">
                        Be the first to reply.
                      </p>
                    ) : (
                      noteComments.map((c) => {
                        const mine = currentUserId != null && c.user_id === currentUserId;
                        return (
                          <div key={c.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                            <div
                              className={cn(
                                "max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed border shadow-[0_10px_26px_rgba(0,0,0,0.25)]",
                                mine
                                  ? "bg-gradient-to-b from-violet-500/85 via-violet-600/75 to-fuchsia-600/70 text-white border-white/10 rounded-br-md"
                                  : "bg-white/[0.06] text-slate-200 border-white/10 rounded-bl-md",
                              )}
                            >
                              <p className="whitespace-pre-wrap break-words">{c.body}</p>
                              <p
                                className={cn(
                                  "text-[10px] mt-1 opacity-70",
                                  mine ? "text-violet-50/90" : "text-slate-400/80",
                                )}
                              >
                                {format(new Date(c.created_at), "h:mm a")}
                              </p>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </>
                ) : messagesLoading ? (
                  <div className="flex justify-center py-12 text-slate-500">
                    <Loader2 className="w-8 h-8 animate-spin opacity-60" />
                  </div>
                ) : (
                  messages.map((m) => {
                    const mine = currentUserId != null && m.user_id === currentUserId;
                    const senderLabel = nameForUserId(m.user_id);
                    const senderAvatarUrl = avatarForUserId(m.user_id);
                    const senderTrust = trustByUserId.get(m.user_id);
                    const isStranger = !mine && senderTrust === "stranger";
                    const collapsedByDefault = isPublicChat && isStranger;
                    const revealed = revealedMessageIds.has(m.id);
                    const showCollapsed = collapsedByDefault && !revealed;
                    return (
                      <div
                        key={m.id}
                        className={cn("flex", mine ? "justify-end" : "justify-start")}
                      >
                        <div
                          className={cn(
                            "max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed border shadow-[0_10px_26px_rgba(0,0,0,0.25)]",
                            mine
                              ? "bg-gradient-to-b from-violet-500/85 via-violet-600/75 to-fuchsia-600/70 text-white border-white/10 rounded-br-md"
                              : showCollapsed
                                ? "bg-slate-800/40 text-slate-400 border-slate-700/60 rounded-bl-md"
                                : "bg-white/[0.06] text-slate-200 border-white/10 rounded-bl-md",
                          )}
                        >
                          {!mine && (
                            <div className="mb-1 flex items-center gap-2">
                              <Avatar className="size-6 shrink-0 overflow-hidden rounded-full border border-white/10">
                                {senderAvatarUrl ? (
                                  <AvatarImage src={senderAvatarUrl} alt="" className="object-cover" />
                                ) : null}
                                <AvatarFallback className="bg-slate-800 text-[10px] font-semibold text-slate-200">
                                  {senderLabel.slice(0, 2).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <button
                                type="button"
                                onClick={() => navigate(`/athlete/${m.user_id}`)}
                                className="text-[10px] font-semibold text-cyan-300/90 hover:text-cyan-200 transition-colors"
                                aria-label={`Open ${senderLabel}'s profile`}
                                title="Open profile"
                              >
                                {senderLabel}
                              </button>
                              <TrustBadge trust={senderTrust} />
                            </div>
                          )}
                          {showCollapsed ? (
                            <button
                              type="button"
                              onClick={() => revealMessage(m.id)}
                              className="text-left text-xs text-slate-300 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40"
                              aria-label="Reveal message from a stranger"
                            >
                              Stranger sent a message — tap to read
                            </button>
                          ) : (
                            <p className="whitespace-pre-wrap break-words">{m.body}</p>
                          )}
                          <p
                            className={cn(
                              "text-[10px] mt-1 opacity-70",
                              mine ? "text-violet-50/90" : "text-slate-400/80",
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
              </div>

              <div className="border-t border-white/[0.08] p-3 shrink-0 bg-white/[0.02] backdrop-blur-2xl shadow-[0_-18px_40px_rgba(0,0,0,0.45)]">
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
                    placeholder={
                      focusThread?.kind === "note"
                        ? "Write a reply…"
                        : focusThread?.kind === "dm"
                          ? "Send a message…"
                          : "Message the squad…"
                    }
                    rows={2}
                    className="flex-1 resize-none rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                  />
                  <button
                    type="button"
                    disabled={sending || !draft.trim()}
                    onClick={() => void handleSend()}
                    className={cn(
                      "shrink-0 h-11 w-11 rounded-xl text-white flex items-center justify-center transition-colors",
                      "border border-white/10",
                      "bg-gradient-to-b from-violet-500/95 to-fuchsia-600/85 hover:from-violet-400 hover:to-fuchsia-500",
                      "shadow-[0_12px_30px_rgba(124,58,237,0.22)]",
                      "disabled:opacity-40 disabled:pointer-events-none",
                    )}
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
