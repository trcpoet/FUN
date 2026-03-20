import { UserPlus, MessageCircle, Trophy, Share2, Info } from "lucide-react";
import { Button } from "../ui/button";
import { cn } from "../ui/utils";

type Props = {
  isOwnProfile?: boolean;
  onAbout: () => void;
  onShare?: () => void;
  onFollow?: () => void;
  onMessage?: () => void;
  onInvite?: () => void;
  className?: string;
};

export function ProfileActionRow({
  isOwnProfile = true,
  onAbout,
  onShare,
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
    <div className={cn("flex gap-2", className)}>
      <Button
        type="button"
        size="sm"
        className="flex-1 h-10 border-white/12 bg-white/[0.06] text-slate-100 hover:bg-white/[0.1]"
        onClick={onAbout}
      >
        <Info className="size-4 mr-1.5 opacity-90" />
        About
      </Button>
      {onShare && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-10 px-4 border-white/12 bg-white/[0.04] text-slate-200"
          onClick={onShare}
        >
          <Share2 className="size-4 mr-1.5" />
          Share
        </Button>
      )}
    </div>
  );
}
