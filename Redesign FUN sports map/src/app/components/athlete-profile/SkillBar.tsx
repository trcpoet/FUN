import { cn } from "../ui/utils";

type Props = {
  label: string;
  value: number;
  className?: string;
};

export function SkillBar({ label, value, className }: Props) {
  const v = Math.min(100, Math.max(0, value));
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex justify-between gap-2 text-xs">
        <span className="text-slate-400 font-medium">{label}</span>
        <span className="text-slate-500 tabular-nums">{v}</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-600/90 to-cyan-500/70 shadow-[0_0_12px_rgba(52,211,153,0.25)]"
          style={{ width: `${v}%` }}
        />
      </div>
    </div>
  );
}
