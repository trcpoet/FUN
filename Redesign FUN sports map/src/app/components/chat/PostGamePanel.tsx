import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, RotateCcw, Star, X } from "lucide-react";
import {
  closeRematchPoll,
  createRematchPoll,
  fetchGameOutcomeSummary,
  fetchRateableTeammates,
  fetchRematchPoll,
  rateTeammate,
  reportGameOutcome,
  voteRematchPoll,
  type GameOutcome,
  type GameOutcomeSummary,
  type RateableTeammate,
  type RematchPoll,
} from "../../../lib/api";
import { cn } from "../ui/utils";

/**
 * What happens in a game's thread once the game is over.
 *
 * Three steps, in the order the design describes, each revealed by the one
 * before it rather than all at once:
 *
 *   1. Did it happen?  The only question the app can ask that nobody else can
 *      answer, and the numerator of games-played over games-created.
 *   2. Rate the people you met.  Straight into `endorse_athlete`, which has been
 *      shipped and never called — every rating in the database is zero because
 *      nothing has ever asked. This is the ask.
 *   3. Run it back.  Host-only, one poll, everyone taps In or Out.
 *
 * Only step 1 is unprompted, and only once. Someone who answers and leaves has
 * given the app the one fact it needed; the rest is offered, not demanded.
 */

const OUTCOME_CHOICES: { value: GameOutcome; label: string; hint: string }[] = [
  { value: "played", label: "Yes, we played", hint: "Counts you in and unlocks ratings" },
  { value: "no_show", label: "No, it fell through", hint: "Nobody showed, or it was called off" },
  { value: "missed_it", label: "I couldn't make it", hint: "It may have happened without you" },
];

export function PostGamePanel(props: {
  gameId: string;
  /** The game's host, so only they are offered the rematch poll. */
  hostId: string | null;
  currentUserId: string | null;
  /** Prefill and open Create Game with the same sport, venue and squad. */
  onPlanRematch?: () => void;
  className?: string;
}) {
  const { gameId, hostId, currentUserId } = props;
  const isHost = Boolean(currentUserId && hostId && currentUserId === hostId);

  const [summary, setSummary] = useState<GameOutcomeSummary | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busyOutcome, setBusyOutcome] = useState<GameOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [teammates, setTeammates] = useState<RateableTeammate[]>([]);
  const [ratingBusy, setRatingBusy] = useState<string | null>(null);

  const [poll, setPoll] = useState<RematchPoll | null>(null);
  const [pollBusy, setPollBusy] = useState(false);

  const reload = useCallback(async () => {
    const [s, p] = await Promise.all([fetchGameOutcomeSummary(gameId), fetchRematchPoll(gameId)]);
    setSummary(s.data);
    setPoll(p.data);
    setLoaded(true);
  }, [gameId]);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    void (async () => {
      const [s, p] = await Promise.all([fetchGameOutcomeSummary(gameId), fetchRematchPoll(gameId)]);
      if (cancelled) return;
      setSummary(s.data);
      setPoll(p.data);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  // The rating row only exists for someone who says they played — you cannot
  // rate people you did not meet.
  useEffect(() => {
    if (summary?.my_outcome !== "played") {
      setTeammates([]);
      return;
    }
    let cancelled = false;
    void fetchRateableTeammates(gameId).then((r) => {
      if (!cancelled) setTeammates(r.data);
    });
    return () => {
      cancelled = true;
    };
  }, [gameId, summary?.my_outcome]);

  const answer = async (outcome: GameOutcome) => {
    if (busyOutcome) return;
    setBusyOutcome(outcome);
    setError(null);
    const err = await reportGameOutcome(gameId, outcome);
    setBusyOutcome(null);
    if (err) {
      setError(err.message);
      return;
    }
    await reload();
  };

  const rate = async (athleteId: string, rating: number) => {
    if (ratingBusy) return;
    setRatingBusy(athleteId);
    setError(null);
    const err = await rateTeammate({ gameId, athleteId, rating });
    setRatingBusy(null);
    if (err) {
      setError(err.message);
      return;
    }
    setTeammates((prev) =>
      prev.map((t) => (t.user_id === athleteId ? { ...t, my_rating: rating } : t)),
    );
  };

  // Nothing at all until the first read lands, and nothing ever if the migration
  // is not deployed (both reads return null rather than throwing).
  if (!loaded || summary === null) return null;

  const answered = summary.my_outcome != null;

  return (
    <div className={cn("space-y-3 rounded-2xl bg-surface-1 p-3", props.className)}>
      {!answered ? (
        <>
          <p className="text-sm font-semibold text-white">Did it happen?</p>
          <p className="text-xs leading-relaxed text-slate-400">
            One tap. It is how the next person knows this place and this host are real.
          </p>
          <div className="grid gap-1.5">
            {OUTCOME_CHOICES.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => void answer(c.value)}
                disabled={busyOutcome != null}
                className="flex min-h-11 items-center justify-between gap-3 rounded-xl bg-surface-3 px-3 text-left transition-colors hover:bg-surface-2 disabled:opacity-50"
              >
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-slate-100">{c.label}</span>
                  <span className="block truncate text-[11px] text-slate-500">{c.hint}</span>
                </span>
                {busyOutcome === c.value ? (
                  <Loader2 className="size-4 shrink-0 animate-spin text-primary" aria-hidden />
                ) : null}
              </button>
            ))}
          </div>
        </>
      ) : (
        <p className="text-xs text-slate-400">
          {summary.my_outcome === "played"
            ? `You said it happened${summary.played_count > 1 ? ` · ${summary.played_count} of ${summary.participants} agree` : ""}.`
            : summary.my_outcome === "no_show"
            ? "You said it fell through. Thanks — that is the part nobody else can tell us."
            : "You said you missed it."}
        </p>
      )}

      {/* Step 2: the ask that has never been made. */}
      {summary.my_outcome === "played" && teammates.length > 0 ? (
        <div className="space-y-2 border-t border-white/5 pt-3">
          <p className="text-sm font-semibold text-white">How were they?</p>
          <p className="text-xs leading-relaxed text-slate-400">
            One tap each. This is what a trust rating is made of.
          </p>
          <ul className="space-y-1.5">
            {teammates.map((t) => (
              <li key={t.user_id} className="flex items-center gap-2 rounded-xl bg-surface-3 px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-[13px] text-slate-200">
                  {t.display_name?.trim() || "A player"}
                </span>
                {ratingBusy === t.user_id ? (
                  <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
                ) : (
                  <span className="flex shrink-0 items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => void rate(t.user_id, n)}
                        className="p-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                        aria-label={`Rate ${t.display_name ?? "this player"} ${n} out of 5`}
                      >
                        <Star
                          className={cn(
                            "size-4 transition-colors",
                            (t.my_rating ?? 0) >= n
                              ? "fill-primary text-primary"
                              : "text-slate-600 hover:text-slate-400",
                          )}
                          aria-hidden
                        />
                      </button>
                    ))}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Step 3: run it back. */}
      {poll ? (
        <div className="space-y-2 border-t border-white/5 pt-3">
          <p className="text-sm font-semibold text-white">
            {poll.question?.trim() || "Run it back?"}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                setPollBusy(true);
                const err = await voteRematchPoll(poll.poll_id, "in");
                setPollBusy(false);
                if (err) {
                  setError(err.message);
                  return;
                }
                await reload();
              }}
              disabled={pollBusy}
              aria-pressed={poll.my_choice === "in"}
              className={cn(
                "inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-full text-sm font-semibold transition-colors disabled:opacity-50",
                poll.my_choice === "in"
                  ? "bg-primary text-primary-foreground"
                  : "bg-surface-3 text-slate-200 hover:bg-surface-2",
              )}
            >
              <Check className="size-4" aria-hidden />
              In {poll.in_count > 0 ? `· ${poll.in_count}` : ""}
            </button>
            <button
              type="button"
              onClick={async () => {
                setPollBusy(true);
                const err = await voteRematchPoll(poll.poll_id, "out");
                setPollBusy(false);
                if (err) {
                  setError(err.message);
                  return;
                }
                await reload();
              }}
              disabled={pollBusy}
              aria-pressed={poll.my_choice === "out"}
              className={cn(
                "inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-full text-sm font-semibold transition-colors disabled:opacity-50",
                poll.my_choice === "out"
                  ? "bg-surface-2 text-slate-300"
                  : "bg-surface-3 text-slate-400 hover:bg-surface-2",
              )}
            >
              <X className="size-4" aria-hidden />
              Out {poll.out_count > 0 ? `· ${poll.out_count}` : ""}
            </button>
          </div>
          {isHost ? (
            <div className="flex items-center gap-2 pt-0.5">
              {poll.in_count > 0 && props.onPlanRematch ? (
                <button
                  type="button"
                  onClick={props.onPlanRematch}
                  className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-[var(--glow-md)] transition hover:bg-primary-container"
                >
                  <RotateCcw className="size-4" aria-hidden />
                  Set it up · {poll.in_count} in
                </button>
              ) : null}
              <button
                type="button"
                onClick={async () => {
                  setPollBusy(true);
                  const err = await closeRematchPoll(poll.poll_id);
                  setPollBusy(false);
                  if (err) {
                    setError(err.message);
                    return;
                  }
                  await reload();
                }}
                disabled={pollBusy}
                className="min-h-10 rounded-full px-3 text-xs font-semibold text-slate-500 transition-colors hover:text-slate-300 disabled:opacity-50"
              >
                Close poll
              </button>
            </div>
          ) : null}
        </div>
      ) : isHost && answered ? (
        <div className="border-t border-white/5 pt-3">
          <button
            type="button"
            onClick={async () => {
              setPollBusy(true);
              setError(null);
              const { error: err } = await createRematchPoll(gameId, "Run it back?");
              setPollBusy(false);
              if (err) {
                setError(err.message);
                return;
              }
              await reload();
            }}
            disabled={pollBusy}
            className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-full bg-surface-3 text-sm font-semibold text-slate-100 transition-colors hover:bg-surface-2 disabled:opacity-50"
          >
            {pollBusy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <RotateCcw className="size-4" aria-hidden />
            )}
            Ask the squad to run it back
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="rounded-xl bg-rose-500/12 px-3 py-2 text-xs text-rose-200" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
