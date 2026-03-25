import { useEffect, useMemo, useState } from "react";
import { Bell, Compass, Globe, HeartPulse, PenSquare, Sparkles, Users } from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import { cn } from "../components/ui/utils";
import { Button } from "../components/ui/button";
import { ActivityFeed } from "../components/athlete-profile/ActivityFeed";
import { useNotifications } from "../../hooks/useNotifications";
import { getRecentStatuses, type StatusRow } from "../../lib/status";

function notificationLabel(n: { type: string; payload?: unknown }): string {
  if (n.type === "badge_earned") {
    return `Badge earned: ${(n.payload as { badge_slug?: string }).badge_slug ?? "?"}`;
  }
  if (n.type === "game_completed") return "A game you joined was completed.";
  return "New notification";
}

function notificationActorUserId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const v = p.user_id ?? p.profile_id ?? p.actor_id ?? p.from_user_id;
  return typeof v === "string" && v.trim() ? v : null;
}

type TabId = "discovery" | "activity" | "similar" | "friends" | "notifications";

function TabButton(props: {
  active: boolean;
  label: string;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const { active, label, onClick, icon: Icon } = props;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border/80 bg-card/50 text-muted-foreground hover:bg-accent hover:text-foreground"
      )}
    >
      <Icon className="size-4" />
      {label}
    </button>
  );
}

function IconTabButton(props: {
  active: boolean;
  label: string;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  unreadDot?: boolean;
}) {
  const { active, label, onClick, icon: Icon, unreadDot } = props;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative inline-flex size-10 items-center justify-center rounded-full border transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border/80 bg-card/50 text-muted-foreground hover:bg-accent hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      )}
      aria-label={label}
      title={label}
    >
      <Icon className="size-5" />
      {unreadDot ? (
        <span className="absolute right-2 top-2 size-2 rounded-full bg-rose-500 ring-2 ring-background" />
      ) : null}
    </button>
  );
}

export default function Feed() {
  const [tab, setTab] = useState<TabId>("discovery");
  const navigate = useNavigate();
  const location = useLocation();
  const { notifications, markRead } = useNotifications({ limit: 12 });
  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const [statuses, setStatuses] = useState<StatusRow[]>([]);

  useEffect(() => {
    const qs = new URLSearchParams(location.search);
    const t = qs.get("tab");
    if (t === "notifications") setTab("notifications");
    else if (t === "friends") setTab("friends");
    else if (t === "similar") setTab("similar");
    else if (t === "activity") setTab("activity");
    else if (t === "discovery") setTab("discovery");
  }, [location.search]);

  useEffect(() => {
    let cancelled = false;
    void getRecentStatuses(24).then((r) => {
      if (cancelled) return;
      setStatuses(r.data ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const placeholderPosts = useMemo(
    () => [
      {
        id: "p1",
        caption: "Morning run + mobility. Feeling fast today.",
        timeAgo: "2h ago",
        likes: 12,
        comments: 2,
        sport: "Running",
        pinned: true,
      },
      {
        id: "p2",
        caption: "Looking for a pickup squad tonight — who’s in?",
        timeAgo: "Yesterday",
        likes: 7,
        comments: 1,
        sport: "Basketball",
        pinned: false,
      },
    ],
    []
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-[60] border-b border-border/70 bg-background/60 backdrop-blur-xl">
        <div className="w-full px-4 py-4">
          {/* 3-column wrapper: keep globe left, title truly centered (right column is equal-width spacer). */}
          <div className="grid grid-cols-[2.5rem_1fr_2.5rem] items-center gap-3">
            <button
              type="button"
              onClick={() => navigate("/")}
              className="header-map-btn flex size-9 shrink-0 items-center justify-center rounded-full text-[#00F5FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5FF]/50"
              aria-label="Back to map"
              title="Back to map"
            >
              <Globe className="size-5" aria-hidden />
            </button>

            <div className="flex min-w-0 justify-center text-center">
              <div className="w-full max-w-3xl min-w-0">
                <h1 className="text-lg font-semibold tracking-tight">Feed</h1>
                <p className="text-xs text-muted-foreground">
                  Your city’s pickup pulse — games, players, and moments.
                </p>
              </div>
            </div>

            {/* Spacer (matches left column width) */}
            <div />
          </div>
        </div>

        <div className="mx-auto w-full max-w-3xl px-4 pb-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <TabButton
                active={tab === "discovery"}
                label="Discovery"
                icon={Compass}
                onClick={() => setTab("discovery")}
              />
              <TabButton
                active={tab === "activity"}
                label="Activity"
                icon={HeartPulse}
                onClick={() => setTab("activity")}
              />
              <TabButton
                active={tab === "similar"}
                label="Similar"
                icon={Users}
                onClick={() => setTab("similar")}
              />
              <TabButton
                active={tab === "friends"}
                label="Friends"
                icon={Sparkles}
                onClick={() => setTab("friends")}
              />

              <IconTabButton
                active={tab === "notifications"}
                label="Notifications"
                icon={Bell}
                unreadDot={unreadCount > 0}
                onClick={() => setTab("notifications")}
              />
            </div>

            {/* New post icon (right) */}
            <button
              type="button"
              onClick={() => {
                // Placeholder: wire to post composer when ready.
              }}
              className={cn(
                "inline-flex size-10 items-center justify-center rounded-full",
                "border border-border/80 bg-card/50 text-muted-foreground",
                "hover:bg-accent hover:text-foreground",
                "transition-[color,background-color,border-color,box-shadow,transform] duration-[var(--dur-hover)] ease-[var(--ease-out)]",
                "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              )}
              aria-label="New post"
              title="New post"
            >
              <PenSquare className="size-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 py-6">
        {tab === "discovery" && (
          <section className="space-y-4">
            {statuses.length > 0 ? (
              <div className="rounded-2xl border border-border/80 bg-card/60 p-4 shadow-[var(--shadow-control)]">
                <p className="text-sm font-semibold">Statuses (24h)</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Fresh updates from the community.
                </p>
                <div className="mt-4 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {statuses.map((s) => (
                    <div
                      key={`${s.user_id}-${s.created_at}`}
                      className="min-w-[15rem] shrink-0 rounded-xl border border-border/70 bg-popover/35 px-3 py-2"
                    >
                      <p className="text-sm font-semibold text-foreground truncate">Player</p>
                      <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2">{s.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="rounded-2xl border border-border/80 bg-card/60 p-4 shadow-[var(--shadow-control)]">
              <p className="text-sm font-semibold">Near you</p>
              <p className="mt-1 text-xs text-muted-foreground">
                The best next play, based on distance, timing, and vibes.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-border/70 bg-popover/35 p-3">
                  <p className="text-sm font-semibold">Recommended games</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Your next run, rally, or rival — picked for you.
                  </p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-popover/35 p-3">
                  <p className="text-sm font-semibold">Popular venues</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Courts and pitches where the energy’s already up.
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}

        {tab === "activity" && (
          <ActivityFeed
            posts={placeholderPosts as any}
            pinnedFallback={{ title: "No pinned post yet", subtitle: "Pin availability, city, or training goals." }}
          />
        )}

        {tab === "similar" && (
          <section className="space-y-3">
            <div className="rounded-2xl border border-border/80 bg-card/60 p-4 shadow-[var(--shadow-control)]">
              <p className="text-sm font-semibold">Similar players</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Find your people: teammates, rivals, and regulars.
              </p>
            </div>
          </section>
        )}

        {tab === "friends" && (
          <section className="space-y-3">
            <div className="rounded-2xl border border-border/80 bg-card/60 p-4 shadow-[var(--shadow-control)]">
              <p className="text-sm font-semibold">Friends posts</p>
              <p className="mt-1 text-xs text-muted-foreground">
                What your crew’s up to — highlights, invites, and “who’s in?” posts.
              </p>
            </div>
          </section>
        )}

        {tab === "notifications" && (
          <section className="space-y-3">
            <div className="rounded-2xl border border-border/80 bg-card/60 p-4 shadow-[var(--shadow-control)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Notifications</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Quick hits — tap to jump to the profile.
                  </p>
                </div>
                {unreadCount > 0 ? (
                  <span className="rounded-full border border-border/70 bg-background/40 px-2 py-1 text-xs font-semibold tabular-nums text-foreground">
                    {unreadCount} unread
                  </span>
                ) : null}
              </div>

              <div className="mt-3 overflow-hidden rounded-xl border border-border/70 bg-background/30">
                <ul className="max-h-[22rem] overflow-y-auto py-1">
                  {notifications.length === 0 ? (
                    <li className="px-3 py-10 text-center text-sm text-muted-foreground">
                      You&apos;re all caught up.
                    </li>
                  ) : (
                    notifications.map((n) => (
                      <li key={n.id}>
                        <button
                          type="button"
                          onClick={() => {
                            if (!n.is_read) markRead(n.id);
                            const actorId = notificationActorUserId(n.payload);
                            if (actorId) navigate(`/athlete/${actorId}`);
                          }}
                          className={cn(
                            "flex w-full flex-col gap-0.5 px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent/60",
                            !n.is_read && "bg-primary/10",
                          )}
                        >
                          <span className="text-foreground/90">{notificationLabel(n)}</span>
                          <span className="text-[11px] text-muted-foreground">
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
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

