import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { cn } from "../ui/utils";

type Props = {
  count?: number | null;
  avatarUrls?: string[];
  primarySports?: string[];
  className?: string;
};

export function PlayedWithRow({ count, avatarUrls = [], primarySports = [], className }: Props) {
  const urls = avatarUrls.slice(0, 4);
  const pads = Math.max(0, 3 - urls.length);
  const sportLine =
    primarySports.length > 0 ? `Often plays: ${primarySports.slice(0, 2).join(" · ")}` : null;

  return (
    <div className={cn("flex items-center gap-3 py-2", className)}>
      <div className="flex -space-x-2 shrink-0">
        {urls.map((src, i) => (
          <Avatar key={i} className="size-9 border-2 border-[#080c14] ring-0">
            <AvatarImage src={src} alt="" className="object-cover" />
            <AvatarFallback className="bg-slate-700 text-[10px] text-slate-400">?</AvatarFallback>
          </Avatar>
        ))}
        {Array.from({ length: pads }).map((_, i) => (
          <div
            key={`p-${i}`}
            className="size-9 rounded-full border-2 border-[#080c14] bg-white/[0.06] ring-0"
            aria-hidden
          />
        ))}
      </div>
      <div className="min-w-0 flex-1">
        {count != null && count > 0 ? (
          <p className="text-sm text-slate-200">
            <span className="font-semibold text-white">{count} mutuals</span>
            <span className="text-slate-500"> · from games</span>
          </p>
        ) : (
          <p className="text-sm text-slate-500">Play pickup games to build your crew here.</p>
        )}
        {sportLine && <p className="text-xs text-slate-500 mt-0.5 truncate">{sportLine}</p>}
      </div>
    </div>
  );
}
