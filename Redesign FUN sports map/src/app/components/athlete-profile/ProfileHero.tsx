import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Button } from "../ui/button";
import { AthleteBadge } from "./AthleteBadge";
import { SportIconRow } from "./SportIconRow";
import type {
  AthleteSnapshot,
  AvailabilityValue,
  SkillRating,
  SportSkillEntry,
} from "../../../lib/athleteProfile";
import { AVAILABILITY_OPTIONS } from "../../../lib/athleteProfile";
import { formatRelativeShort, isWithinHours } from "../../../lib/formatRelative";
import { sportEmoji } from "../../../lib/sportVisuals";
import { ChevronLeft, Pencil } from "lucide-react";
import { cn } from "../ui/utils";

type Props = {
  displayName: string;
  handle: string | null;
  city: string | null;
  /** @deprecated Unused in layout; kept for call-site compatibility. */
  coverUrl?: string | null;
  favoriteSport?: string | null;
  avatarUrl: string | null;
  fallbackInitial: string;
  primarySports: string[];
  /** Levels shown next to primary sports on the hero (minimal layout). */
  sportsSkills?: SportSkillEntry[];
  snapshot?: AthleteSnapshot;
  skillRatings?: SkillRating[];
  bio: string | null;
  level: number;
  xp: number;
  tierLabel: string | null;
  availability: AvailabilityValue | null;
  verified: boolean;
  sportsmanshipBadge: boolean;
  lastGameIso: string | null;
  onBack: () => void;
  /** Opens settings / edit sheet (full profile editor). */
  onOpenSettings: () => void;
  /** Hide header edit control (e.g. public athlete view). */
  readOnly?: boolean;
  /** Instagram-style main profile: only name, handle, bio, badges under avatar. */
  minimal?: boolean;
  /** Taller cover on desktop */
  isDesktop?: boolean;
  className?: string;
};

function availabilityLabel(v: AvailabilityValue | null): string {
  if (!v) return "Set availability";
  return AVAILABILITY_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

function levelShort(l: SportSkillEntry["level"]): string {
  if (!l) return "—";
  return l.charAt(0).toUpperCase() + l.slice(1);
}

function HeroStatPills({
  snapshot,
  className,
}: {
  snapshot: AthleteSnapshot;
  className?: string;
}) {
  const s = snapshot;
  const positions = s.positions?.filter(Boolean).join(", ");
  const years =
    s.yearsExperience != null && s.yearsExperience > 0 ? `${s.yearsExperience} yrs` : null;
  const intensity =
    s.intensity === "low"
      ? "Low"
      : s.intensity === "moderate"
        ? "Moderate"
        : s.intensity === "high"
          ? "High"
          : null;
  const pills: { k: string; v: string }[] = [];
  if (s.height?.trim()) pills.push({ k: "Ht", v: s.height.trim() });
  if (s.weight?.trim()) pills.push({ k: "Wt", v: s.weight.trim() });
  if (s.handedness?.trim()) pills.push({ k: "Hand", v: s.handedness.trim() });
  if (positions) pills.push({ k: "Pos", v: positions });
  if (years) pills.push({ k: "Exp", v: years });
  if (s.playStyle?.trim()) pills.push({ k: "Style", v: s.playStyle.trim() });
  if (s.fitnessFocus?.trim()) pills.push({ k: "Focus", v: s.fitnessFocus.trim() });
  if (intensity) pills.push({ k: "Intensity", v: intensity });
  if (pills.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-1.5 pt-1", className)}>
      {pills.map((p) => (
        <span
          key={p.k + p.v}
          className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-white/[0.1] bg-white/[0.06] px-2.5 py-1 text-[11px] text-slate-200"
        >
          <span className="font-semibold uppercase tracking-wide text-slate-500">{p.k}</span>
          <span className="truncate font-medium text-white/95">{p.v}</span>
        </span>
      ))}
    </div>
  );
}

const MAX_HERO_STRENGTHS = 4;

function HeroStrengthDots({ ratings }: { ratings: SkillRating[] }) {
  const top = [...ratings].filter((r) => r.value > 0).sort((a, b) => b.value - a.value).slice(0, MAX_HERO_STRENGTHS);
  if (top.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 pt-1">
      {top.map((r) => (
        <div
          key={r.key}
          className="flex min-w-0 max-w-[8.5rem] flex-1 flex-col gap-0.5 rounded-lg border border-white/[0.08] bg-black/25 px-2 py-1.5"
        >
          <div className="flex items-center justify-between gap-1 text-[10px] text-slate-400">
            <span className="truncate font-medium text-slate-300">{r.label}</span>
            <span className="shrink-0 tabular-nums text-emerald-300/90">{r.value}</span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400"
              style={{ width: `${r.value}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ProfileHero({
  displayName,
  handle,
  city,
  avatarUrl,
  favoriteSport,
  fallbackInitial,
  primarySports,
  sportsSkills = [],
  snapshot,
  skillRatings = [],
  bio,
  level,
  xp,
  tierLabel,
  availability,
  verified,
  sportsmanshipBadge,
  lastGameIso,
  onBack,
  onOpenSettings,
  readOnly = false,
  minimal,
  isDesktop,
  className,
}: Props) {
  const lastGameShort = formatRelativeShort(lastGameIso);
  const activeToday = isWithinHours(lastGameIso, 24);

  const presenceParts: string[] = [];
  if (activeToday) presenceParts.push("Active today");
  presenceParts.push(availabilityLabel(availability));
  if (lastGameShort) presenceParts.push(`Last game ${lastGameShort}`);

  const coverH = isDesktop ? "h-40 md:h-48" : "h-32 sm:h-36";

  return (
    <section className={cn("relative overflow-hidden rounded-b-3xl md:rounded-b-[1.75rem]", className)}>
      <div className={cn("relative", coverH)}>
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-900/40 via-[#0c1528] to-cyan-950/50" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-[#080c14]" />

        <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-2 sm:p-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-white/90 hover:bg-white/10 hover:text-white rounded-full"
            onClick={onBack}
            aria-label="Back to map"
          >
            <ChevronLeft className="size-6" />
          </Button>
          {!readOnly && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-white/80 hover:bg-white/10 hover:text-white rounded-full"
              onClick={onOpenSettings}
              aria-label="Profile settings"
            >
              <Pencil className="size-5" />
            </Button>
          )}
        </div>
      </div>

      <div
        className={cn(
          "relative z-10 px-4 -mt-[5.75rem] sm:-mt-[6rem] md:-mt-[6.25rem] lg:-mt-[6.5rem]",
          minimal && primarySports.length > 0
            ? "grid grid-cols-[auto_minmax(0,1fr)_auto] items-end gap-x-2.5 sm:gap-x-3 md:gap-x-4"
            : "flex gap-4 items-end",
        )}
      >
        <div
          className={cn(
            "relative shrink-0",
            isDesktop ? "size-[7.5rem] md:size-[8rem]" : "size-[7.25rem]",
          )}
        >
          <Avatar
            className={cn(
              "rounded-[1.35rem] border-[3px] border-[#080c14] shadow-2xl shadow-black/50 ring-1 ring-white/10 size-full",
            )}
          >
            {avatarUrl?.trim() ? <AvatarImage src={avatarUrl} alt="" className="object-cover" /> : null}
            <AvatarFallback className="rounded-[1.35rem] bg-slate-800 text-slate-200 text-3xl font-bold">
              {fallbackInitial}
            </AvatarFallback>
          </Avatar>
          {favoriteSport?.trim() ? (
            <span
              className={cn(
                "pointer-events-none absolute z-20 -bottom-1 -right-1 select-none leading-none",
                "text-5xl drop-shadow-[0_2px_6px_rgba(0,0,0,0.9),0_0_12px_rgba(0,0,0,0.45)]",
                isDesktop ? "md:text-6xl md:-bottom-1.5 md:-right-1.5" : "sm:text-6xl",
              )}
              title={favoriteSport.trim()}
              role="img"
              aria-label={`Favorite sport: ${favoriteSport.trim()}`}
            >
              {sportEmoji(favoriteSport.trim())}
            </span>
          ) : null}
        </div>

        <div
          className={cn(
            "min-w-0 pb-1.5 space-y-1",
            minimal && primarySports.length > 0 && "flex flex-col items-center text-center",
            (!minimal || primarySports.length === 0) && "flex-1",
          )}
        >
          <div
            className={cn(
              "flex flex-wrap items-center gap-x-2 gap-y-1",
              minimal && primarySports.length > 0 && "justify-center",
            )}
          >
            <h1
              className={cn(
                "font-bold tracking-tight text-white leading-none truncate max-w-full",
                isDesktop ? "text-2xl md:text-3xl" : "text-2xl sm:text-[1.65rem]",
              )}
            >
              {displayName}
            </h1>
            {verified && (
              <AthleteBadge
                variant="verified"
                className={cn(
                  "shrink-0 scale-90",
                  minimal && primarySports.length > 0 ? "origin-center" : "origin-left",
                )}
              />
            )}
            {sportsmanshipBadge && (
              <AthleteBadge
                variant="sportsmanship"
                className={cn(
                  "shrink-0 scale-90",
                  minimal && primarySports.length > 0 ? "origin-center" : "origin-left",
                )}
              />
            )}
          </div>
          {(handle || (minimal && bio?.trim())) && (
            <div
              className={cn(
                "flex w-full max-w-full flex-wrap items-center gap-x-2 gap-y-1",
                minimal && primarySports.length > 0 && "justify-center",
              )}
            >
              {handle ? (
                <p className="shrink-0 font-mono text-sm text-slate-500">
                  @{handle.replace(/^@/, "")}
                </p>
              ) : null}
              {minimal && bio?.trim() ? (
                <>
                  {handle ? (
                    <span className="hidden text-slate-600 sm:inline" aria-hidden>
                      ·
                    </span>
                  ) : null}
                  <p
                    className={cn(
                      "min-w-0 max-w-full text-sm leading-snug text-slate-400 line-clamp-2",
                      minimal && primarySports.length > 0 ? "text-center sm:max-w-[min(100%,18rem)]" : "sm:max-w-xl",
                    )}
                  >
                    {bio.trim()}
                  </p>
                </>
              ) : null}
            </div>
          )}
          {minimal && snapshot && (
            <HeroStatPills
              snapshot={snapshot}
              className={primarySports.length > 0 ? "justify-center" : undefined}
            />
          )}
          {minimal && skillRatings.length > 0 && (
            <div
              className={cn(
                "w-full",
                primarySports.length > 0 && "flex justify-center [&>div]:max-w-full",
              )}
            >
              <HeroStrengthDots ratings={skillRatings} />
            </div>
          )}
        </div>

        {minimal && primarySports.length > 0 ? (
          <div className="min-w-0 max-w-[min(42vw,13.5rem)] shrink-0 justify-self-end pb-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-600 text-right">
              Primary
            </p>
            <ul className="mt-1 flex flex-col gap-1 items-end">
              {primarySports.map((sport) => {
                const row = sportsSkills.find((x) => x.sport === sport && x.primary);
                return (
                  <li
                    key={sport}
                    className="flex w-full max-w-[13.5rem] items-center justify-between gap-2 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5"
                  >
                    <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-slate-100">
                      <span className="shrink-0 text-base" aria-hidden>
                        {sportEmoji(sport)}
                      </span>
                      <span className="truncate">{sport}</span>
                    </span>
                    <span className="shrink-0 text-[11px] text-slate-500">
                      {row?.primary !== false ? "Primary" : "—"} · {levelShort(row?.level ?? null)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="px-4 pt-3 space-y-3 pb-1">
        {!minimal && (
          <>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              {presenceParts.map((part, i) => (
                <span key={i}>
                  {i > 0 && <span className="text-slate-600 mx-1.5">·</span>}
                  <span className={i === 0 && activeToday ? "text-emerald-400/95 font-medium" : ""}>{part}</span>
                </span>
              ))}
            </p>

            {(city || primarySports.length > 0) && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                {city && <span>{city}</span>}
                {primarySports.length > 0 && <SportIconRow sports={primarySports} size="sm" className="gap-1.5" />}
              </div>
            )}
          </>
        )}

        {bio && !minimal && <p className="text-sm text-slate-300 leading-relaxed">{bio}</p>}

        {!minimal && (
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center rounded-full bg-white/[0.06] px-3 py-1 text-xs font-medium text-slate-200">
              {tierLabel ? `${tierLabel} · ` : ""}Lvl {level}
              <span className="text-slate-500 font-normal ml-1.5 tabular-nums">{xp.toLocaleString()} XP</span>
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
