import { useEffect, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { CalendarClock, Globe2, Lock, MapPin, ShieldCheck, Users2 } from "lucide-react";
import type { GameRow } from "../../../lib/supabase";
import { fetchGameChatMembers, type GameChatMember } from "../../../lib/gameChat";
import {
  DEFAULT_GAME_DURATION_MIN,
  formatUrgentCountdown,
  getCountdownRemainingMs,
  getGameEndsAtMs,
} from "../../../lib/mapGameTimer";
import { visibilityEnumToLabel } from "../../../lib/gamePreferenceOptions";
import { parseRequirements } from "../../lib/gameFilters";
import { formatCoords } from "../../lib/venueInfoHelpers";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { cn } from "../ui/utils";

/**
 * The back of the game card.
 *
 * The front answers "am I going?" — this answers "what is it?". Everything here comes from the
 * `GameRow` the caller already holds, except the squad, which is the one thing you cannot get
 * anywhere else on the map: elsewhere the app shows a headcount, here you see who is coming.
 *
 * The roster fetch is lazy by construction — this component only mounts once the details view
 * is opened, so a viewer who never taps ℹ️ never pays for it.
 */
export function GameDetailsView({ game, nowMs }: { game: GameRow; nowMs: number }) {
  const [members, setMembers] = useState<GameChatMember[] | null>(null);
  const [rosterFailed, setRosterFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setMembers(null);
    setRosterFailed(false);
    void fetchGameChatMembers(game.id).then(({ data, error }) => {
      if (cancelled) return;
      if (error || !data) setRosterFailed(true);
      else setMembers(data);
    });
    return () => {
      cancelled = true;
    };
  }, [game.id]);

  const rules = parseRequirements(game.requirements);
  const ruleChips = [
    rules.skillLevel !== "Any" ? rules.skillLevel : null,
    rules.ageRange !== "Any" ? rules.ageRange : null,
    rules.matchType !== "Any" && rules.matchType !== "Co-ed" ? rules.matchType : null,
  ].filter(Boolean) as string[];

  const visibility = visibilityEnumToLabel(game.visibility);
  const VisibilityIcon = game.visibility === "public" || !game.visibility ? Globe2 : Lock;

  return (
    <div className="max-h-[min(60vh,26rem)] space-y-3 overflow-y-auto px-4 py-3 scrollbar-hide">
      <Fact icon={<CalendarClock className="size-3.5" aria-hidden />} label="When">
        <WhenLines game={game} nowMs={nowMs} />
      </Fact>

      <Fact icon={<MapPin className="size-3.5" aria-hidden />} label="Where">
        <p className="text-xs text-slate-200">
          {game.location_label?.trim() || "Dropped on the map"}
        </p>
        <p className="mt-0.5 text-[11px] tabular-nums text-slate-500">
          {formatCoords(game.lat, game.lng)}
        </p>
      </Fact>

      <Fact icon={<Users2 className="size-3.5" aria-hidden />} label="Squad">
        <Squad game={game} members={members} failed={rosterFailed} />
      </Fact>

      <Fact icon={<ShieldCheck className="size-3.5" aria-hidden />} label="Who can play">
        {ruleChips.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {ruleChips.map((chip) => (
              <span
                key={chip}
                className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[11px] text-slate-200"
              >
                {chip}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-200">Open to everyone</p>
        )}
      </Fact>

      <Fact icon={<VisibilityIcon className="size-3.5" aria-hidden />} label="Visibility">
        <p className="text-xs text-slate-200">{visibility}</p>
      </Fact>

      {game.description?.trim() ? (
        <div className="border-t border-white/[0.07] pt-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            From the host
          </p>
          <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-300">
            {game.description.trim()}
          </p>
        </div>
      ) : null}

      <p className="border-t border-white/[0.07] pt-2.5 text-[11px] text-slate-600">
        Posted {formatDistanceToNow(new Date(game.created_at), { addSuffix: true })}
      </p>
    </div>
  );
}

/** Icon + label on the left, value stack on the right. Same rhythm as the venue fact rows. */
function Fact({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-2.5">
      <span
        className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.04] text-slate-400"
        aria-hidden
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
        <div className="mt-0.5">{children}</div>
      </div>
    </div>
  );
}

/**
 * Start, length and end in the viewer's own terms.
 *
 * Untimed games get the map's TTL instead of an end time — nothing about them ever ends, so
 * quoting a finish would be a lie. Both numbers come from `mapGameTimer`; liveness is never
 * re-derived here.
 */
function WhenLines({ game, nowMs }: { game: GameRow; nowMs: number }) {
  if (!game.starts_at) {
    const remaining = getCountdownRemainingMs(game, nowMs);
    return (
      <>
        <p className="text-xs text-slate-200">No set time — turn up and play</p>
        <p className="mt-0.5 text-[11px] tabular-nums text-slate-500">
          {remaining == null
            ? "No longer on the map"
            : `${formatUrgentCountdown(remaining)} left on the map`}
        </p>
      </>
    );
  }

  const start = new Date(game.starts_at);
  const endsAtMs = getGameEndsAtMs(game);
  const minutes = game.duration_minutes ?? DEFAULT_GAME_DURATION_MIN;

  return (
    <>
      <p className="text-xs text-slate-200">{format(start, "EEEE, MMM d · h:mm a")}</p>
      <p className="mt-0.5 text-[11px] tabular-nums text-slate-500">
        {formatDuration(minutes)}
        {endsAtMs != null ? ` · ends ${format(new Date(endsAtMs), "h:mm a")}` : ""}
      </p>
    </>
  );
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} hr${h === 1 ? "" : "s"}` : `${h} hr ${m} min`;
}

function Squad({
  game,
  members,
  failed,
}: {
  game: GameRow;
  members: GameChatMember[] | null;
  failed: boolean;
}) {
  const filled = game.participant_count ?? 0;
  const countLine =
    `${filled} of ${game.spots_needed} in` +
    (game.substitute_count ? ` · ${game.substitute_count} on the waitlist` : "");

  // Names may be unreadable (profile visibility, a signed-out viewer) — the count still is.
  if (failed || (members && members.length === 0)) {
    return <p className="text-xs text-slate-200">{countLine}</p>;
  }

  if (!members) {
    return (
      <div className="flex items-center gap-2">
        <span className="size-6 animate-pulse rounded-full bg-white/[0.07]" aria-hidden />
        <span className="h-3 w-24 animate-pulse rounded bg-white/[0.07]" aria-hidden />
        <span className="sr-only">Loading squad</span>
      </div>
    );
  }

  return (
    <>
      <ul className="space-y-1.5">
        {members.map((m) => {
          const name = m.display_name?.trim() || "Player";
          return (
            <li key={m.user_id} className="flex items-center gap-2">
              <Avatar className="size-6 shrink-0 border border-white/10">
                {m.avatar_url?.trim() ? (
                  <AvatarImage src={m.avatar_url} alt="" className="object-cover" />
                ) : null}
                <AvatarFallback className="bg-slate-800 text-[9px] text-slate-300">
                  {name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1 truncate text-xs text-slate-200">{name}</span>
              {m.role === "host" ? (
                <span
                  className={cn(
                    "shrink-0 rounded-full border px-1.5 py-[1px] text-[9px] font-semibold uppercase tracking-wide",
                    "border-amber-400/40 bg-amber-500/15 text-amber-200",
                  )}
                >
                  Host
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className="mt-1.5 text-[11px] tabular-nums text-slate-500">{countLine}</p>
    </>
  );
}
