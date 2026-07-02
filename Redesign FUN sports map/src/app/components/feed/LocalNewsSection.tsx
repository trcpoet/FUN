import { formatDistanceToNow } from "date-fns";
import { ExternalLink, Loader2, Newspaper, Play } from "lucide-react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { cn } from "../ui/utils";
import type { LocalNewsItem } from "../../../lib/api";

function relTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return formatDistanceToNow(d, { addSuffix: true });
}

function categoryLabel(category: string | null): string {
  if (!category) return "News";
  return category.charAt(0).toUpperCase() + category.slice(1);
}

type LocalNewsSectionProps = {
  items: LocalNewsItem[];
  loading: boolean;
  loadingMore?: boolean;
  error: Error | null;
  locationLabel?: string | null;
  available?: number;
  onLoadMore?: () => void;
};

function NewsCard({ item }: { item: LocalNewsItem }) {
  const time = relTime(item.publishDate);
  const author = item.authors[0] ?? null;
  const byline = [author, time].filter(Boolean).join(" · ");

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "group flex gap-3 rounded-[24px] border border-white/[0.08] bg-white/[0.02] p-3 transition-all",
        "hover:border-cyan-500/30 hover:bg-white/[0.04]",
      )}
    >
      <div className="relative size-16 shrink-0 overflow-hidden rounded-2xl bg-white/5">
        {item.image ? (
          <img
            src={item.image}
            alt=""
            className="size-full object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-cyan-400/40">
            <Newspaper className="size-6" aria-hidden />
          </div>
        )}
        {item.video ? (
          <div
            className="absolute inset-0 flex items-center justify-center bg-black/40"
            aria-label="Video story"
          >
            <div className="flex size-7 items-center justify-center rounded-full bg-white/90 text-black">
              <Play className="size-3.5 fill-current" aria-hidden />
            </div>
          </div>
        ) : null}
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className="border-cyan-500/20 bg-cyan-500/10 text-[9px] font-bold uppercase tracking-widest text-cyan-300"
          >
            {categoryLabel(item.category)}
          </Badge>
          {byline ? (
            <span className="text-[10px] font-medium text-muted-foreground">{byline}</span>
          ) : null}
        </div>
        <h3 className="line-clamp-2 text-sm font-bold leading-snug text-white group-hover:text-cyan-100">
          {item.title}
        </h3>
        {item.summary ? (
          <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{item.summary}</p>
        ) : null}
      </div>
      <ExternalLink
        className="mt-1 size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
        aria-hidden
      />
    </a>
  );
}

function NewsSkeleton() {
  return (
    <div className="grid gap-3" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="flex gap-3 rounded-[24px] border border-white/[0.08] bg-white/[0.02] p-3 animate-pulse"
        >
          <div className="size-16 shrink-0 rounded-2xl bg-white/10" />
          <div className="flex-1 space-y-2 pt-1">
            <div className="h-2 w-16 rounded bg-white/10" />
            <div className="h-3 w-full rounded bg-white/10" />
            <div className="h-3 w-4/5 rounded bg-white/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function LocalNewsSection({
  items,
  loading,
  loadingMore = false,
  error,
  locationLabel,
  available = 0,
  onLoadMore,
}: LocalNewsSectionProps) {
  const showLoadMore = items.length > 0 && available > items.length && onLoadMore;

  // Fail quietly: if the news service errored and there's nothing (not even a
  // cached result) to show, hide the whole section rather than surfacing an
  // alarming error box in the feed.
  if (error && items.length === 0) return null;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3 px-1">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-300">
            <Newspaper className="size-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-black uppercase tracking-widest text-white">Near You</h2>
            <p className="mt-0.5 truncate text-[9px] font-semibold uppercase tracking-tight text-muted-foreground">
              {locationLabel
                ? `Sports headlines near ${locationLabel}`
                : "Sports headlines · 25 km"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {available > items.length && items.length > 0 ? (
            <Badge
              variant="outline"
              className="border-white/10 bg-white/5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground"
            >
              {available} stories
            </Badge>
          ) : null}
          {loading ? <Loader2 className="size-4 animate-spin text-cyan-400" aria-label="Loading news" /> : null}
        </div>
      </div>

      {loading && items.length === 0 ? (
        <NewsSkeleton />
      ) : error ? (
        <div className="rounded-[24px] border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-100/90">
          Could not load local news. Try again later.
        </div>
      ) : items.length === 0 ? (
        <p className="px-1 text-xs text-slate-500">No sports headlines found for this area right now.</p>
      ) : (
        <ul className="grid gap-3">
          {items.map((item) => (
            <li key={item.id}>
              <NewsCard item={item} />
            </li>
          ))}
        </ul>
      )}

      {showLoadMore ? (
        <div className="flex justify-center px-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loadingMore}
            onClick={onLoadMore}
            className="rounded-full border-white/10 bg-white/5 text-xs font-bold uppercase tracking-widest text-white hover:bg-white/10"
          >
            {loadingMore ? (
              <>
                <Loader2 className="mr-2 size-3.5 animate-spin" aria-hidden />
                Loading…
              </>
            ) : (
              "Show more"
            )}
          </Button>
        </div>
      ) : null}

      <p className="px-1 text-[10px] text-muted-foreground/70">
        Sports headlines via{" "}
        <a
          href="https://worldnewsapi.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-white/20 hover:text-white"
        >
          World News API
        </a>
        . Opens publisher sites in a new tab.
      </p>
    </section>
  );
}
