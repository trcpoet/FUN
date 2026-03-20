import { cn } from "../ui/utils";

type Props = {
  label: string;
  value: string;
  verified?: boolean;
  className?: string;
};

export function MetricChip({ label, value, verified, className }: Props) {
  return (
    <div
      className={cn(
        "rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 min-w-0",
        verified && "ring-1 ring-cyan-500/20",
        className,
      )}
    >
      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-medium truncate">{label}</p>
      <p className="text-sm font-semibold text-slate-100 mt-0.5 truncate">{value}</p>
      {verified && <p className="text-[10px] text-cyan-400/80 mt-1">Verified</p>}
    </div>
  );
}
