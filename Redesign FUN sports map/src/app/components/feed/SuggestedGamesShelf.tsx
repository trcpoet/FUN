import { useMemo } from "react";
import { Plus, Sparkles } from "lucide-react";
import { FEED_TTL_MS, SUGGESTED_RADIUS_KM, feedQueries } from "../../../lib/feedQueries";
import { friendlyRpcError } from "../../../lib/rpcErrors";
import { useQuery } from "../../../hooks/useCachedQuery";
import { GameHeadline } from "../game/GameHeadline";
import { GameStatusChip } from "../game/GameStatusChip";
import { spotsLabel } from "../game/SpotsBar";
import { sportEmojiFor } from "../../../lib/sportDisplay";
import { useSharedNow } from "../../../hooks/useSharedNow";

/**
 * "Is anyone playing my sport near me tonight?"
 *
 * Explore opened with two static tiles, one of them labelled "For you", both
 * linking to pages that rank nothing — `get_games_nearby` orders by distance and
 * the feed orders by created_at. This is the first surface in the app that
 * actually answers the question, and it shares its scorer with the map's "For
 * you" chip so the two cannot disagree.
 *
 * The empty state is the honest part. When nothing nearby is in your sports, the
 * useful reply is not a spinner or a shrug — it is "nobody is playing basketball
 * near you; be the one who is", with the button that does it.
 */
/** Two card-shaped placeholders, so the row holds its height while it loads. */
function ShelfSkeleton() {
  return (
    <div className="-mx-4 flex gap-3 overflow-hidden px-4 pb-2" role="status" aria-label="Loading games for you">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="flex h-[148px] w-[220px] shrink-0 animate-pulse flex-col gap-3 rounded-3xl bg-surface-1 p-4"
          style={{ animationDelay: `${i * 90}ms` }}
          aria-hidden
        >
          <div className="h-4 w-16 rounded-full bg-white/10" />
          <div className="h-3 w-3/4 rounded bg-white/10" />
          <div className="h-3 w-1/2 rounded bg-white/5" />
          <div className="mt-auto h-2.5 w-2/3 rounded bg-white/5" />
        </div>
      ))}
    </div>
  );
}

export function SuggestedGamesShelf(props: {
  lat: number | null;
  lng: number | null;
  /** Ranking depends on who is asking (their sports), so the cache is per user. */
  userId: string | null;
  /** No position yet but one is coming: hold the shelf's place instead of popping in later. */
  locating?: boolean;
  radiusKm?: number;
  /** Open a game on the map. */
  onOpenGame: (gameId: string) => void;
  /** Start hosting, for the empty state. */
  onHostGame?: () => void;
  /** Your sports, so the empty state can name the one you are missing. */
  mySports?: string[];
}) {
  const { lat, lng, onOpenGame } = props;
  const nowMs = useSharedNow(30_000);
  const query = useQuery(
    lat != null && lng != null ? feedQueries.suggested(props.userId, { lat, lng }, props.radiusKm ?? SUGGESTED_RADIUS_KM) : null,
    FEED_TTL_MS,
  );
  const rows = query.data ?? null;

  /**
   * Only games in your sports earn the "In your sports" heading. Everything else
   * ranked well on distance and timing, which is worth showing but is not the
   * same claim.
   */
  const inMySports = useMemo(() => (rows ?? []).filter((g) => g.sport_match), [rows]);
  const topSport = props.mySports?.[0];

  if ((lat == null || lng == null) && !props.locating) return null;

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2 px-1">
        <div className="flex size-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Sparkles className="size-4" />
        </div>
        <div>
          <h2 className="text-sm font-black uppercase tracking-widest text-white">For you</h2>
          <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-tight text-muted-foreground">
            {inMySports.length > 0 ? "Your sports, nearest and soonest" : "Ranked by sport, time and distance"}
          </p>
        </div>
      </div>

      {rows === null && query.error ? (
        <p className="px-1 text-xs text-slate-500">{friendlyRpcError(query.error, "suggested games")}</p>
      ) : rows === null ? (
        <ShelfSkeleton />
      ) : rows.length === 0 ? (
        <div className="rounded-[28px] bg-surface-1 px-5 py-6">
          <p className="text-sm font-semibold text-white">
            {topSport ? `No ${topSport.toLowerCase()} near you right now` : "Nothing nearby yet"}
          </p>
          <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-400">
            {topSport
              ? "That is usually how it starts. Post one and the people who play it will see it on the map."
              : "Post a game and the players near you will see it on the map within seconds."}
          </p>
          {props.onHostGame ? (
            <button
              type="button"
              onClick={props.onHostGame}
              className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-[var(--glow-md)] transition hover:bg-primary-container"
            >
              <Plus className="size-4" aria-hidden />
              Host one
            </button>
          ) : null}
        </div>
      ) : (
        <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 scrollbar-hide">
          {rows.map((g) => {

            return (
              <li key={g.id} className="w-[220px] shrink-0 snap-start">
                <button
                  type="button"
                  onClick={() => onOpenGame(g.id)}
                  className="flex h-full w-full flex-col gap-2 rounded-3xl bg-surface-1 p-4 text-left transition-colors hover:bg-surface-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg leading-none" aria-hidden>
                      {sportEmojiFor(g.sport ?? "")}
                    </span>
                    {g.sport_match ? (
                      <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-primary">
                        Your sport
                      </span>
                    ) : null}
                    <GameStatusChip game={g} nowMs={nowMs} size="xs" />
                  </div>

                  <GameHeadline game={g} nowMs={nowMs} variant="short" />

                  <p className="line-clamp-2 text-xs leading-snug text-slate-300">
                    {g.title?.trim() || "Pickup game"}
                  </p>

                  <p className="mt-auto pt-1 text-[11px] tabular-nums text-slate-400">
                    {spotsLabel(g)}
                    {g.distance_km != null
                      ? ` · ${g.distance_km < 1 ? `${Math.round(g.distance_km * 1000)} m` : `${g.distance_km.toFixed(1)} km`}`
                      : ""}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
