import { Loader2, Send } from "lucide-react";
import { cn } from "../ui/utils";

/**
 * Write and send. One of these, where there were three inline copies differing
 * only in their placeholder.
 */
export type ComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  sending: boolean;
  placeholder: string;
  /** Shown above the field — a send that failed, in the user's words. */
  error?: string | null;
  className?: string;
};

export function Composer({
  value,
  onChange,
  onSend,
  sending,
  placeholder,
  error,
  className,
}: ComposerProps) {
  const canSend = !sending && value.trim().length > 0;
  return (
    <div
      className={cn(
        "border-t border-white/[0.08] p-3 shrink-0 bg-white/[0.02] backdrop-blur-2xl shadow-[0_-18px_40px_rgba(0,0,0,0.45)]",
        className,
      )}
    >
      {error ? <p className="text-xs text-amber-400 mb-2 px-1">{error}</p> : null}
      <div className="flex gap-2 items-end">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (canSend) onSend();
            }
          }}
          placeholder={placeholder}
          rows={2}
          className="flex-1 resize-none rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
        />
        <button
          type="button"
          disabled={!canSend}
          onClick={onSend}
          className={cn(
            "shrink-0 h-11 w-11 rounded-xl text-white flex items-center justify-center transition-colors",
            "border border-white/10",
            "bg-gradient-to-b from-violet-500/95 to-fuchsia-600/85 hover:from-violet-400 hover:to-fuchsia-500",
            "shadow-[0_12px_30px_rgba(124,58,237,0.22)]",
            "disabled:opacity-40 disabled:pointer-events-none",
          )}
          aria-label="Send"
        >
          {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
        </button>
      </div>
    </div>
  );
}
