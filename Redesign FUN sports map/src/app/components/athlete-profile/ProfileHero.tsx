import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Button } from "../ui/button";
import { AthleteBadge } from "./AthleteBadge";
import { SportIconRow } from "./SportIconRow";
import type { AvailabilityValue } from "../../../lib/athleteProfile";
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

export function ProfileHero({
  displayName,
  handle,
  city,
  avatarUrl,
  favoriteSport,
  fallbackInitial,
  primarySports,
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

  const coverH = isDesktop ? "h-44 md:h-52" : "h-36 sm:h-40";

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

      <div className="relative px-4 flex gap-4 items-end -mt-14 z-10">
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
            <div
              className="absolute z-20 flex size-[2.125rem] items-center justify-center rounded-full border-[3px] border-[#080c14] bg-gradient-to-br from-slate-700 to-slate-900 text-[1.05rem] leading-none shadow-lg shadow-black/40 ring-1 ring-white/15 -bottom-1 -left-1 sm:size-9 sm:text-[1.15rem] sm:-bottom-1.5 sm:-left-1.5"
              title={favoriteSport.trim()}
              aria-label={`Favorite sport: ${favoriteSport.trim()}`}
            >
              <span aria-hidden className="select-none">
                {sportEmoji(favoriteSport.trim())}
              </span>
            </div>
          ) : null}
        </div>

        <div className="min-w-0 flex-1 pb-1.5 space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h1
              className={cn(
                "font-bold tracking-tight text-white leading-none truncate max-w-full",
                isDesktop ? "text-2xl md:text-3xl" : "text-2xl sm:text-[1.65rem]",
              )}
            >
              {displayName}
            </h1>
            {verified && <AthleteBadge variant="verified" className="shrink-0 scale-90 origin-left" />}
            {sportsmanshipBadge && <AthleteBadge variant="sportsmanship" className="shrink-0 scale-90 origin-left" />}
          </div>
          {handle && (
            <p className="text-sm text-slate-500 font-mono truncate">@{handle.replace(/^@/, "")}</p>
          )}
        </div>
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

        {bio && <p className="text-sm text-slate-300 leading-relaxed">{bio}</p>}

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
