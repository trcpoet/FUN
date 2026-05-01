import { MessageCircle, MapPin } from "lucide-react";
import { cn } from "../ui/utils";
import { Badge } from "../ui/badge";
import type { UnifiedFeedItem } from "../../../lib/api";

export function visibilityChip(v: string | null | undefined): string {
  if (!v) return "Public";
  if (v === "friends" || v === "friends_only") return "Friends";
  if (v === "private" || v === "invite_only") return "Private";
  return "Public";
}

export function NoteFeedCard(props: {
  item: Extract<UnifiedFeedItem, { kind: "note" }>;
  onOpen: () => void;
}) {
  const { item } = props;
  return (
    <article
      className={cn(
        "group relative overflow-hidden transition-all duration-300",
        "rounded-3xl border border-white/[0.08] bg-card/40 backdrop-blur-sm",
        "hover:border-cyan-400/25 hover:shadow-[0_0_34px_-14px_rgba(34,211,238,0.35)]",
      )}
    >
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-300 border border-cyan-400/10">
              <MapPin className="size-4" />
            </div>
            <div className="space-y-0.5">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Map note</p>
              <p className="text-xs font-semibold text-slate-200 line-clamp-1">Pinned nearby</p>
            </div>
          </div>
          <Badge className="bg-black/40 backdrop-blur-md border-white/10 text-[10px] font-bold uppercase tracking-wider py-0.5 px-2.5">
            {visibilityChip(item.visibility)}
          </Badge>
        </div>

        <p className="text-[15px] text-slate-200 leading-[1.6] font-medium whitespace-pre-wrap break-words">
          {item.body}
        </p>

        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={props.onOpen}
            className="group/btn inline-flex items-center gap-2 text-slate-400 hover:text-cyan-300 transition-colors"
            aria-label="Open note thread"
          >
            <div className="flex size-8 items-center justify-center rounded-full bg-white/[0.03] group-hover/btn:bg-cyan-500/10 transition-colors">
              <MessageCircle className="size-4 transition-all" />
            </div>
            <span className="text-xs font-bold tabular-nums tracking-tight">{item.comment_count ?? 0}</span>
          </button>
          <span className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">
            Tap to reply
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={props.onOpen}
        className="absolute inset-0"
        aria-label="Open note"
      />
    </article>
  );
}

export function GameFeedCard(props: {
  item: Extract<UnifiedFeedItem, { kind: "game" }>;
  onOpenOnMap?: () => void;
}) {
  const { item } = props;
  return (
    <article
      className={cn(
        "group relative overflow-hidden transition-all duration-300",
        "rounded-3xl border border-white/[0.08] bg-card/40 backdrop-blur-sm",
        "hover:border-violet-400/25 hover:shadow-[0_0_30px_-12px_rgba(124,58,237,0.35)]",
      )}
    >
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-0.5 min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Game</p>
            <p className="text-sm font-bold text-white truncate">
              {item.title?.trim() || "Pickup game"}
            </p>
          </div>
          <Badge className="bg-black/40 backdrop-blur-md border-white/10 text-[10px] font-bold uppercase tracking-wider py-0.5 px-2.5">
            {item.sport?.trim() || "Sport"}
          </Badge>
        </div>

        {item.body?.trim() ? (
          <p className="text-sm text-slate-300 leading-relaxed line-clamp-3 italic">
            “{item.body.trim()}”
          </p>
        ) : (
          <p className="text-xs text-slate-500">No description yet.</p>
        )}

        {props.onOpenOnMap ? (
          <button
            type="button"
            onClick={props.onOpenOnMap}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-slate-300 hover:bg-white/[0.06] hover:text-white transition-colors"
          >
            <MapPin className="size-3.5" />
            View on map
          </button>
        ) : null}
      </div>
    </article>
  );
}

export function StatusFeedCard(props: { item: Extract<UnifiedFeedItem, { kind: "status" }> }) {
  const { item } = props;
  return (
    <article
      className={cn(
        "group relative overflow-hidden transition-all duration-300",
        "rounded-3xl border border-white/[0.08] bg-card/40 backdrop-blur-sm",
        "hover:border-primary/25 hover:shadow-[0_0_30px_-12px_rgba(225,29,72,0.25)]",
      )}
    >
      <div className="p-4 space-y-2">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
          Status
        </p>
        <p className="text-[15px] text-slate-200 leading-[1.6] font-medium italic">
          “{item.body}”
        </p>
      </div>
    </article>
  );
}

