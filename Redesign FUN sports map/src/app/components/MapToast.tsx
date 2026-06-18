import type { ReactNode } from "react";

/**
 * Compact, dismissible status card for the top-left map overlay column.
 * Presentational only — all show/hide state lives in App.tsx (no global toast
 * manager). Distinct from the bell/Alerts dropdown and from sonner toasts
 * (which are transient, top-center confirmations).
 */
type MapToastProps = {
  children: ReactNode;
  /** Renders a × button top-right when provided. */
  onDismiss?: () => void;
  /** Border accent: neutral "info" or amber "warning". */
  variant?: "info" | "warning";
  /** Optional leading glyph (e.g. an emoji), aligned to the first line. */
  icon?: ReactNode;
  /** Optional compact action buttons, stacked below the message. */
  actions?: ReactNode;
};

const VARIANT_BORDER: Record<NonNullable<MapToastProps["variant"]>, string> = {
  info: "border-white/10",
  warning: "border-amber-400/30",
};

export function MapToast({ children, onDismiss, variant = "info", icon, actions }: MapToastProps) {
  return (
    <div
      className={`pointer-events-auto rounded-2xl border ${VARIANT_BORDER[variant]} bg-[#0A0F1C]/95 px-4 py-2.5 text-xs text-slate-200 shadow-[var(--shadow-control)] backdrop-blur-xl`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-2">
        {icon ? (
          <span aria-hidden className="mt-0.5 shrink-0">
            {icon}
          </span>
        ) : null}
        <div className="min-w-0 flex-1">{children}</div>
        {onDismiss ? (
          <button
            type="button"
            aria-label="Dismiss"
            className="-mr-1 min-h-[28px] shrink-0 px-1 font-bold text-slate-400 transition-colors hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
            onClick={onDismiss}
          >
            ×
          </button>
        ) : null}
      </div>
      {actions ? <div className="mt-2 flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
