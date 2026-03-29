import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { fetchDiscoveredAthletes } from "../../../lib/api";
import type { ProfileSearchRow } from "../../../lib/supabase";
import { sportEmoji } from "../../../lib/sportVisuals";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Button } from "../ui/button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "../ui/carousel";
import { cn } from "../ui/utils";
import { readFollowedIds, writeFollowedIds } from "../../../lib/localFollows";

function requestGeo(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  });
}

type Props = {
  /** When true, panel expands above Stories with animation. */
  expanded: boolean;
  onClose: () => void;
  excludeUserId: string;
  primarySports: string[];
};

export function DiscoveredPeopleCarousel({ expanded, onClose, excludeUserId, primarySports }: Props) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ProfileSearchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [followed, setFollowed] = useState<Set<string>>(() => readFollowedIds());
  const sportsSig = useMemo(() => primarySports.join("|"), [primarySports]);
  const primarySportsRef = useRef(primarySports);
  primarySportsRef.current = primarySports;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const geo = await requestGeo();
      const data = await fetchDiscoveredAthletes({
        excludeUserId,
        lat: geo?.lat ?? null,
        lng: geo?.lng ?? null,
        primarySports: primarySportsRef.current,
        limit: 14,
      });
      setRows(data);
    } finally {
      setLoading(false);
    }
  }, [excludeUserId, sportsSig]);

  useEffect(() => {
    if (!expanded) return;
    void load();
  }, [expanded, load]);

  const toggleFollow = (id: string) => {
    setFollowed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      writeFollowedIds(next);
      return next;
    });
  };

  return (
    <div
      className={cn(
        "grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none",
        expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
      )}
    >
      <div className="min-h-0 overflow-hidden">
        <div
          className={cn(
            "rounded-2xl border border-white/[0.06] transition-opacity duration-200 motion-reduce:transition-none",
            expanded ? "opacity-100" : "opacity-0 pointer-events-none",
          )}
        >
          <div className="relative px-2 py-3 sm:px-3">
            {loading ? (
              <div className="flex h-36 items-center justify-center text-sm text-slate-500">Loading…</div>
            ) : rows.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-slate-500">
                No profiles yet. Enable location or add sports in your profile.
              </p>
            ) : (
              <Carousel opts={{ align: "start", loop: false }} className="relative w-full">
                <CarouselContent className="-ml-2 md:-ml-3">
                  {rows.map((p) => {
                    const name = p.display_name?.trim() || "Player";
                    const initial = name[0]?.toUpperCase() ?? "?";
                    const isFollowing = followed.has(p.profile_id);
                    const dist =
                      p.distance_km != null && !Number.isNaN(p.distance_km)
                        ? `${p.distance_km < 1 ? (p.distance_km * 1000).toFixed(0) + " m" : p.distance_km.toFixed(1) + " km"}`
                        : null;
                    return (
                      <CarouselItem
                        key={p.profile_id}
                        className="basis-[48%] pl-2 sm:basis-[36%] sm:pl-3 md:basis-[26%] lg:basis-[20%]"
                      >
                        <div className="flex h-full flex-col rounded-2xl border border-white/[0.1] p-2.5 sm:p-3">
                          <button
                            type="button"
                            className="text-left"
                            onClick={() => {
                              onClose();
                              navigate(`/athlete/${p.profile_id}`);
                            }}
                          >
                            <Avatar className="mx-auto size-12 border border-white/10 sm:size-14">
                              {p.avatar_url?.trim() ? (
                                <AvatarImage src={p.avatar_url.trim()} alt="" className="object-cover" />
                              ) : null}
                              <AvatarFallback className="bg-slate-800 text-base font-semibold text-slate-300 sm:text-lg">
                                {initial}
                              </AvatarFallback>
                            </Avatar>
                            <p className="mt-1.5 line-clamp-1 text-center text-xs font-semibold text-white sm:text-sm">
                              {name}
                            </p>
                            {p.handle ? (
                              <p className="line-clamp-1 text-center font-mono text-[10px] text-slate-500 sm:text-[11px]">
                                @{p.handle.replace(/^@/, "")}
                              </p>
                            ) : null}
                            {p.city ? (
                              <p className="mt-0.5 line-clamp-1 text-center text-[9px] text-slate-500 sm:text-[10px]">
                                {p.city}
                              </p>
                            ) : null}
                            {dist ? (
                              <p className="text-center text-[9px] tabular-nums text-slate-600 sm:text-[10px]">{dist}</p>
                            ) : null}
                            {p.favorite_sport?.trim() ? (
                              <p
                                className="mt-0.5 flex items-center justify-center text-base leading-none sm:text-lg"
                                title={p.favorite_sport}
                              >
                                <span aria-hidden>{sportEmoji(p.favorite_sport.trim())}</span>
                              </p>
                            ) : null}
                          </button>
                          <Button
                            type="button"
                            size="sm"
                            className={cn(
                              "mt-2 h-7 w-full text-[11px] sm:h-8 sm:text-xs",
                              isFollowing
                                ? "border-white/15 bg-white/[0.06] text-slate-300 hover:bg-white/[0.08]"
                                : "bg-emerald-600 text-white hover:bg-emerald-700",
                            )}
                            onClick={() => toggleFollow(p.profile_id)}
                          >
                            {isFollowing ? "Following" : "Follow"}
                          </Button>
                        </div>
                      </CarouselItem>
                    );
                  })}
                </CarouselContent>
                <CarouselPrevious className="left-0 top-[38%] z-10 size-7 rounded-full border border-white/20 bg-black/35 text-white backdrop-blur-sm sm:size-8" />
                <CarouselNext className="right-0 top-[38%] z-10 size-7 rounded-full border border-white/20 bg-black/35 text-white backdrop-blur-sm sm:size-8" />
              </Carousel>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
