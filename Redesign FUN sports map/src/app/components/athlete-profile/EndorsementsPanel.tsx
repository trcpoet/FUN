import type { EndorsementEntry, TrustSignals } from "../../../lib/athleteProfile";
import { TrustStat } from "./TrustStat";
import { cn } from "../ui/utils";

type Props = {
  trust: TrustSignals | undefined;
  endorsements: EndorsementEntry[];
  className?: string;
  hideHeading?: boolean;
};

function hasTrust(t: TrustSignals | undefined): boolean {
  if (!t) return false;
  return (
    (t.sportsmanship != null && t.sportsmanship > 0) ||
    (t.showUpRate != null && t.showUpRate > 0) ||
    (t.communication != null && t.communication > 0) ||
    (t.organizerTrust != null && t.organizerTrust > 0) ||
    !!t.reliabilityLabel?.trim()
  );
}

export function EndorsementsPanel({
  trust,
  endorsements,
  className,
  hideHeading = false,
}: Props) {
  const t = trust ?? {};
  const showTrust = hasTrust(t);
  const showQuotes = endorsements.length > 0;

  if (!showTrust && !showQuotes) {
    return (
      <section className={cn("rounded-2xl border border-dashed border-white/[0.1] bg-white/[0.02] px-4 py-6", className)}>
        {!hideHeading && (
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2">Trust & endorsements</h2>
        )}
        <p className="text-sm text-slate-500 leading-relaxed">
          After pickup games, teammates can endorse reliability and sportsmanship — the signal that makes invites easier.
        </p>
      </section>
    );
  }

  return (
    <section className={cn("space-y-4", className)}>
      {!hideHeading && (
        <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500 px-1">Trust & endorsements</h2>
      )}

      {showTrust && (
        <div className="grid grid-cols-2 gap-2">
          {t.sportsmanship != null && t.sportsmanship > 0 && (
            <TrustStat label="Sportsmanship" value={`${t.sportsmanship.toFixed(1)} / 5`} />
          )}
          {t.reliabilityLabel?.trim() && (
            <TrustStat label="Reliability" value={t.reliabilityLabel} />
          )}
          {t.showUpRate != null && t.showUpRate > 0 && (
            <TrustStat
              label="Shows up"
              value={`${Math.round(t.showUpRate)}%`}
              hint="Based on games attended vs. joined"
            />
          )}
          {t.communication != null && t.communication > 0 && (
            <TrustStat label="Communication" value={`${t.communication.toFixed(1)} / 5`} />
          )}
          {t.organizerTrust != null && t.organizerTrust > 0 && (
            <TrustStat label="Organizer trust" value={`${t.organizerTrust.toFixed(1)} / 5`} />
          )}
        </div>
      )}

      {showQuotes && (
        <ul className="space-y-3">
          {endorsements.map((e) => (
            <li
              key={e.id}
              className="rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.04] to-transparent p-4"
            >
              <p className="text-sm text-slate-200 leading-relaxed">&ldquo;{e.quote}&rdquo;</p>
              <p className="text-xs text-slate-500 mt-2">
                — {e.authorName}
                {e.relation ? ` · ${e.relation}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
