import { useEffect, useMemo, useState } from "react";
import { Camera, Flag, Trash2 } from "lucide-react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "../ui/carousel";
import { formatPhotoCredit, shouldLoadSlide } from "../../lib/venuePhotos";
import type { GalleryPhoto } from "../../lib/venuePhotos";

type Props = {
  photos: GalleryPhoto[];
  /** Shown when the gallery is empty or every slide failed. */
  fallbackEmoji: string;
  title: string;
  loading?: boolean;
  onAddPhoto?: () => void;
  onDeletePhoto?: (photoId: string) => void;
  onReportPhoto?: (photoId: string) => void;
};

/**
 * Venue photo gallery.
 *
 * Two behaviours here are load-bearing rather than cosmetic:
 *
 *  - Only the active slide and its neighbours render a real <img>. Every Google
 *    slide is a billed Photo API call on a cold CDN, so eagerly mounting six
 *    would cost six fetches for someone who never swipes.
 *  - A slide whose image fails is REMOVED, not left broken. Google photo
 *    references go stale and the proxy then 404/502s; dropping the slide keeps
 *    the gallery honest instead of showing a torn-image icon.
 */
export function VenuePhotoCarousel({
  photos,
  fallbackEmoji,
  title,
  loading = false,
  onAddPhoto,
  onDeletePhoto,
  onReportPhoto,
}: Props) {
  const [api, setApi] = useState<CarouselApi>();
  const [active, setActive] = useState(0);
  const [failed, setFailed] = useState<Set<string>>(new Set());

  // A new venue's gallery must not inherit the previous one's failures.
  useEffect(() => {
    setFailed(new Set());
    setActive(0);
  }, [photos.map((p) => p.key).join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!api) return;
    const onSelect = () => setActive(api.selectedScrollSnap());
    onSelect();
    api.on("select", onSelect);
    return () => {
      api.off("select", onSelect);
    };
  }, [api]);

  const visible = useMemo(() => photos.filter((p) => !failed.has(p.key)), [photos, failed]);

  const markFailed = (key: string) =>
    setFailed((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });

  const frame =
    "relative aspect-[16/9] overflow-hidden rounded-xl bg-gradient-to-br from-emerald-900/40 via-slate-900 to-violet-900/30";

  if (visible.length === 0) {
    return (
      <div className="mx-4">
        <div className={frame}>
          {loading ? (
            <div className="absolute inset-0 animate-pulse bg-white/5" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-3xl opacity-80" aria-hidden>
              {fallbackEmoji}
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0A0F1C] via-transparent to-transparent" />
        </div>
        {onAddPhoto && !loading ? (
          <button
            type="button"
            onClick={onAddPhoto}
            className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-medium text-slate-200 transition-colors hover:border-emerald-500/40 hover:bg-white/[0.06] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
          >
            <Camera className="h-4 w-4 text-emerald-400" aria-hidden />
            Add the first photo
          </button>
        ) : null}
      </div>
    );
  }

  const current = visible[Math.min(active, visible.length - 1)];

  return (
    <div className="mx-4">
      <Carousel setApi={setApi} opts={{ loop: visible.length > 1 }} className="w-full">
        <CarouselContent className="-ml-0">
          {visible.map((photo, i) => (
            <CarouselItem key={photo.key} className="pl-0">
              <div className={frame}>
                {shouldLoadSlide(i, active) ? (
                  <img
                    src={photo.url}
                    alt={photo.caption?.trim() || `Photo of ${title}`}
                    className="absolute inset-0 h-full w-full object-cover"
                    loading={i === 0 ? "eager" : "lazy"}
                    decoding="async"
                    // Drop the slide rather than render a broken image box.
                    onError={() => markFailed(photo.key)}
                  />
                ) : (
                  <div className="absolute inset-0 bg-white/[0.03]" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-[#0A0F1C] via-transparent to-transparent" />
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>

        {visible.length > 1 ? (
          <>
            <CarouselPrevious className="left-2 h-7 w-7 border-white/20 bg-black/40 text-white hover:bg-black/60" />
            <CarouselNext className="right-2 h-7 w-7 border-white/20 bg-black/40 text-white hover:bg-black/60" />
          </>
        ) : null}
      </Carousel>

      {visible.length > 1 ? (
        <div className="mt-1.5 flex items-center justify-center gap-1.5" aria-hidden>
          {visible.map((photo, i) => (
            <span
              key={photo.key}
              className={
                i === active
                  ? "h-1.5 w-4 rounded-full bg-emerald-400/80 transition-all"
                  : "h-1.5 w-1.5 rounded-full bg-white/25 transition-all"
              }
            />
          ))}
        </div>
      ) : null}

      <div className="mt-1 flex items-start justify-between gap-2">
        <p className="min-w-0 text-[10px] leading-snug text-slate-500">
          {current?.caption ? <span className="text-slate-400">{current.caption} · </span> : null}
          {current ? (
            current.creditUrl ? (
              <a
                href={current.creditUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-dotted underline-offset-2 hover:text-slate-300"
              >
                {formatPhotoCredit(current)}
              </a>
            ) : (
              formatPhotoCredit(current)
            )
          ) : null}
        </p>

        <div className="flex shrink-0 items-center gap-1">
          {current?.isMine && current.photoId && onDeletePhoto ? (
            <button
              type="button"
              onClick={() => onDeletePhoto(current.photoId!)}
              className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-rose-300 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
              aria-label="Delete your photo"
              title="Delete your photo"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          ) : null}
          {/* Reporting only applies to member uploads — Google and Wikimedia have their own channels. */}
          {current?.source === "member" && !current.isMine && current.photoId && onReportPhoto ? (
            <button
              type="button"
              onClick={() => onReportPhoto(current.photoId!)}
              className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-amber-300 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
              aria-label="Report this photo"
              title="Report this photo"
            >
              <Flag className="h-3.5 w-3.5" />
            </button>
          ) : null}
          {onAddPhoto ? (
            <button
              type="button"
              onClick={onAddPhoto}
              className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-emerald-300 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
              aria-label="Add a photo"
              title="Add a photo"
            >
              <Camera className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
