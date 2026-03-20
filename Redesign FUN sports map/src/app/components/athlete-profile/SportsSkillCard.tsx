import type { SportSkillEntry, SkillRating } from "../../../lib/athleteProfile";
import { SportIconRow } from "./SportIconRow";
import { SkillBar } from "./SkillBar";
import { cn } from "../ui/utils";

function levelShort(l: SportSkillEntry["level"]): string {
  if (!l) return "—";
  return l.charAt(0).toUpperCase() + l.slice(1);
}

const DEFAULT_SKILLS: SkillRating[] = [
  { key: "speed", label: "Speed", value: 0 },
  { key: "endurance", label: "Endurance", value: 0 },
  { key: "defense", label: "Defense", value: 0 },
  { key: "playmaking", label: "Playmaking", value: 0 },
];

type Props = {
  primarySports: string[];
  secondarySports: string[];
  sportsSkills: SportSkillEntry[];
  skillRatings: SkillRating[];
  className?: string;
  hideHeading?: boolean;
};

export function SportsSkillCard({
  primarySports,
  secondarySports,
  sportsSkills,
  skillRatings,
  className,
  hideHeading,
}: Props) {
  const ratings =
    skillRatings.length > 0
      ? skillRatings
      : DEFAULT_SKILLS.map((d) => ({ ...d, value: 0 }));

  const showBars = ratings.some((r) => r.value > 0);
  const mergedSkills =
    sportsSkills.length > 0
      ? sportsSkills
      : [...primarySports, ...secondarySports].map((sport, i) => ({
          sport,
          level: null as SportSkillEntry["level"],
          primary: i < primarySports.length,
        }));

  return (
    <section className={cn("rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 space-y-4", className)}>
      {!hideHeading && (
        <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">Sports & skills</h2>
      )}

      {(primarySports.length > 0 || secondarySports.length > 0) && (
        <div className="space-y-2">
          {primarySports.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-600 mb-1.5">Primary</p>
              <SportIconRow sports={primarySports} />
            </div>
          )}
          {secondarySports.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-600 mb-1.5">Secondary</p>
              <SportIconRow sports={secondarySports} size="sm" />
            </div>
          )}
        </div>
      )}

      {mergedSkills.length > 0 && (
        <ul className="space-y-2">
          {mergedSkills.map((row) => (
            <li
              key={`${row.sport}-${row.primary}`}
              className="flex items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2"
            >
              <span className="text-sm text-slate-200 font-medium truncate">{row.sport}</span>
              <span className="text-xs text-slate-500 shrink-0">
                {row.primary ? "Primary" : "Secondary"} · {levelShort(row.level)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {showBars ? (
        <div className="space-y-3 pt-1">
          <p className="text-[10px] uppercase tracking-wider text-slate-600">Top strengths</p>
          {ratings
            .filter((r) => r.value > 0)
            .sort((a, b) => b.value - a.value)
            .map((r) => (
              <SkillBar key={r.key} label={r.label} value={r.value} />
            ))}
        </div>
      ) : (
        <p className="text-xs text-slate-600 leading-relaxed">
          Rate strengths (0–100) when you edit to surface your top athletic traits.
        </p>
      )}
    </section>
  );
}
