import { UserPlus, MessageCircle, Trophy, Share2, Info, Plus } from "lucide-react";
import { Button } from "../ui/button";
import { cn } from "../ui/utils";

type Props = {
  isOwnProfile?: boolean;
  /** Used on other users’ profiles (own profile uses About in the hero next to the handle). */
  onAbout?: () => void;
  onShare?: () => void;
  /** Toggles discover carousel (own profile). */
  onDiscoverPeople?: () => void;
  /** When true, + button shows expanded state. */
  discoverExpanded?: boolean;
  /** For other users' profiles: whether you already follow this user. */
  isFollowing?: boolean;
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
  isFollowing = false,
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
          className={cn(
            "flex-1 min-w-[100px] h-10 font-semibold",
            isFollowing
              ? "border-white/15 bg-white/[0.06] text-slate-300 hover:bg-white/[0.08]"
              : "bg-emerald-600 hover:bg-emerald-500 text-white",
          )}
          onClick={onFollow}
        >
          <UserPlus className="size-4 mr-1.5" />
          {isFollowing ? "Following" : "Follow"}
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
        {onAbout ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-10 border-white/12 bg-white/[0.04]"
            onClick={onAbout}
          >
            <Info className="size-4 mr-1.5" />
            About
          </Button>
        ) : null}
        {onShare && (
          <Button type="button" variant="ghost" size="icon" className="h-10 text-slate-400" onClick={onShare} aria-label="Share">
            <Share2 className="size-4" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className={cn("flex items-center justify-end", className)}>
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
