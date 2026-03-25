import { cn } from "./utils";

type Props = {
  /** 0..5 */
  value: number | null | undefined;
  className?: string;
  /** px */
  size?: number;
};

function clampRating(v: number): number {
  if (Number.isNaN(v)) return 0;
  return Math.max(0, Math.min(5, v));
}

export function StarRating({ value, className, size = 12 }: Props) {
  const hasValue = typeof value === "number" && !Number.isNaN(value);
  const v = hasValue ? clampRating(value) : 0;

  const full = Math.round(v);
  const stars = Array.from({ length: 5 }, (_, i) => (i < full ? "★" : "☆"));
  const label = hasValue ? `${v.toFixed(1).replace(/\.0$/, "")} out of 5 stars` : "Not rated yet";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-[2px]",
        hasValue ? "text-amber-300" : "text-slate-500",
        className,
      )}
      aria-label={label}
      title={label}
    >
      {stars.map((s, i) => (
        <span key={i} style={{ fontSize: size, lineHeight: 1 }}>
          {s}
        </span>
      ))}
    </span>
  );
}

