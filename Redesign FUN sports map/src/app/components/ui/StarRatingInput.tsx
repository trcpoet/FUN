import { useState } from "react";
import { cn } from "./utils";

type Props = {
  /** 1..5, or 0 for "not yet rated". */
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  /** px */
  size?: number;
  className?: string;
};

const LABELS = ["Poor", "Fair", "Good", "Great", "Perfect"];

/**
 * Interactive counterpart to the display-only StarRating.
 *
 * Kept as a separate component rather than adding an `onChange` to StarRating:
 * the read-only one renders in dense list rows where a radiogroup role and five
 * focusable buttons would be noise for screen readers.
 */
export function StarRatingInput({ value, onChange, disabled, size = 28, className }: Props) {
  const [hover, setHover] = useState(0);
  // Hover is a preview only; it must never survive into the committed value.
  const shown = hover || value;

  const move = (delta: number) => {
    const next = Math.min(5, Math.max(1, (value || 0) + delta));
    onChange(next);
  };

  return (
    <div
      role="radiogroup"
      aria-label="Your rating"
      className={cn("inline-flex items-center gap-1", className)}
      onMouseLeave={() => setHover(0)}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === "ArrowRight" || e.key === "ArrowUp") {
          e.preventDefault();
          move(1);
        } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
          e.preventDefault();
          move(-1);
        }
      }}
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const active = star <= shown;
        return (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={value === star}
            aria-label={`${star} star${star === 1 ? "" : "s"} — ${LABELS[star - 1]}`}
            // Roving tabindex: the group is one tab stop, arrows move within it.
            tabIndex={value === star || (value === 0 && star === 1) ? 0 : -1}
            disabled={disabled}
            onMouseEnter={() => setHover(star)}
            onFocus={() => setHover(star)}
            onBlur={() => setHover(0)}
            onClick={() => onChange(star)}
            className={cn(
              "rounded-md leading-none transition-colors cursor-pointer",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40",
              "disabled:cursor-not-allowed disabled:opacity-50",
              active ? "text-amber-300" : "text-slate-600 hover:text-amber-300/60"
            )}
            style={{ fontSize: size, lineHeight: 1 }}
          >
            <span aria-hidden>{active ? "★" : "☆"}</span>
          </button>
        );
      })}
      <span className="ml-2 text-xs text-slate-400" aria-hidden>
        {shown ? LABELS[shown - 1] : "Tap to rate"}
      </span>
    </div>
  );
}
