import { useState } from "react";
import { useNavigate } from "react-router";
import { Bell, Globe, Settings, ChevronLeft, ChevronRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { cn } from "../ui/utils";
import type { NotificationRow } from "../../../lib/supabase";
import { Badge } from "../ui/badge";
import { notificationHref, notificationLabel } from "../../../lib/notificationText";

type Props = {
  onBack: () => void;
  /**
   * "map" for your own profile, which is reached from the map; "back" for someone
   * else's, which is reached from wherever their name was tapped.
   */
  backTo?: "map" | "back";
  /**
   * Settings and alerts are yours, so they only belong on your own profile. Leave
   * them out and the header leaves the buttons out — on another player's profile
   * they were a gear that did nothing and a bell that was always empty.
   */
  onOpenSettings?: () => void;
  notifications?: NotificationRow[];
  unreadCount?: number;
  onMarkRead?: (id: string) => void;
  className?: string;
};

export function ProfileHubHeader({
  onBack,
  backTo = "map",
  onOpenSettings,
  notifications,
  unreadCount = 0,
  onMarkRead,
  className,
}: Props) {
  const navigate = useNavigate();
  const [alertsOpen, setAlertsOpen] = useState(false);
  return (
    <header
      className={cn(
        "fixed top-0 left-0 right-0 z-[70] border-b border-white/[0.05] bg-black/60 backdrop-blur-2xl transition-all duration-300",
        className,
      )}
    >
      <div className="mx-auto max-w-6xl w-full px-4 md:px-8">
        <div className="flex h-14 items-center justify-between gap-4">
          {/* Left: Back to Map */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="flex size-9 items-center justify-center rounded-2xl bg-white/[0.03] border border-white/5 text-primary transition-all hover:bg-primary hover:text-primary-foreground hover:scale-110 active:scale-95"
              aria-label={backTo === "map" ? "Back to map" : "Back"}
            >
              {backTo === "map" ? <Globe className="size-5" /> : <ChevronLeft className="size-5" />}
            </button>
            <span className="hidden sm:block text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
              {backTo === "map" ? "Map View" : "Back"}
            </span>
          </div>

          {/* Center: Brand (Hidden on small mobile if needed, but here we keep it) */}
          <div className="flex items-center">
            <h1 className="text-xl font-black italic tracking-tighter uppercase text-white leading-none">
              Athlete <span className="text-primary">Hub</span>
            </h1>
          </div>

          {/* Right: Actions */}
          {/* Same width as the left group, so the title stays centred when these are absent. */}
          <div className="flex min-w-9 items-center justify-end gap-2">
            {notifications ? (
            <Popover open={alertsOpen} onOpenChange={setAlertsOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "relative flex size-10 items-center justify-center rounded-2xl transition-all bg-white/[0.03] border border-white/5 text-muted-foreground hover:text-white hover:bg-white/[0.08]"
                  )}
                  aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
                >
                  <Bell className="size-5" />
                  {unreadCount > 0 && (
                    <span
                      className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-black tabular-nums ring-2 ring-black"
                      aria-hidden
                    >
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="w-80 border-white/[0.08] bg-[#0D1117]/95 backdrop-blur-xl p-0 text-slate-100 shadow-2xl rounded-[32px] overflow-hidden"
              >
                <div className="bg-white/[0.03] px-5 py-4 border-b border-white/[0.05]">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-black uppercase tracking-widest text-white">Alerts</p>
                    {unreadCount > 0 && (
                      <Badge className="bg-rose-500/20 text-rose-500 border-none font-black text-[9px]">{unreadCount} NEW</Badge>
                    )}
                  </div>
                </div>
                <ul className="max-h-80 overflow-y-auto divide-y divide-white/[0.05]">
                  {notifications.length === 0 ? (
                    <li className="px-6 py-12 text-center text-xs font-medium text-slate-500 italic uppercase tracking-widest">
                      Pulse is quiet
                    </li>
                  ) : (
                    notifications.map((n) => {
                      const href = notificationHref(n);
                      return (
                      <li key={n.id}>
                        <button
                          type="button"
                          onClick={() => {
                            if (!n.is_read) onMarkRead?.(n.id);
                            // These rows only marked themselves read; they now open
                            // what they are about, like the feed's Alerts tab does.
                            if (href) {
                              setAlertsOpen(false);
                              navigate(href);
                            }
                          }}
                          className={cn(
                            "flex w-full items-center gap-3 px-6 py-4 text-left transition-colors hover:bg-white/[0.03]",
                            !n.is_read && "bg-primary/[0.03]",
                          )}
                        >
                          <span className="flex min-w-0 flex-1 flex-col gap-1">
                            <span className="text-sm font-bold text-slate-200 tracking-tight">{notificationLabel(n)}</span>
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">
                              {new Date(n.created_at).toLocaleString(undefined, {
                                month: "short",
                                day: "numeric",
                                hour: "numeric",
                                minute: "2-digit",
                              })}
                            </span>
                          </span>
                          {href ? <ChevronRight className="size-4 shrink-0 text-slate-500" aria-hidden /> : null}
                        </button>
                      </li>
                      );
                    })
                  )}
                </ul>
              </PopoverContent>
            </Popover>
            ) : null}

            {onOpenSettings ? (
              <button
                type="button"
                onClick={onOpenSettings}
                className="flex size-10 items-center justify-center rounded-2xl bg-white/[0.03] border border-white/5 text-muted-foreground transition-all hover:bg-white/[0.08] hover:text-white hover:rotate-90"
                aria-label="Settings"
              >
                <Settings className="size-5" />
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
