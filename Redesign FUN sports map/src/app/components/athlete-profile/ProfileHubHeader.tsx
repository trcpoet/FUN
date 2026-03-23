import { Bell, Globe, Settings } from "lucide-react";
import { Button } from "../ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { cn } from "../ui/utils";
import type { NotificationRow } from "../../../lib/supabase";

type Props = {
  onBack: () => void;
  onOpenSettings: () => void;
  notifications: NotificationRow[];
  unreadCount: number;
  onMarkRead: (id: string) => void;
  className?: string;
};

function notificationLabel(n: NotificationRow): string {
  if (n.type === "badge_earned") {
    return `Badge earned: ${(n.payload as { badge_slug?: string }).badge_slug ?? "?"}`;
  }
  if (n.type === "game_completed") return "A game you joined was completed.";
  return "New notification";
}

export function ProfileHubHeader({
  onBack,
  onOpenSettings,
  notifications,
  unreadCount,
  onMarkRead,
  className,
}: Props) {
  return (
    <header
      className={cn(
        "fixed top-0 left-0 right-0 z-[70] border-b border-white/[0.08] backdrop-blur-xl",
        "bg-black md:bg-[#0D1117]/95",
        className,
      )}
    >
      {/* Mobile: map (globe) | FUN wordmark | settings */}
      <div className="grid h-14 w-full grid-cols-[2.5rem_1fr_2.5rem] items-center gap-2 px-3 md:hidden">
        <button
          type="button"
          onClick={onBack}
          className="header-map-btn flex size-9 shrink-0 items-center justify-center rounded-full text-[#00F5FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5FF]/50"
          aria-label="Back to map"
        >
          <Globe className="size-5" aria-hidden />
        </button>
        <span className="fun-brand-wordmark min-w-0 text-center">FUN</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="justify-self-end text-[#00F5FF] hover:bg-white/[0.06] hover:text-[#00F5FF]"
          onClick={onOpenSettings}
          aria-label="Settings"
        >
          <Settings className="size-5" />
        </Button>
      </div>

      {/* Desktop: globe (left) · FUN centered · settings + notifications (right) */}
      <div className="hidden h-14 w-full grid-cols-[1fr_auto_1fr] items-center gap-2 px-6 md:grid">
        <div className="flex min-w-0 justify-start">
          <button
            type="button"
            onClick={onBack}
            className="header-map-btn flex size-9 shrink-0 items-center justify-center rounded-full text-[#00F5FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5FF]/50"
            aria-label="Back to map"
          >
            <Globe className="size-5" aria-hidden />
          </button>
        </div>
        <span className="fun-brand-wordmark fun-brand-wordmark--desktop pointer-events-none justify-self-center text-center">
          FUN
        </span>
        <div className="flex min-w-0 items-center justify-end gap-0.5 sm:gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-slate-300 hover:bg-white/[0.06] hover:text-white"
            onClick={onOpenSettings}
            aria-label="Settings"
          >
            <Settings className="size-5" />
          </Button>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="relative text-slate-300 hover:bg-white/[0.06] hover:text-white"
                aria-label="Notifications"
              >
                <Bell className="size-5" />
                {unreadCount > 0 ? (
                  <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-red-500 ring-2 ring-[#0D1117]" />
                ) : null}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="w-80 border-white/[0.1] bg-[#161B22] p-0 text-slate-100 shadow-xl"
            >
              <div className="border-b border-white/[0.08] px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Notifications</p>
              </div>
              <ul className="max-h-72 overflow-y-auto py-1">
                {notifications.length === 0 ? (
                  <li className="px-3 py-6 text-center text-sm text-slate-500">You&apos;re all caught up.</li>
                ) : (
                  notifications.map((n) => (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => {
                          if (!n.is_read) onMarkRead(n.id);
                        }}
                        className={cn(
                          "flex w-full flex-col gap-0.5 px-3 py-2.5 text-left text-sm transition-colors hover:bg-white/[0.04]",
                          !n.is_read && "bg-cyan-500/[0.06]",
                        )}
                      >
                        <span className="text-slate-200">{notificationLabel(n)}</span>
                        <span className="text-[11px] text-slate-500">
                          {new Date(n.created_at).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </header>
  );
}
