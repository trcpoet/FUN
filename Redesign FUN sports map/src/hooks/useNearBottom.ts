import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Whether the reader is at the bottom of a scroller, and a way to put them there.
 *
 * A chat that scrolls to the bottom on every incoming message takes the thread
 * away from anyone reading history — which is what the messenger did, and it did
 * it with `behavior: "smooth"`, so a busy thread animated out from under you. The
 * rule every messenger uses instead: follow the conversation only if the reader
 * is already following it, and otherwise offer to catch up.
 *
 * `atBottom` starts true so a freshly-opened thread lands at the newest message.
 */
export type NearBottom = {
  ref: React.RefObject<HTMLDivElement | null>;
  atBottom: boolean;
  /** Jump to the newest message. Instant by default — see below. */
  scrollToBottom: (behavior?: ScrollBehavior) => void;
};

/** How far from the bottom still counts as "following along", in pixels. */
const THRESHOLD_PX = 120;

export function useNearBottom(): NearBottom {
  const ref = useRef<HTMLDivElement | null>(null);
  const [atBottom, setAtBottom] = useState(true);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    setAtBottom(distance <= THRESHOLD_PX);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.addEventListener("scroll", measure, { passive: true });
    measure();
    return () => el.removeEventListener("scroll", measure);
  }, [measure]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const el = ref.current;
    if (!el) return;
    // Setting scrollTop rather than scrollIntoView: smooth-scrolling two hundred
    // variable-height bubbles is the jank, and the element we would scroll into
    // view may not have been laid out yet on the frame a thread opens.
    if (behavior === "smooth") el.scrollTo({ top: el.scrollHeight, behavior });
    else el.scrollTop = el.scrollHeight;
    setAtBottom(true);
  }, []);

  return { ref, atBottom, scrollToBottom };
}
