// Vercel sync test commit
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { BadgeCheck, Info, Share2, MapPin, Award, Zap, Users, Play, ChevronRight, Plus } from "lucide-react";
import { Button } from "../ui/button";
import { cn } from "../ui/utils";
import { StarRating } from "../ui/StarRating";
import type { PerformanceMetricEntry } from "../../../lib/athleteProfile";
import { Badge } from "../ui/badge";

type Props = {
  displayName: string;
  handle: string | null;
  avatarUrl: string | null;
  fallbackInitial: string;
  verified: boolean;
  rating?: number | null;
  ratingCount?: number;
  gamesPlayed?: number;
  statusText?: string | null;
  bio?: string | null;
  performanceMetrics?: PerformanceMetricEntry[];
  primarySports?: string[];
  followersCount?: number;
  followingCount?: number;
  homeBaseLabel?: string | null;
  onAbout?: () => void;
  onShare?: () => void;
  discoverExpanded?: boolean;
  onDiscoverPeople?: () => void;
  isOwnProfile?: boolean;
  className?: string;
};

function cleanHandle(h: string) {
  return h.replace(/^@/, "").trim();
}

/** Reputation Rating is 0-10, derived from 0-5 star average. */
function formatReputation(starAvg: number | null): string {
  if (starAvg == null || starAvg === 0) return "0.0";
  return (starAvg * 2).toFixed(1);
}

export function ProfileHubHero({
  displayName,
  handle,
  avatarUrl,
  fallbackInitial,
  verified,
  rating,
  ratingCount,
  gamesPlayed,
  statusText,
  bio,
  performanceMetrics = [],
  primarySports = [],
  followersCount,
  followingCount,
  homeBaseLabel,
  onAbout,
  onShare,
  discoverExpanded,
  onDiscoverPeople,
  isOwnProfile,
  className,
}: Props) {
  const bioText = bio?.trim() ?? "";
  const handleClean = handle?.trim() ? cleanHandle(handle) : "";
  const homeBase = homeBaseLabel?.trim() ?? "";
  const followers = followersCount ?? 0;
  const following = followingCount ?? 0;
  const games = gamesPlayed ?? 0;
  const ratingValue = typeof rating === "number" ? rating : null;
  const ratingN = ratingCount ?? 0;

  return (
    <div className={cn("relative", className)}>
      <section className="relative pt-2 md:pt-8">
        {/* Profile Card Main */}
        <div className="rounded-[28px] sm:rounded-[40px] border border-white/[0.08] bg-card/40 backdrop-blur-xl p-4 sm:p-6 md:p-10 shadow-[0_24px_48px_-12px_rgba(0,0,0,0.5)]">
          <div className="flex flex-row items-center text-left md:flex-row md:text-left md:items-start gap-4 md:gap-10">
            {/* Avatar Section */}
            <div className="relative shrink-0 group">
              <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <Avatar className="size-20 sm:size-28 md:size-40 rounded-full border-[4px] sm:border-[6px] border-[#0D1117] shadow-2xl ring-2 ring-white/10 transition-transform duration-500 group-hover:scale-[1.02]">
                <AvatarImage src={avatarUrl ?? undefined} className="object-cover" />
                <AvatarFallback className="bg-slate-800 text-2xl sm:text-4xl font-black text-slate-200 italic tracking-tighter">
                  {fallbackInitial}
                </AvatarFallback>
              </Avatar>

              {verified && (
                <div className="absolute bottom-1 right-1 sm:bottom-2 sm:right-2 flex size-6 sm:size-8 md:size-10 items-center justify-center rounded-full bg-primary text-white shadow-[0_4px_12px_rgba(225,29,72,0.4)] ring-2 sm:ring-4 ring-[#0D1117]">
                  <BadgeCheck className="size-3.5 sm:size-5 md:size-6" />
                </div>
              )}
            </div>

            {/* Identity & Bio */}
            <div className="flex-1 min-w-0 space-y-2 sm:space-y-4">
              <div className="space-y-0.5 sm:space-y-1">
                <h1 className="text-xl sm:text-3xl md:text-5xl font-black italic tracking-tighter uppercase text-white leading-tight">
                  {displayName}
                </h1>
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-3">
                  {handleClean ? (
                    <span className="text-sm sm:text-lg font-bold text-primary tracking-tight">@{handleClean}</span>
                  ) : (
                    <span className="text-xs sm:text-sm font-medium text-slate-500 italic">No handle set</span>
                  )}

                  {/* Rating Pill + Home Base */}
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <div className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full bg-amber-500/10 border border-amber-500/20">
                      <span className="text-[10px] sm:text-xs font-black text-amber-400">{ratingValue?.toFixed(1) || "0.0"}</span>
                      <StarRating value={ratingValue ?? 0} size={10} className="text-amber-400" />
                      <span className="text-[9px] sm:text-[10px] font-bold text-amber-500/60 tabular-nums">({ratingN})</span>
                    </div>

                    {homeBase && (
                      <div className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full bg-blue-500/10 border border-blue-500/20">
                        <MapPin className="size-3 text-blue-400" />
                        <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-blue-400">{homeBase}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {bioText ? (
                <p className="max-w-2xl text-xs sm:text-base md:text-lg font-medium text-slate-300 leading-relaxed italic line-clamp-2 sm:line-clamp-none">
                  "{bioText}"
                </p>
              ) : (
                <p className="text-xs sm:text-sm font-medium text-slate-500 italic uppercase tracking-widest opacity-60">Athlete at Large</p>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-1 sm:pt-2">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <Button
                    onClick={onAbout}
                    className="rounded-xl sm:rounded-2xl bg-white/[0.03] border border-white/10 text-white hover:bg-white/[0.08] font-bold uppercase tracking-widest text-[9px] sm:text-[10px] h-8 sm:h-10 px-3 sm:px-6"
                  >
                    <Info className="mr-1.5 sm:mr-2 size-3 sm:size-3.5" /> About
                  </Button>
                  <Button
                    onClick={onShare}
                    className="rounded-xl sm:rounded-2xl bg-white/[0.03] border border-white/10 text-white hover:bg-white/[0.08] font-bold uppercase tracking-widest text-[9px] sm:text-[10px] h-8 sm:h-10 px-3 sm:px-6"
                  >
                    <Share2 className="mr-1.5 sm:mr-2 size-3 sm:size-3.5" /> Share
                  </Button>
                  {!isOwnProfile && (
                    <Button
                      variant="ghost"
                      className="rounded-xl sm:rounded-2xl bg-primary/10 text-primary hover:bg-primary hover:text-white transition-all font-black uppercase tracking-widest text-[9px] sm:text-[10px] h-8 sm:h-10 px-3 sm:px-6 group"
                    >
                      Follow <ChevronRight className="ml-1 size-3 sm:size-3.5 group-hover:translate-x-1 transition-transform" />
                    </Button>
                  )}
                </div>
                {onDiscoverPeople && (
                  <button
                    type="button"
                    aria-pressed={discoverExpanded}
                    aria-label={discoverExpanded ? "Hide discover people" : "Discover people near you"}
                    onClick={onDiscoverPeople}
                    className={cn(
                      "size-8 sm:size-9 shrink-0 rounded-xl sm:rounded-2xl border flex items-center justify-center transition-[box-shadow,background-color,border-color] duration-200",
                      discoverExpanded
                        ? "border-emerald-500/45 bg-emerald-500/15 text-emerald-100 shadow-[0_0_0_1px_rgba(16,185,129,0.35)]"
                        : "border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/[0.08]"
                    )}
                  >
                    <Plus className={cn("size-3.5 sm:size-4 transition-transform duration-200", discoverExpanded && "rotate-45")} />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Metrics Strip */}
          <div className="mt-4 sm:mt-6 md:mt-10 grid grid-cols-4 gap-2 sm:gap-3 md:gap-4">
            <div className="rounded-2xl sm:rounded-3xl border border-white/[0.05] bg-white/[0.02] p-2.5 sm:p-4 md:p-5 transition-all hover:bg-white/[0.04]">
              <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-3">
                <div className="size-5 sm:size-7 rounded-lg sm:rounded-xl bg-blue-500/10 flex items-center justify-center">
                  <Play className="size-2.5 sm:size-3.5 text-blue-500 fill-current" />
                </div>
                <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-widest text-slate-500 hidden sm:inline">Games</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-lg sm:text-3xl font-black italic tracking-tighter text-white uppercase">{games}</span>
                <span className="text-[8px] sm:text-[10px] font-bold text-blue-500/60 uppercase">Played</span>
              </div>
            </div>

            <div className="rounded-2xl sm:rounded-3xl border border-white/[0.05] bg-white/[0.02] p-2.5 sm:p-4 md:p-5 transition-all hover:bg-white/[0.04]">
              <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-3">
                <div className="size-5 sm:size-7 rounded-lg sm:rounded-xl bg-rose-500/10 flex items-center justify-center">
                  <Users className="size-2.5 sm:size-3.5 text-rose-500" />
                </div>
                <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-widest text-slate-500 hidden sm:inline">Network</span>
              </div>
              <div className="flex items-baseline gap-1.5 sm:gap-3">
                <div className="flex items-baseline gap-0.5 sm:gap-1">
                  <span className="text-lg sm:text-3xl font-black italic tracking-tighter text-white uppercase">{followers}</span>
                  <span className="text-[7px] sm:text-[9px] font-bold text-rose-500/60 uppercase tracking-tighter hidden xs:inline">Followers</span>
                </div>
                <div className="w-px h-3 sm:h-4 bg-white/10 self-center" />
                <div className="flex items-baseline gap-0.5 sm:gap-1">
                  <span className="text-lg sm:text-3xl font-black italic tracking-tighter text-white uppercase">{following}</span>
                  <span className="text-[7px] sm:text-[9px] font-bold text-slate-500 uppercase tracking-tighter hidden xs:inline">Following</span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl sm:rounded-3xl border border-white/[0.05] bg-white/[0.02] p-2.5 sm:p-4 md:p-5 transition-all hover:bg-white/[0.04]">
              <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-3">
                <div className="size-5 sm:size-7 rounded-lg sm:rounded-xl bg-primary/10 flex items-center justify-center">
                  <Award className="size-2.5 sm:size-3.5 text-primary" />
                </div>
                <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-widest text-slate-500 hidden sm:inline">Reputation</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-lg sm:text-3xl font-black italic tracking-tighter text-white uppercase">
                  {formatReputation(ratingValue)}
                </span>
                <span className="text-[8px] sm:text-[10px] font-bold text-primary/60 uppercase">Rating</span>
              </div>
            </div>

            <div className="rounded-2xl sm:rounded-3xl border border-white/[0.05] bg-white/[0.02] p-2.5 sm:p-4 md:p-5 transition-all hover:bg-white/[0.04]">
              <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-3">
                <div className="size-5 sm:size-7 rounded-lg sm:rounded-xl bg-emerald-500/10 flex items-center justify-center">
                  <Zap className="size-2.5 sm:size-3.5 text-emerald-500" />
                </div>
                <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-widest text-slate-500 hidden sm:inline">Power</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-lg sm:text-3xl font-black italic tracking-tighter text-white uppercase">LVL 1</span>
              </div>
            </div>
          </div>

        </div>
      </section>
    </div>
  );
}
