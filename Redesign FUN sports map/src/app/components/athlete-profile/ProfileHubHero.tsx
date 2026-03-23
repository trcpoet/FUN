import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { BadgeCheck, Info, Share2 } from "lucide-react";
import { Button } from "../ui/button";
import { cn } from "../ui/utils";
import type { PerformanceMetricEntry } from "../../../lib/athleteProfile";
import { visibleMetrics } from "../../../lib/athleteProfile";

type Props = {
  displayName: string;
  handle: string | null;
  avatarUrl: string | null;
  fallbackInitial: string;
  verified: boolean;
  bio?: string | null;
  performanceMetrics?: PerformanceMetricEntry[];
  primarySports?: string[];
  onAbout?: () => void;
  onShare?: () => void;
  className?: string;
};

function cleanHandle(h: string) {
  return h.replace(/^@/, "").trim();
}

export function ProfileHubHero({
  displayName,
  handle,
  avatarUrl,
  fallbackInitial,
  verified,
  bio,
  performanceMetrics = [],
  primarySports = [],
  onAbout,
  onShare,
  className,
}: Props) {
  const bioText = bio?.trim() ?? "";
  const handleClean = handle?.trim() ? cleanHandle(handle) : "";
  const visibleMetricList = visibleMetrics(performanceMetrics, primarySports);

  return (
    <div className={cn(className)}>
      {/* Mobile: display name, handle, bio, metrics in one card */}
      <section className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#161B22] p-4 md:hidden">
        <div className="flex items-start gap-3">
          <div className="relative shrink-0">
            <Avatar className="size-[4.5rem] rounded-full border-2 border-[#00F5FF]/50 shadow-lg ring-2 ring-black/20">
              {avatarUrl?.trim() ? (
                <AvatarImage src={avatarUrl} alt="" className="object-cover" />
              ) : null}
              <AvatarFallback className="rounded-full bg-slate-800 text-2xl font-bold text-slate-200">
                {fallbackInitial}
              </AvatarFallback>
            </Avatar>
            {verified ? (
              <span
                className="absolute bottom-0 right-0 flex size-6 items-center justify-center rounded-full bg-[#00F5FF] shadow-md ring-2 ring-[#161B22]"
                title="Verified athlete"
              >
                <BadgeCheck className="size-3.5 text-[#0D1117]" aria-hidden />
              </span>
            ) : null}
          </div>

          <div className="min-w-0 flex-1 space-y-0.5">
            <h1 className="truncate text-lg font-bold leading-tight tracking-tight text-white">
              {displayName}
            </h1>
            <div className="flex min-w-0 items-center gap-2">
              <div className="min-w-0 flex-1">
                {handleClean ? (
                  <p className="font-mono text-sm leading-snug text-[#00F5FF]/90">@{handleClean}</p>
                ) : (
                  <p className="text-sm leading-snug text-slate-500">Add a handle in settings</p>
                )}
              </div>
              {(onShare || onAbout) && (
                <div className="flex shrink-0 flex-row items-center justify-center gap-1">
                  {onShare ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="size-9 shrink-0 border-white/12 bg-white/[0.04] text-slate-200"
                      onClick={onShare}
                      aria-label="Share profile"
                    >
                      <Share2 className="size-4" />
                    </Button>
                  ) : null}
                  {onAbout ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="size-9 shrink-0 border-white/12 bg-white/[0.04] text-slate-200"
                      onClick={onAbout}
                      aria-label="About"
                    >
                      <Info className="size-4" />
                    </Button>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 border-t border-white/[0.08] pt-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Bio</p>
          {bioText ? (
            <p className="mt-2 text-sm leading-relaxed text-slate-200">{bioText}</p>
          ) : (
            <p className="mt-2 text-sm text-slate-500">No bio yet — tell people who you are in Edit profile.</p>
          )}
        </div>

        <div className="mt-4 border-t border-white/[0.08] pt-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Metrics</p>
          {visibleMetricList.length === 0 ? (
            <p className="mt-2 rounded-lg border border-dashed border-white/[0.1] bg-[#0D1117]/40 px-3 py-3 text-center text-xs text-slate-500">
              Add performance metrics in <span className="text-slate-400">Edit profile</span>.
            </p>
          ) : (
            <div className="mt-2 grid grid-cols-3 gap-2">
              {visibleMetricList.map((m) => (
                <div
                  key={m.id}
                  className="min-w-0 rounded-lg border border-white/[0.08] bg-[#0D1117]/50 px-2 py-2"
                >
                  <p className="text-[9px] font-medium uppercase tracking-wider text-slate-500">{m.label}</p>
                  <p className="mt-0.5 truncate text-sm font-semibold tabular-nums text-[#00F5FF]">{m.value}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Desktop: avatar + identity (no cover banner) */}
      <section className="relative hidden overflow-hidden rounded-2xl border border-white/[0.06] bg-[#161B22] md:block">
        <div className="relative z-10 flex flex-col gap-4 px-4 pb-5 pt-4 md:flex-row md:items-start md:gap-6">
          <div className="flex min-w-0 flex-1 items-start gap-4">
            <div className="relative shrink-0">
              <Avatar className="size-24 rounded-full border-4 border-[#0D1117] shadow-xl ring-2 ring-white/10 sm:size-28 md:size-32">
                {avatarUrl?.trim() ? (
                  <AvatarImage src={avatarUrl} alt="" className="object-cover" />
                ) : null}
                <AvatarFallback className="rounded-full bg-slate-800 text-2xl font-bold text-slate-200">
                  {fallbackInitial}
                </AvatarFallback>
              </Avatar>
              {verified ? (
                <span
                  className="absolute bottom-0.5 right-0.5 flex size-7 items-center justify-center rounded-full bg-[#00F5FF] shadow-md ring-2 ring-[#0D1117]"
                  title="Verified athlete"
                >
                  <BadgeCheck className="size-4 text-[#0D1117]" aria-hidden />
                </span>
              ) : null}
            </div>

            <div className="min-w-0 flex-1 space-y-0.5 pb-1">
              <h1 className="truncate text-xl font-bold leading-tight tracking-tight text-white sm:text-2xl md:text-3xl">
                {displayName}
              </h1>
              <div className="flex min-w-0 items-center gap-2">
                <div className="min-w-0 flex-1">
                  {handleClean ? (
                    <p className="font-mono text-sm leading-snug text-[#00F5FF]/90">@{handleClean}</p>
                  ) : (
                    <p className="text-sm leading-snug text-slate-500">Add a handle in settings</p>
                  )}
                </div>
                {(onShare || onAbout) && (
                  <div className="flex shrink-0 flex-row items-center justify-center gap-1">
                    {onShare ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-9 shrink-0 border-white/12 bg-white/[0.04] text-slate-200"
                        onClick={onShare}
                        aria-label="Share profile"
                      >
                        <Share2 className="size-4" />
                      </Button>
                    ) : null}
                    {onAbout ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-9 shrink-0 border-white/12 bg-white/[0.04] text-slate-200"
                        onClick={onAbout}
                        aria-label="About"
                      >
                        <Info className="size-4" />
                      </Button>
                    ) : null}
                  </div>
                )}
              </div>
              <p className="mt-3 text-[10px] font-semibold uppercase tracking-widest text-slate-500">Bio</p>
              {bioText ? (
                <p className="mt-1 max-w-xl text-sm leading-relaxed text-slate-300">{bioText}</p>
              ) : (
                <p className="mt-1 text-sm text-slate-500">No bio yet.</p>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
