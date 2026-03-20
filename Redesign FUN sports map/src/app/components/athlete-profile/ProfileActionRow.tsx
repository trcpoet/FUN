import { UserPlus, MessageCircle, Trophy, Share2, Info, Plus } from "lucide-react";
import { Button } from "../ui/button";
import { cn } from "../ui/utils";

type Props = {
  isOwnProfile?: boolean;
  onAbout: () => void;
  onShare?: () => void;
  /** Toggles discover carousel (own profile). */
  onDiscoverPeople?: () => void;
  /** When true, + button shows expanded state. */
  discoverExpanded?: boolean;
  onFollow?: () => void;
  onMessage?: () => void;
  onInvite?: () => void;
  className?: string;
};

export function ProfileActionRow({
  isOwnProfile = true,
  onAbout,
  onShare,
  onDiscoverPeople,
  discoverExpanded = false,
  onFollow,
  onMessage,
  onInvite,
  className,
}: Props) {
  if (!isOwnProfile) {
    return (
      <div className={cn("flex flex-wrap gap-2", className)}>
        <Button
          type="button"
          size="sm"
          className="flex-1 min-w-[100px] h-10 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
          onClick={onFollow}
        >
          <UserPlus className="size-4 mr-1.5" />
          Follow
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-10 border-white/15 bg-white/[0.06] text-slate-100"
          onClick={onMessage}
        >
          <MessageCircle className="size-4 mr-1.5 opacity-80" />
          Message
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-10 border-white/15 bg-white/[0.06] text-slate-100"
          onClick={onInvite}
        >
          <Trophy className="size-4 mr-1.5 opacity-80" />
          Invite
        </Button>
        <Button type="button" variant="outline" size="sm" className="h-10 border-white/12 bg-white/[0.04]" onClick={onAbout}>
          <Info className="size-4 mr-1.5" />
          About
        </Button>
        {onShare && (
          <Button type="button" variant="ghost" size="icon" className="h-10 text-slate-400" onClick={onShare} aria-label="Share">
            <Share2 className="size-4" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
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
      {onShare && (
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
      )}
      {onDiscoverPeople && (
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-pressed={discoverExpanded}
          className={cn(
            "size-9 shrink-0 border-white/12 bg-white/[0.04] text-slate-200 transition-[box-shadow,background-color,border-color] duration-200",
            discoverExpanded &&
              "border-emerald-500/45 bg-emerald-500/15 text-emerald-100 shadow-[0_0_0_1px_rgba(16,185,129,0.35)]",
          )}
          onClick={onDiscoverPeople}
          aria-label={discoverExpanded ? "Hide discover people" : "Discover people near you"}
        >
          <Plus className={cn("size-4 transition-transform duration-200", discoverExpanded && "rotate-45")} />
        </Button>
      )}
    </div>
  );
}
