import { type ChatTrust, trustBadgeLabel } from "../../../hooks/useChatTrust";
import { cn } from "../ui/utils";

/**
 * Who this person is to you, in one word.
 *
 * Lifted out of `GameMessengerSheet` unchanged so the roster, the message bubble
 * and (later) the read-receipt row cannot disagree about what a "friend" looks
 * like. Renders nothing for yourself — you know who you are — and nothing when
 * the tier has no label.
 */
export function TrustBadge({ trust }: { trust: ChatTrust | undefined }) {
  const label = trustBadgeLabel(trust);
  if (!label) return null;
  if (trust === "self") return null;
  const tone = (() => {
    switch (trust) {
      case "stranger":
        return "border-slate-500/40 bg-slate-700/30 text-slate-300";
      case "host":
        return "border-amber-400/40 bg-amber-500/15 text-amber-200";
      case "friend":
      case "mutual":
        return "border-emerald-400/40 bg-emerald-500/15 text-emerald-200";
      default:
        return "border-white/10 bg-white/5 text-slate-300";
    }
  })();
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-1.5 py-[1px] text-[9px] font-semibold uppercase tracking-wide",
        tone,
      )}
      aria-label={label}
      title={label}
    >
      {label}
    </span>
  );
}
