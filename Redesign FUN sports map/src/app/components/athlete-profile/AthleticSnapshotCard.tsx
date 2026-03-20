import type { AthleteSnapshot } from "../../../lib/athleteProfile";
import { cn } from "../ui/utils";

type Props = {
  snapshot: AthleteSnapshot | undefined;
  className?: string;
  hideHeading?: boolean;
};

function Cell({ label, value }: { label: string; value: string | null | undefined }) {
  if (value == null || value === "") return null;
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">{label}</p>
      <p className="text-sm text-slate-100 font-medium mt-0.5 truncate">{value}</p>
    </div>
  );
}

export function AthleticSnapshotCard({ snapshot, className, hideHeading }: Props) {
  const s = snapshot ?? {};
  const positions = s.positions?.filter(Boolean).join(", ");
  const years =
    s.yearsExperience != null && s.yearsExperience > 0 ? `${s.yearsExperience} yrs` : null;
  const intensity =
    s.intensity === "low"
      ? "Low"
      : s.intensity === "moderate"
        ? "Moderate"
        : s.intensity === "high"
          ? "High"
          : null;

  const hasAny =
    s.height ||
    s.weight ||
    s.handedness ||
    positions ||
    s.playStyle ||
    years ||
    s.fitnessFocus ||
    intensity;

  if (!hasAny) {
    return (
      <section
        className={cn(
          "rounded-2xl border border-dashed border-white/[0.1] bg-white/[0.02] px-4 py-6 text-center",
          className,
        )}
      >
        <p className="text-sm text-slate-500">No athletic snapshot yet.</p>
        <p className="text-xs text-slate-600 mt-1">Add height, positions, and play style when you edit.</p>
      </section>
    );
  }

  return (
    <section
      className={cn(
        "rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 space-y-4",
        className,
      )}
    >
      {!hideHeading && (
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">Athletic snapshot</h2>
        </div>
      )}
      <div className="grid grid-cols-2 gap-x-4 gap-y-4">
        <Cell label="Height" value={s.height ?? null} />
        <Cell label="Weight" value={s.weight ?? null} />
        <Cell label="Hand / foot" value={s.handedness ?? null} />
        <Cell label="Positions" value={positions || null} />
        <Cell label="Play style" value={s.playStyle ?? null} />
        <Cell label="Experience" value={years} />
        <Cell label="Fitness focus" value={s.fitnessFocus ?? null} />
        <Cell label="Intensity" value={intensity} />
      </div>
    </section>
  );
}
