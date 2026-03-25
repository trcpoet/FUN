import { Loader2 } from "lucide-react";
import { cn } from "./utils";

type Props = {
  className?: string;
  label?: string;
};

export function Spinner({ className, label = "Loading" }: Props) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-slate-400", className)} role="status" aria-live="polite">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      <span className="text-xs">{label}</span>
    </span>
  );
}

