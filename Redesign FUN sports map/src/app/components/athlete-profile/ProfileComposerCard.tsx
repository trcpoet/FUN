import { useState } from "react";
import { Film, ImageIcon, Send, Loader2 } from "lucide-react";
import { cn } from "../ui/utils";

type Props = {
  onPhoto: () => void;
  onVideo: () => void;
  onSubmitText: (text: string) => Promise<void>;
  className?: string;
};

export function ProfileComposerCard({ onPhoto, onVideo, onSubmitText, className }: Props) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const val = text.trim();
    if (!val || submitting) return;
    setSubmitting(true);
    try {
      await onSubmitText(val);
      setText("");
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={cn("rounded-xl border border-white/[0.08] bg-[#161B22] p-3 sm:p-4", className)}>
      <div className="relative flex w-full items-center">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleSubmit();
            }
          }}
          disabled={submitting}
          className="min-h-[2.75rem] w-full rounded-full border border-white/[0.06] bg-[#0D1117]/80 pl-4 pr-12 py-2 text-sm text-slate-200 transition-colors focus:border-emerald-500/40 focus:outline-none md:rounded-lg placeholder:text-slate-500"
          placeholder="Share an update…"
        />
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={!text.trim() || submitting}
          className={cn(
            "absolute right-1.5 flex size-8 items-center justify-center rounded-full transition-[background-color,color]",
            text.trim()
              ? "bg-emerald-600 text-white hover:bg-emerald-500"
              : "bg-transparent text-slate-500",
          )}
          aria-label="Send update"
        >
          {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4 -ml-0.5" />}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-3">
        <div className="ml-auto flex flex-wrap gap-1 text-slate-400 sm:gap-2 md:text-[#00F5FF]">
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
