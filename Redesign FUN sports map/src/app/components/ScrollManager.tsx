import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router";

/** Where each history entry was scrolled to, by React Router's per-entry key. */
const positions = new Map<string, number>();

/** How long a restore keeps waiting for the page to grow tall enough to reach its target. */
const RESTORE_WINDOW_MS = 1500;

/**
 * Scroll like a website, not like one long page.
 *
 * The app scrolls the window, and nothing reset it between routes: tapping a player
 * deep in the feed opened their profile already scrolled down, and pressing back
 * landed at the top of the feed instead of the card you had tapped. The browser's
 * own restoration cannot help — it fires before a lazy route has rendered.
 *
 * - A new page (push or replace to another pathname) starts at the top.
 * - Back and forward return to where that entry was, waiting briefly for content
 *   that is still arriving, and giving up the moment the person scrolls themselves.
 * - A change within the same page (a tab in `?tab=`, `?settings=1`) leaves scroll
 *   alone; the page decides.
 */
export function ScrollManager() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const lastPathname = useRef<string | null>(null);

  useEffect(() => {
    if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
  }, []);

  // Record this entry's position as it scrolls. A layout effect, so the listener is
  // detached in the same commit that swaps the page: a scroll event caused by the
  // next page being shorter must not be written down against this entry.
  useLayoutEffect(() => {
    const key = location.key;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        positions.set(key, window.scrollY);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [location.key]);

  useLayoutEffect(() => {
    const samePage = lastPathname.current === location.pathname;
    lastPathname.current = location.pathname;

    if (navigationType !== "POP") {
      if (!samePage) window.scrollTo(0, 0);
      return;
    }

    const target = positions.get(location.key) ?? 0;
    window.scrollTo(0, target);
    if (target === 0 || Math.abs(window.scrollY - target) < 2) return;

    // The page is not tall enough yet — its rows are still loading. Keep trying
    // until it is, unless the person takes over.
    const startedAt = performance.now();
    let frame = 0;
    const stop = () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchstart", stop);
      window.removeEventListener("keydown", stop);
    };
    const step = () => {
      window.scrollTo(0, target);
      if (Math.abs(window.scrollY - target) < 2 || performance.now() - startedAt > RESTORE_WINDOW_MS) {
        stop();
        return;
      }
      frame = requestAnimationFrame(step);
    };
    window.addEventListener("wheel", stop, { passive: true });
    window.addEventListener("touchstart", stop, { passive: true });
    window.addEventListener("keydown", stop);
    frame = requestAnimationFrame(step);
    return stop;
  }, [location.key, location.pathname, navigationType]);

  return null;
}
