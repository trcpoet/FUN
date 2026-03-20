import type { BadgeRow } from "../../../lib/supabase";
import type { UserBadgeRow } from "../../../lib/supabase";
import { cn } from "../ui/utils";

export type UserBadgeWithDetail = UserBadgeRow & { badges?: BadgeRow | null };

type Props = {
  badges: UserBadgeWithDetail[];
  className?: string;
  hideHeading?: boolean;
};

export function ProfileBadgesSection({ badges, className, hideHeading }: Props) {
  if (!badges.length) {
    return (
      <section className={cn("rounded-2xl border border-dashed border-white/[0.1] bg-white/[0.02] px-4 py-6", className)}>
        {!hideHeading && (
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2">Progression</h2>
        )}
        <p className="text-sm text-slate-500">Earn badges as you play — subtle milestones, not noisy trophies.</p>
      </section>
    );
  }

  return (
    <section className={cn("rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4", className)}>
      {!hideHeading && (
        <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">Progression</h2>
      )}
      <ul className="flex flex-wrap gap-2">
        {badges.map((ub) => {
          const b = ub.badges;
          return (
            <li
              key={ub.id}
              className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-100/95"
            >
              <span className="font-semibold">{b?.name ?? ub.badge_id}</span>
              {b?.description && <span className="text-emerald-200/50"> · {b.description}</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
