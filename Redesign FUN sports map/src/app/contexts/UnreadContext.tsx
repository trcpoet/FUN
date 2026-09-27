import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "./AuthContext";
import {
  fetchMyUnreadCounts,
  markThreadRead,
  subscribeAllMessages,
  subscribeMyNotifications,
  type ChatThreadKind,
} from "../../lib/chatReads";
import {
  clearUnread,
  getTotalUnreadCount,
  getUnreadCount,
  incrementUnread,
  threadKey,
  UNREAD_UPDATED_EVENT,
} from "../../lib/unreadCounts";

/**
 * Unread state for the whole app, in one place, above everything that reads it.
 *
 * The nav badge could not grow before this. The effect that incremented it lived
 * inside `GameMessengerSheet` behind `if (!open) return`, and the sheet is
 * lazy-mounted — so the one thing a badge exists to tell you, that something
 * arrived while you were not looking, was the one thing it structurally could not
 * do. It also held up to 75 realtime channels open to drive that broken counter.
 *
 * Three channels replace all of them:
 *
 *   * `game_messages`, unfiltered
 *   * `dm_messages`, unfiltered
 *   * `notifications`, filtered to me
 *
 * The first two are unfiltered on purpose. Both tables carry participant-scoped
 * SELECT policies and Realtime evaluates them with the subscriber's own JWT, so
 * an unfiltered subscription delivers exactly the rows fifty filtered ones would
 * have. Note activity takes the notifications route instead — see `chatReads.ts`
 * for why an unfiltered `map_note_comments` subscription would be unsafe.
 *
 * Counts come from `get_my_unread_counts`. If that RPC is not deployed, this
 * falls back to the localStorage counter it replaces, so a backend that has not
 * caught up degrades to the old behaviour rather than to zero.
 */
export type UnreadContextValue = {
  /** Everything unread, for the nav badge. */
  total: number;
  countFor: (kind: ChatThreadKind, threadId: string) => number;
  cappedFor: (kind: ChatThreadKind, threadId: string) => boolean;
  /** Clear a thread locally and move the server watermark. */
  markRead: (kind: ChatThreadKind, threadId: string) => void;
  /** Re-read the counts, e.g. after joining a game. */
  refresh: () => void;
  /** True while the server counter is unavailable and localStorage is in use. */
  usingLocalFallback: boolean;
};

const UnreadContext = createContext<UnreadContextValue | null>(null);

type Entry = { count: number; capped: boolean };

/** How long to sit on a mark-read before sending it. */
const MARK_DEBOUNCE_MS = 1_500;

export function UnreadProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [counts, setCounts] = useState<Map<string, Entry>>(() => new Map());
  const [fallback, setFallback] = useState(false);
  /** Bumped when the localStorage store changes, only while falling back. */
  const [localTick, setLocalTick] = useState(0);

  const refresh = useCallback(() => {
    if (!userId) {
      setCounts(new Map());
      return;
    }
    void fetchMyUnreadCounts().then(({ data, missing }) => {
      setFallback(missing);
      if (missing) return;
      const next = new Map<string, Entry>();
      for (const row of data) {
        next.set(threadKey(row.thread_kind, row.thread_id), {
          count: row.unread_count,
          capped: row.unread_capped,
        });
      }
      setCounts(next);
    });
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /** Local bump, so a badge moves the instant a message lands. */
  const bump = useCallback((key: string) => {
    setCounts((prev) => {
      const next = new Map(prev);
      const entry = next.get(key);
      next.set(key, { count: (entry?.count ?? 0) + 1, capped: entry?.capped ?? false });
      return next;
    });
  }, []);

  // The three always-on channels.
  useEffect(() => {
    if (!userId) return;
    const stopMessages = subscribeAllMessages({
      onGameMessage: (row) => {
        // Your own message is not unread; the DB trigger agrees and advances
        // your watermark, so this only avoids a flash of a wrong number.
        if (row.user_id === userId) return;
        bump(threadKey("game", row.game_id));
        if (fallback) incrementUnread(threadKey("game", row.game_id), 1);
      },
      onDmMessage: (row) => {
        if (row.user_id === userId) return;
        bump(threadKey("dm", row.thread_id));
        if (fallback) incrementUnread(threadKey("dm", row.thread_id), 1);
      },
    });
    // A notification is the only safe signal for note activity, and now that the
    // table is in the publication it is also the signal the bell has been
    // waiting for since it was written.
    const stopNotifications = subscribeMyNotifications(userId, () => refresh());
    return () => {
      stopMessages();
      stopNotifications();
    };
  }, [userId, bump, refresh, fallback]);

  // Only while falling back: follow the localStorage store the old code wrote.
  useEffect(() => {
    if (!fallback) return;
    const handler = () => setLocalTick((n) => n + 1);
    window.addEventListener(UNREAD_UPDATED_EVENT, handler);
    return () => window.removeEventListener(UNREAD_UPDATED_EVENT, handler);
  }, [fallback]);

  /** Pending marks, coalesced per thread. */
  const pending = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const timers = pending.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  const markRead = useCallback(
    (kind: ChatThreadKind, threadId: string) => {
      const key = threadKey(kind, threadId);
      // Clear locally first. Whether the server write lands or not, the reader
      // has read it, and a badge that lingers after you opened a thread is the
      // most annoying way for this to be wrong.
      setCounts((prev) => {
        if (!prev.has(key)) return prev;
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
      clearUnread(key);

      const timers = pending.current;
      const existing = timers.get(key);
      if (existing) clearTimeout(existing);
      timers.set(
        key,
        setTimeout(() => {
          timers.delete(key);
          // A backgrounded tab must not claim to have read anything.
          if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
          void markThreadRead(kind, threadId);
        }, MARK_DEBOUNCE_MS),
      );
    },
    [],
  );

  const value = useMemo<UnreadContextValue>(() => {
    // `localTick` is read so this recomputes when the fallback store changes.
    void localTick;
    const countFor = (kind: ChatThreadKind, threadId: string) =>
      fallback
        ? getUnreadCount(threadKey(kind, threadId))
        : counts.get(threadKey(kind, threadId))?.count ?? 0;
    const cappedFor = (kind: ChatThreadKind, threadId: string) =>
      fallback ? false : counts.get(threadKey(kind, threadId))?.capped ?? false;
    const total = fallback
      ? getTotalUnreadCount()
      : [...counts.values()].reduce((sum, e) => sum + e.count, 0);
    return { total, countFor, cappedFor, markRead, refresh, usingLocalFallback: fallback };
  }, [counts, fallback, localTick, markRead, refresh]);

  return <UnreadContext.Provider value={value}>{children}</UnreadContext.Provider>;
}

/**
 * Unread state. Safe to call outside the provider — it reports zero rather than
 * throwing, so a surface rendered in isolation (a test, a story) still works.
 */
export function useUnread(): UnreadContextValue {
  const ctx = useContext(UnreadContext);
  return (
    ctx ?? {
      total: 0,
      countFor: () => 0,
      cappedFor: () => false,
      markRead: () => {},
      refresh: () => {},
      usingLocalFallback: true,
    }
  );
}
