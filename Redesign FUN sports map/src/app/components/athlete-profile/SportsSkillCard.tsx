import type { SportSkillEntry, SkillRating } from "../../../lib/athleteProfile";
import { sportEmoji } from "../../../lib/sportVisuals";
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

      {primarySports.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] uppercase tracking-wider text-slate-600">Primary</p>
          <ul className="space-y-2">
            {primarySports.map((sport) => {
              const row = mergedSkills.find((x) => x.sport === sport && x.primary) ?? {
                sport,
                level: null as SportSkillEntry["level"],
                primary: true,
              };
              return (
                <li
                  key={sport}
                  className="flex items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2"
                >
                  <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-slate-200">
                    <span className="shrink-0 text-lg leading-none" aria-hidden>
                      {sportEmoji(sport)}
                    </span>
                    <span className="truncate">{sport}</span>
                  </span>
                  <span className="shrink-0 text-xs text-slate-500">
                    Primary · {levelShort(row.level)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {secondarySports.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] uppercase tracking-wider text-slate-600">Secondary</p>
          <ul className="space-y-2">
            {secondarySports.map((sport) => {
              const row = mergedSkills.find((x) => x.sport === sport && !x.primary) ?? {
                sport,
                level: null as SportSkillEntry["level"],
                primary: false,
              };
              return (
                <li
                  key={sport}
                  className="flex items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2"
                >
                  <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-slate-200">
                    <span className="shrink-0 text-lg leading-none" aria-hidden>
                      {sportEmoji(sport)}
                    </span>
                    <span className="truncate">{sport}</span>
                  </span>
                  <span className="shrink-0 text-xs text-slate-500">
                    Secondary · {levelShort(row.level)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
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
