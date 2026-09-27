import type { ChatMessage } from "./messageTypes";

/**
 * Turn a flat list of messages into the list a messenger actually draws.
 *
 * Every grouping bug in a chat app is a neighbour-comparison bug: the avatar on
 * the wrong bubble of a run, a date separator that repeats, four veils where one
 * belongs. Comparing neighbours inside a `.map()` in JSX puts that logic where it
 * cannot be tested and where each of the four bubble copies got it slightly
 * differently. So it happens here, once, over a plain array.
 *
 * The output is deliberately flat rather than nested runs: React reconciles a flat
 * list with stable keys far better, and a run that spans a "new messages" boundary
 * or an inline panel does not need to be split open again.
 */
export type ChatListItem =
  | { kind: "day"; key: string; atMs: number }
  | { kind: "gap"; key: string; atMs: number }
  | {
      kind: "message";
      key: string;
      message: ChatMessage;
      mine: boolean;
      /** First bubble of a run — gets the spacer above. */
      runStart: boolean;
      /** Last bubble of a run — gets the avatar and the timestamp. */
      runEnd: boolean;
    }
  | {
      kind: "veiledRun";
      key: string;
      messages: ChatMessage[];
      authorId: string | null;
    };

export type BuildChatListOptions = {
  currentUserId: string | null;
  /**
   * True for a message that should sit behind one tap — a stranger in a public
   * game chat. Never consulted for your own messages.
   */
  isVeiled?: (message: ChatMessage) => boolean;
  /** Ids the reader has already opened; a revealed message leaves its run. */
  revealedIds?: ReadonlySet<string>;
  /** Same author within this window groups into one run. Default 5 minutes. */
  groupWindowMs?: number;
  /** A silence longer than this gets a centred time marker. Default 1 hour. */
  gapMs?: number;
  /** Local-day bucket. Injected so tests do not depend on the runner's zone. */
  dayKeyOf?: (atMs: number) => string;
};

const FIVE_MINUTES = 5 * 60_000;
const ONE_HOUR = 60 * 60_000;

function localDayKey(atMs: number): string {
  const d = new Date(atMs);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function buildChatList(
  messages: readonly ChatMessage[],
  opts: BuildChatListOptions,
): ChatListItem[] {
  const {
    currentUserId,
    isVeiled,
    revealedIds,
    groupWindowMs = FIVE_MINUTES,
    gapMs = ONE_HOUR,
    dayKeyOf = localDayKey,
  } = opts;

  const out: ChatListItem[] = [];
  let prevDayKey: string | null = null;
  let prevMs: number | null = null;
  let prevAuthorId: string | null | undefined;
  /** Index in `out` of the bubble currently ending an open run, if any. */
  let openRunAt: number | null = null;
  /** The veil currently accepting more messages, if any. */
  let openVeil: Extract<ChatListItem, { kind: "veiledRun" }> | null = null;

  for (const message of messages) {
    // An unparseable timestamp must not silently sort to 1970 and drag a day
    // separator with it; fall back to the previous message's instant.
    const atMs: number = Number.isFinite(message.createdAtMs)
      ? message.createdAtMs
      : prevMs ?? 0;
    const dayKey = dayKeyOf(atMs);

    let broke = false;
    if (dayKey !== prevDayKey) {
      out.push({ kind: "day", key: `day-${dayKey}`, atMs });
      broke = true;
    } else if (prevMs != null && atMs - prevMs > gapMs) {
      // Only within a day: a date separator already tells you it is tomorrow,
      // and printing both reads as two separators for one silence.
      out.push({ kind: "gap", key: `gap-${message.id}`, atMs });
      broke = true;
    }
    if (broke) {
      openRunAt = null;
      openVeil = null;
    }

    const mine = currentUserId != null && message.authorId === currentUserId;
    const veiled =
      !mine &&
      (isVeiled?.(message) ?? false) &&
      !(revealedIds?.has(message.id) ?? false);

    if (veiled) {
      // One veil for a run, not one per message. A stranger who sends four lines
      // is one thing to decide about, and four identical "tap to read" buttons
      // read as a broken list.
      if (openVeil && openVeil.authorId === message.authorId) {
        openVeil.messages.push(message);
      } else {
        openVeil = {
          kind: "veiledRun",
          key: `veil-${message.id}`,
          messages: [message],
          authorId: message.authorId,
        };
        out.push(openVeil);
      }
      openRunAt = null;
    } else {
      openVeil = null;
      const continues =
        openRunAt != null &&
        prevAuthorId === message.authorId &&
        prevMs != null &&
        atMs - prevMs <= groupWindowMs;
      if (continues && openRunAt != null) {
        // The run grew, so the bubble that was last no longer is — and the
        // avatar and timestamp ride on the last one.
        const previous = out[openRunAt] as Extract<ChatListItem, { kind: "message" }>;
        previous.runEnd = false;
      }
      out.push({
        kind: "message",
        key: message.id,
        message,
        mine,
        runStart: !continues,
        runEnd: true,
      });
      openRunAt = out.length - 1;
    }

    prevDayKey = dayKey;
    prevMs = atMs;
    prevAuthorId = message.authorId;
  }

  return out;
}
