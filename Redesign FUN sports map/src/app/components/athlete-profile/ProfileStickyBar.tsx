import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Button } from "../ui/button";
import { ChevronLeft, Pencil, Share2 } from "lucide-react";
import { cn } from "../ui/utils";

type Props = {
  visible: boolean;
  displayName: string;
  avatarUrl: string | null;
  fallbackInitial: string;
  onBack: () => void;
  onOpenSettings: () => void;
  onShare?: () => void;
  /** Match main profile column width on web */
  containerClassName?: string;
  className?: string;
};

export function ProfileStickyBar({
  visible,
  displayName,
  avatarUrl,
  fallbackInitial,
  onBack,
  onOpenSettings,
  onShare,
  containerClassName,
  className,
}: Props) {
  return (
    <header
      className={cn(
        "fixed top-0 left-0 right-0 z-[60] border-b border-white/[0.08] bg-[#080c14]/88 backdrop-blur-xl transition-all duration-200 ease-out",
        visible ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0 pointer-events-none",
        className,
      )}
    >
      <div
        className={cn(
          "mx-auto flex w-full max-w-lg items-center gap-2 px-3 py-2.5 md:max-w-6xl md:px-10",
          containerClassName,
        )}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-slate-300 shrink-0 -ml-1"
          onClick={onBack}
          aria-label="Back to map"
        >
          <ChevronLeft className="size-5" />
        </Button>
        <Avatar className="size-8 shrink-0 rounded-full border border-white/10">
          {avatarUrl?.trim() ? <AvatarImage src={avatarUrl} alt="" className="object-cover" /> : null}
          <AvatarFallback className="rounded-full bg-slate-800 text-xs text-slate-200">{fallbackInitial}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white truncate leading-tight">{displayName}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-slate-300 shrink-0"
          onClick={onOpenSettings}
          aria-label="Profile settings"
        >
          <Pencil className="size-4" />
        </Button>
        {onShare && (
          <Button type="button" variant="ghost" size="icon" className="text-slate-400 shrink-0" onClick={onShare} aria-label="Share">
            <Share2 className="size-4" />
          </Button>
        )}
      </div>
    </header>
  );
}
