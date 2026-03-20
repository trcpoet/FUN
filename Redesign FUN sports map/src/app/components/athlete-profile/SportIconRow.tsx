import { sportEmoji } from "../../../lib/sportVisuals";
import { cn } from "../ui/utils";

type Props = {
  sports: string[];
  size?: "sm" | "md";
  className?: string;
};

export function SportIconRow({ sports, size = "md", className }: Props) {
  if (!sports.length) return null;
  const dim = size === "sm" ? "text-base" : "text-lg";
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {sports.map((s) => (
        <span
          key={s}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-slate-200",
            dim,
          )}
          title={s}
        >
          <span aria-hidden className="opacity-90">
            {sportEmoji(s)}
          </span>
          <span className="text-xs font-medium text-slate-300">{s}</span>
        </span>
      ))}
    </div>
  );
}
