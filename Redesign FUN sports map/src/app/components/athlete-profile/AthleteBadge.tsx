import { BadgeCheck, Shield } from "lucide-react";
import { cn } from "../ui/utils";

type Props = {
  variant: "verified" | "sportsmanship";
  className?: string;
};

export function AthleteBadge({ variant, className }: Props) {
  if (variant === "verified") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full border border-cyan-500/35 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-cyan-200/90",
          className,
        )}
        title="Verified athlete"
      >
        <BadgeCheck className="size-3.5 shrink-0" aria-hidden />
        Verified
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-200/90",
        className,
      )}
      title="Strong sportsmanship signal"
    >
      <Shield className="size-3.5 shrink-0" aria-hidden />
      Fair play
    </span>
  );
}
