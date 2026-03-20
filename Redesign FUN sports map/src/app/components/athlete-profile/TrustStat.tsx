import { cn } from "../ui/utils";

type Props = {
  label: string;
  value: string;
  hint?: string;
  className?: string;
};

export function TrustStat({ label, value, hint, className }: Props) {
  return (
    <div className={cn("rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5", className)}>
      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">{label}</p>
      <p className="text-sm font-semibold text-slate-100 mt-0.5">{value}</p>
      {hint && <p className="text-[11px] text-slate-500 mt-1 leading-snug">{hint}</p>}
    </div>
  );
}
