import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router";

/**
 * "Back" that goes back.
 *
 * Sub-pages hard-coded where back led — Popular Venues to `/feed`, a player's
 * profile to the map — so arriving from the feed's Similar tab and pressing back
 * dropped you somewhere else, at the top of a page you had scrolled. Popping the
 * history entry returns to the screen you came from, tab and scroll position
 * included (see `ScrollManager`).
 *
 * `fallback` is for the first page of a visit — a shared link, a bookmark — where
 * there is nothing in the app to go back to. React Router keys that entry
 * "default".
 */
export function useGoBack(fallback: string): () => void {
  const navigate = useNavigate();
  const location = useLocation();
  const hasHistory = location.key !== "default";
  return useCallback(() => {
    if (hasHistory) navigate(-1);
    else navigate(fallback, { replace: true });
  }, [hasHistory, navigate, fallback]);
}
