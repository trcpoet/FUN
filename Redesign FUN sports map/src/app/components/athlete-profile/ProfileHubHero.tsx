import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { BadgeCheck, Info, Share2, MapPin, Award, Zap, Users, Play, Settings, ChevronRight } from "lucide-react";
import { Button } from "../ui/button";
import { cn } from "../ui/utils";
import { StarRating } from "../ui/StarRating";
import type { PerformanceMetricEntry } from "../../../lib/athleteProfile";
import { visibleMetrics } from "../../../lib/athleteProfile";
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
  isOwnProfile,
  className,
}: Props) {
  const bioText = bio?.trim() ?? "";
  const handleClean = handle?.trim() ? cleanHandle(handle) : "";
  const visibleMetricList = visibleMetrics(performanceMetrics, primarySports);
  const homeBase = homeBaseLabel?.trim() ?? "";
  const followers = followersCount ?? 0;
  const following = followingCount ?? 0;
  const games = gamesPlayed ?? 0;
  const ratingValue = typeof rating === "number" ? rating : null;
  const ratingN = ratingCount ?? 0;

  return (
    <div className={cn("relative", className)}>
      {/* Visual Background / Cover Area */}
      <div className="absolute inset-x-0 -top-24 h-64 overflow-hidden rounded-b-[48px] md:h-80">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/20 via-primary/5 to-[#0D1117]" />
        <div className="absolute inset-0 opacity-30 mix-blend-overlay bg-[url('https://images.unsplash.com/photo-1541252260730-0412e8e2108e?q=80&w=2000')] bg-cover bg-center" />
        <div className="absolute inset-0 bg-[#0D1117]/20 backdrop-blur-[2px]" />
      </div>

      <section className="relative pt-12 md:pt-24">
        {/* Profile Card Main */}
        <div className="rounded-[40px] border border-white/[0.08] bg-card/40 backdrop-blur-xl p-6 md:p-10 shadow-[0_24px_48px_-12px_rgba(0,0,0,0.5)]">
          <div className="flex flex-col items-center text-center md:flex-row md:text-left md:items-start gap-6 md:gap-10">
            {/* Avatar Section */}
            <div className="relative shrink-0 group">
              <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <Avatar className="size-28 md:size-40 rounded-full border-[6px] border-[#0D1117] shadow-2xl ring-2 ring-white/10 transition-transform duration-500 group-hover:scale-[1.02]">
                <AvatarImage src={avatarUrl ?? undefined} className="object-cover" />
                <AvatarFallback className="bg-slate-800 text-4xl font-black text-slate-200 italic tracking-tighter">
                  {fallbackInitial}
                </AvatarFallback>
              </Avatar>
              
              {verified && (
                <div className="absolute bottom-2 right-2 flex size-8 md:size-10 items-center justify-center rounded-full bg-primary text-white shadow-[0_4px_12px_rgba(225,29,72,0.4)] ring-4 ring-[#0D1117]">
                  <BadgeCheck className="size-5 md:size-6" />
                </div>
              )}
            </div>

            {/* Identity & Bio */}
            <div className="flex-1 min-w-0 space-y-4">
              <div className="space-y-1">
                <h1 className="text-3xl md:text-5xl font-black italic tracking-tighter uppercase text-white leading-tight">
                  {displayName}
                </h1>
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-3">
                  {handleClean ? (
                    <span className="text-lg font-bold text-primary tracking-tight">@{handleClean}</span>
                  ) : (
                    <span className="text-sm font-medium text-slate-500 italic">No handle set</span>
                  )}
                  
                  {/* Rating Pill + Home Base */}
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20">
                      <span className="text-xs font-black text-amber-400">{ratingValue?.toFixed(1) || "0.0"}</span>
                      <StarRating value={ratingValue ?? 0} size={10} className="text-amber-400" />
                      <span className="text-[10px] font-bold text-amber-500/60 tabular-nums">({ratingN})</span>
                    </div>
                    
                    {homeBase && (
                      <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20">
                        <MapPin className="size-3 text-blue-400" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-blue-400">{homeBase}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {bioText ? (
                <p className="max-w-2xl text-base md:text-lg font-medium text-slate-300 leading-relaxed italic">
                  "{bioText}"
                </p>
              ) : (
                <p className="text-sm font-medium text-slate-500 italic uppercase tracking-widest opacity-60">Athlete at Large</p>
              )}

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 pt-2">
                <Button 
                  onClick={onAbout}
                  className="rounded-2xl bg-white/[0.03] border border-white/10 text-white hover:bg-white/[0.08] font-bold uppercase tracking-widest text-[10px] h-10 px-6"
                >
                  <Info className="mr-2 size-3.5" /> About
                </Button>
                <Button 
                  onClick={onShare}
                  className="rounded-2xl bg-white/[0.03] border border-white/10 text-white hover:bg-white/[0.08] font-bold uppercase tracking-widest text-[10px] h-10 px-6"
                >
                  <Share2 className="mr-2 size-3.5" /> Share
                </Button>
                {!isOwnProfile && (
                  <Button 
                    variant="ghost"
                    className="rounded-2xl bg-primary/10 text-primary hover:bg-primary hover:text-white transition-all font-black uppercase tracking-widest text-[10px] h-10 px-6 group"
                  >
                    Follow <ChevronRight className="ml-1 size-3.5 group-hover:translate-x-1 transition-transform" />
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Metrics Strip */}
          <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-3xl border border-white/[0.05] bg-white/[0.02] p-5 transition-all hover:bg-white/[0.04]">
              <div className="flex items-center gap-2 mb-3">
                <div className="size-7 rounded-xl bg-blue-500/10 flex items-center justify-center">
                  <Play className="size-3.5 text-blue-500 fill-current" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Games</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-black italic tracking-tighter text-white uppercase">{games}</span>
                <span className="text-[10px] font-bold text-blue-500/60 uppercase">Played</span>
              </div>
            </div>

            <div className="rounded-3xl border border-white/[0.05] bg-white/[0.02] p-5 transition-all hover:bg-white/[0.04]">
              <div className="flex items-center gap-2 mb-3">
                <div className="size-7 rounded-xl bg-rose-500/10 flex items-center justify-center">
                  <Users className="size-3.5 text-rose-500" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Network</span>
              </div>
              <div className="flex items-baseline gap-3">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-black italic tracking-tighter text-white uppercase">{followers}</span>
                  <span className="text-[9px] font-bold text-rose-500/60 uppercase tracking-tighter">Followers</span>
                </div>
                <div className="w-px h-4 bg-white/10 self-center" />
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-black italic tracking-tighter text-white uppercase">{following}</span>
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter">Following</span>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-white/[0.05] bg-white/[0.02] p-5 transition-all hover:bg-white/[0.04]">
              <div className="flex items-center gap-2 mb-3">
                <div className="size-7 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Award className="size-3.5 text-primary" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Reputation</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-black italic tracking-tighter text-white uppercase">
                  {formatReputation(ratingValue)}
                </span>
                <span className="text-[10px] font-bold text-primary/60 uppercase">Rating</span>
              </div>
            </div>

            <div className="rounded-3xl border border-white/[0.05] bg-white/[0.02] p-5 transition-all hover:bg-white/[0.04]">
              <div className="flex items-center gap-2 mb-3">
                <div className="size-7 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                  <Zap className="size-3.5 text-emerald-500" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Power</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-black italic tracking-tighter text-white uppercase">LVL 1</span>
              </div>
            </div>
          </div>

          {/* Performance Highlights (Mini Badges) */}
          {visibleMetricList.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2 justify-center md:justify-start">
              {visibleMetricList.map((m) => (
                <div key={m.id} className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-white/[0.03] border border-white/5">
                  <Zap className="size-3 text-primary fill-current" />
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{m.label}</span>
                  <span className="text-xs font-black text-white">{m.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
