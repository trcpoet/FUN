import { Film, ImageIcon } from "lucide-react";
import { cn } from "../ui/utils";

type Props = {
  onPhoto: () => void;
  onVideo: () => void;
  /** Opens the “share an update” / status flow when the placeholder or that path is used. */
  onStatus: () => void;
  className?: string;
};

export function ProfileComposerCard({ onPhoto, onVideo, onStatus, className }: Props) {
  return (
    <div className={cn("rounded-xl border border-white/[0.08] bg-[#161B22] p-3 sm:p-4", className)}>
      <button
        type="button"
        onClick={onStatus}
        className="min-h-[2.75rem] w-full rounded-full border border-white/[0.06] bg-[#0D1117]/80 px-4 py-2 text-left text-sm text-slate-500 transition-colors hover:border-cyan-500/25 hover:text-slate-400 md:rounded-lg"
      >
        Share an update…
      </button>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-3">
        <div className="flex flex-wrap gap-1 text-slate-400 sm:gap-2 md:text-[#00F5FF]">
          <button
            type="button"
            onClick={onPhoto}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide transition-colors hover:bg-white/[0.04] md:text-[#00F5FF]"
          >
            <ImageIcon className="size-4" />
            Photo
          </button>
          <button
            type="button"
            onClick={onVideo}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide transition-colors hover:bg-white/[0.04] md:text-[#00F5FF]"
          >
            <Film className="size-4" />
            Video
          </button>
        </div>
      </div>
    </div>
  );
}
