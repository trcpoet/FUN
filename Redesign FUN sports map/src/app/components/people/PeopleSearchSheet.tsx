import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Loader2, MapPin, Search, X } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "../ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { browsePeople } from "../../../lib/searchPeople";
import type { ProfileSearchRow } from "../../../lib/supabase";
import { cn } from "../ui/utils";

/**
 * Everyone you could play with.
 *
 * The feed's search button used to be inert — a button with no handler. It now
 * opens this, and it opens on the full list rather than an empty box waiting
 * for a query: "who else is here" is the question a new player actually has,
 * and making them guess a name first answers a question nobody asked.
 *
 * Typing narrows the same list through the same RPC, so the rules about who
 * appears at all — not anonymous, confirmed account, never yourself — are the
 * server's and cannot drift from the browse case.
 *
 * Members only by construction: the feed is behind `RequireMember`, so anyone
 * who can press the button already has an account. That is why there is no
 * guest branch here — a guest never reaches it.
 */
export type PeopleSearchSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Ranks nearby players first when known. */
  viewerCoords?: { lat: number; lng: number } | null;
  /** Never list yourself. */
  currentUserId: string | null;
};

/** How long to wait after a keystroke before asking the server. */
const DEBOUNCE_MS = 250;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "P";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function distanceLabel(km: number | null): string | null {
  if (km == null || !Number.isFinite(km)) return null;
  if (km < 1) return `${Math.max(1, Math.round(km * 1000))} m away`;
  if (km < 10) return `${km.toFixed(1)} km away`;
  return `${Math.round(km)} km away`;
}

export function PeopleSearchSheet({
  open,
  onOpenChange,
  viewerCoords,
  currentUserId,
}: PeopleSearchSheetProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<ProfileSearchRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset when the sheet closes, so reopening does not flash the last search.
  useEffect(() => {
    if (open) return;
    setQuery("");
    setRows(null);
    setError(null);
  }, [open]);

  const load = useCallback(
    async (q: string, signal: { cancelled: boolean }) => {
      setLoading(true);
      const res = await browsePeople({
        q,
        lat: viewerCoords?.lat ?? null,
        lng: viewerCoords?.lng ?? null,
        excludeUserId: currentUserId,
      });
      if (signal.cancelled) return;
      setLoading(false);
      setError(res.error ? "Couldn't load players. Try again." : null);
      setRows(res.data);
    },
    [viewerCoords?.lat, viewerCoords?.lng, currentUserId],
  );

  // One effect for both the first open and every keystroke: the list is always
  // "the server's answer for the current query", and an empty query is a
  // perfectly good query.
  useEffect(() => {
    if (!open) return;
    const signal = { cancelled: false };
    const t = window.setTimeout(() => void load(query, signal), query ? DEBOUNCE_MS : 0);
    return () => {
      signal.cancelled = true;
      window.clearTimeout(t);
    };
  }, [open, query, load]);

  const heading = useMemo(() => {
    if (rows == null) return "Players";
    if (query.trim()) return `${rows.length} ${rows.length === 1 ? "match" : "matches"}`;
    return `${rows.length} ${rows.length === 1 ? "player" : "players"}`;
  }, [rows, query]);

  const openProfile = (id: string) => {
    onOpenChange(false);
    navigate(`/athlete/${id}`);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex h-full w-full flex-col gap-0 overflow-hidden border-l border-white/10 bg-[#070b14] p-0 sm:max-w-md"
        aria-describedby={undefined}
      >
        <SheetHeader className="shrink-0 space-y-3 border-b border-white/[0.08] px-4 py-3">
          <div>
            <SheetTitle className="text-left text-base text-white">Players</SheetTitle>
            <SheetDescription className="text-left text-xs text-slate-500">
              Everyone you can play with. Tap anyone to see their profile.
            </SheetDescription>
          </div>

          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500"
              aria-hidden
            />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or @handle"
              aria-label="Search players"
              className="w-full rounded-2xl border border-white/10 bg-white/[0.05] py-2.5 pl-9 pr-9 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            {query ? (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  inputRef.current?.focus();
                }}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-slate-500 hover:bg-white/10 hover:text-white"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            ) : null}
          </div>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          <p
            className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500"
            aria-live="polite"
          >
            {loading && rows == null ? "Loading…" : heading}
          </p>

          {error ? (
            <p className="px-2 py-6 text-center text-sm text-amber-400" role="alert">
              {error}
            </p>
          ) : rows == null ? (
            <div className="flex justify-center py-12 text-slate-500">
              <Loader2 className="size-6 animate-spin opacity-60" aria-hidden />
            </div>
          ) : rows.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm leading-relaxed text-slate-500">
              {query.trim()
                ? `Nobody matches “${query.trim()}”.`
                : "No other players yet. You're early — invite someone to a game."}
            </p>
          ) : (
            <ul className="space-y-1">
              {rows.map((p) => {
                const name = p.display_name?.trim() || "Player";
                const dist = distanceLabel(p.distance_km);
                const sub = [p.handle ? `@${p.handle}` : null, p.city, p.favorite_sport, dist]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <li key={p.profile_id}>
                    <button
                      type="button"
                      onClick={() => openProfile(p.profile_id)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors",
                        "hover:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
                      )}
                      aria-label={`Open ${name}'s profile`}
                    >
                      <Avatar className="size-10 shrink-0 border border-white/10">
                        {p.avatar_url?.trim() ? (
                          <AvatarImage src={p.avatar_url} alt="" className="object-cover" />
                        ) : null}
                        <AvatarFallback className="bg-slate-800 text-xs text-slate-200">
                          {initials(name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-slate-100">
                          {name}
                        </span>
                        {sub ? (
                          <span className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-slate-500">
                            {dist ? <MapPin className="size-3 shrink-0" aria-hidden /> : null}
                            <span className="truncate">{sub}</span>
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {loading && rows != null ? (
            <p className="px-2 py-3 text-center text-[11px] text-slate-600">Updating…</p>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
