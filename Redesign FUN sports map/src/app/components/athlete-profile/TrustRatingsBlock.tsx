import type { TrustSignals } from "../../../lib/athleteProfile";
import { cn } from "../ui/utils";

type Props = {
  trust: TrustSignals | undefined;
  className?: string;
};

export function TrustRatingsBlock({ trust, className }: Props) {
  const t = trust ?? {};
  const rows: { label: string; value: string }[] = [];
  if (t.sportsmanship != null && t.sportsmanship > 0) {
    rows.push({ label: "Sportsmanship", value: `${t.sportsmanship.toFixed(1)} / 5` });
  }
  if (t.showUpRate != null && t.showUpRate > 0) {
    rows.push({ label: "Shows up", value: `${Math.round(t.showUpRate)}%` });
  }
  if (t.communication != null && t.communication > 0) {
    rows.push({ label: "Communication", value: `${t.communication.toFixed(1)} / 5` });
  }
  if (t.organizerTrust != null && t.organizerTrust > 0) {
    rows.push({ label: "Organizer trust", value: `${t.organizerTrust.toFixed(1)} / 5` });
  }
  if (t.reliabilityLabel?.trim()) {
    rows.push({ label: "Reliability", value: t.reliabilityLabel });
  }

  if (rows.length === 0) {
    return (
      <p className={cn("text-sm text-slate-500", className)}>
        Trust ratings appear after you play games with others.
      </p>
    );
  }

  return (
    <ul className={cn("space-y-3", className)}>
      {rows.map((r) => (
        <li key={r.label} className="flex items-baseline justify-between gap-4 border-b border-white/[0.06] pb-2 last:border-0">
          <span className="text-sm text-slate-400">{r.label}</span>
          <span className="text-sm font-semibold text-white tabular-nums">{r.value}</span>
        </li>
      ))}
    </ul>
  );
}
