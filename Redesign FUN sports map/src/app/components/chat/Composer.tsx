import { useEffect, useRef, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { cn } from "../ui/utils";

/**
 * Write and send.
 *
 * Two things the three inline copies got wrong. It was a fixed two-row textarea,
 * so a long message was written through a letterbox; it now grows with the text
 * and stops at six lines, after which it scrolls. And its Enter handler fired
 * mid-composition, which means anyone typing Japanese, Chinese or Korean sent a
 * half-finished word every time they picked a candidate — `isComposing` is the
 * guard, and `keyCode === 229` covers the browsers that report composition late.
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

/** Six lines, then it scrolls. Roughly 22px of line box plus the padding. */
const MAX_HEIGHT_PX = 6 * 22 + 16;

export function Composer({
  value,
  onChange,
  onSend,
  sending,
  placeholder,
  error,
  className,
}: ComposerProps) {
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const [composing, setComposing] = useState(false);
  const canSend = !sending && value.trim().length > 0;

  // Measure from scratch each time: shrinking needs the height released first,
  // or the field only ever grows. The overflow flips only at the cap, so a
  // one-line draft does not sit next to an empty scrollbar gutter.
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const wanted = el.scrollHeight;
    el.style.height = `${Math.min(wanted, MAX_HEIGHT_PX)}px`;
    el.style.overflowY = wanted > MAX_HEIGHT_PX ? "auto" : "hidden";
  }, [value]);

  return (
    <div
      className={cn(
        "border-t border-white/[0.08] p-3 shrink-0 bg-white/[0.02] backdrop-blur-2xl shadow-[0_-18px_40px_rgba(0,0,0,0.45)]",
        className,
      )}
    >
      {error ? (
        <p className="text-xs text-amber-400 mb-2 px-1" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2 items-end">
        <textarea
          ref={areaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onCompositionStart={() => setComposing(true)}
          onCompositionEnd={() => setComposing(false)}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || e.shiftKey) return;
            // Enter is picking an IME candidate, not sending.
            if (composing || e.nativeEvent.isComposing || e.keyCode === 229) return;
            e.preventDefault();
            if (canSend) onSend();
          }}
          placeholder={placeholder}
          rows={1}
          className="flex-1 resize-none rounded-2xl border border-white/10 bg-white/[0.07] px-3.5 py-2.5 text-sm leading-[22px] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
        />
        <button
          type="button"
          disabled={!canSend}
          onClick={onSend}
          className={cn(
            "shrink-0 size-10 rounded-full text-white flex items-center justify-center transition-colors",
            "bg-gradient-to-b from-violet-500/95 to-fuchsia-600/85 hover:from-violet-400 hover:to-fuchsia-500",
            "shadow-[0_12px_30px_rgba(124,58,237,0.22)]",
            "disabled:opacity-40 disabled:pointer-events-none",
          )}
          aria-label="Send"
        >
          {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </button>
      </div>
    </div>
  );
}
