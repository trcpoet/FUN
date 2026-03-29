import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useMyProfile } from "../../hooks/useMyProfile";
import { useUserStats } from "../../hooks/useUserStats";
import { useNotifications } from "../../hooks/useNotifications";
import { signOut, getMyBadges, uploadAvatarImage } from "../../lib/api";
import { useIsMobile } from "../components/ui/use-mobile";
import {
  ProfileEditSheet,
  PostsReelsSection,
  AddPostOrReelDialog,
  type AddFeedKind,
  AboutSheet,
  ProfileBadgesSection,
  ExperienceTimeline,
  type UserBadgeWithDetail,
  ProfileHubHeader,
  ProfileHubHero,
  PerformanceStatsStrip,
  ProfileComposerCard,
  QuickStatusPostDialog,
  DiscoveredPeopleCarousel,
  StoriesRail,
} from "../components/athlete-profile";
import { mergeAthleteProfile } from "../../lib/athleteProfile";
import { readFollowedIds } from "../../lib/localFollows";
import { cn } from "../components/ui/utils";
import { useAuth } from "../contexts/AuthContext";
import { getAthleteReputation } from "../../lib/endorsements";
import { getLatestStatus, upsertMyStatus } from "../../lib/status";
import { Badge } from "../components/ui/badge";
import { Progress } from "../components/ui/progress";
import { ScrollArea, ScrollBar } from "../components/ui/scroll-area";

class ProfileSettingsErrorBoundary extends React.Component<
  { onReset: () => void; children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  state = { hasError: false, message: "" };

  static getDerivedStateFromError(error: unknown) {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : "Something went wrong opening settings.",
    };
  }

  componentDidCatch(error: unknown) {
    console.error("[FUN] Profile settings crashed", error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/70 px-4 text-white">
        <div className="w-full max-w-md rounded-[32px] border border-white/10 bg-[#0A0F1C] p-8 shadow-2xl text-center">
          <div className="size-16 rounded-full bg-rose-500/10 flex items-center justify-center mx-auto mb-6">
            <span className="text-2xl">⚠️</span>
          </div>
          <p className="text-lg font-black italic uppercase tracking-tighter text-white">System Error</p>
          <p className="mt-2 text-sm font-medium text-slate-400">{this.state.message}</p>
          <button
            type="button"
            onClick={() => {
              this.setState({ hasError: false, message: "" });
              this.props.onReset();
            }}
            className="mt-8 inline-flex h-12 w-full items-center justify-center rounded-2xl bg-primary text-sm font-black uppercase tracking-widest text-white hover:scale-[1.02] active:scale-95 transition-all shadow-lg shadow-primary/20"
          >
            Reset Session
          </button>
        </div>
      </div>
    );
  }
}

export default function Profile() {
  const { user } = useAuth();
  const { displayName, avatarUrl, updateProfile, refetch, athleteProfile, loading } = useMyProfile();
  const { stats } = useUserStats();
  const { notifications, markRead } = useNotifications({ limit: 12 });
  const isMobile = useIsMobile();
  const [badges, setBadges] = useState<UserBadgeWithDetail[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [addFeedOpen, setAddFeedOpen] = useState(false);
  const [addFeedKind, setAddFeedKind] = useState<AddFeedKind>("post");
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const [shareCopiedAt, setShareCopiedAt] = useState<number | null>(null);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [repAvg, setRepAvg] = useState<number | null>(null);
  const [repCount, setRepCount] = useState<number>(0);
  const [statusText, setStatusText] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  useEffect(() => {
    let cancelled = false;
    getMyBadges().then(({ data }) => {
      if (!cancelled) setBadges((data as UserBadgeWithDetail[]) ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (editOpen) setEditDisplayName(displayName ?? "");
  }, [editOpen, displayName]);

  useEffect(() => {
    const qs = new URLSearchParams(location.search);
    if (qs.get("settings") === "1") {
      setEditOpen(true);
    } else {
      setEditOpen(false);
    }
  }, [location.search]);

  useEffect(() => {
    if (!user?.id) {
      setRepAvg(null);
      setRepCount(0);
      return;
    }
    let cancelled = false;
    void getAthleteReputation(user.id).then((r) => {
      if (cancelled) return;
      if (r.error || !r.data) {
        setRepAvg(null);
        setRepCount(0);
      } else {
        setRepAvg(typeof r.data.sportsmanship_avg === "number" ? r.data.sportsmanship_avg : null);
        setRepCount(r.data.sportsmanship_count ?? 0);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setStatusText(null);
      return;
    }
    let cancelled = false;
    void getLatestStatus(user.id).then((r) => {
      if (cancelled) return;
      setStatusText(r.data?.body ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  const handleShare = async () => {
    const url = user?.id
      ? `${window.location.origin}/athlete/${user.id}`
      : `${window.location.origin}/profile`;
    const handle = athleteProfile.handle?.replace(/^@/, "") || "";
    const sports = (athleteProfile.primarySports ?? []).slice(0, 2).join(" · ");
    const lvl = stats?.level ?? 1;
    const headline = `${displayName?.trim() || "Player"}${handle ? ` @${handle}` : ""} · FUN`;
    const detail = [sports && `Sports: ${sports}`, `Lvl ${lvl}`].filter(Boolean).join(" · ");
    const textBlock = [headline, detail].filter(Boolean).join("\n");
    const fullBlock = [textBlock, url].join("\n");

    const shareData: ShareData = { title: headline, text: textBlock, url };
    const canNativeShare =
      typeof navigator.share === "function" &&
      (!navigator.canShare || navigator.canShare(shareData));

    if (canNativeShare) {
      try {
        await navigator.share(shareData);
        return;
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
      }
    }

    try {
      await navigator.clipboard.writeText(fullBlock);
      setShareCopiedAt(Date.now());
      window.setTimeout(() => setShareCopiedAt(null), 2500);
    } catch {
      try {
        await navigator.clipboard.writeText(url);
        setShareCopiedAt(Date.now());
        window.setTimeout(() => setShareCopiedAt(null), 2500);
      } catch {
        window.prompt("Copy this profile link:", url);
      }
    }
  };

  const fallbackInitial = (displayName?.trim() || "?")[0].toUpperCase();
  const primarySports = athleteProfile.primarySports ?? [];
  const pinnedPost = (athleteProfile.posts ?? []).find((p) => p.pinned) ?? null;
  const followingCount = readFollowedIds().size;
  const homeBaseLabel =
    athleteProfile.snapshot?.neighbourhood?.trim() ||
    athleteProfile.city?.trim() ||
    null;

  const openAddPost = () => {
    setAddFeedKind("post");
    setAddFeedOpen(true);
  };

  const openAddReel = () => {
    setAddFeedKind("reel");
    setAddFeedOpen(true);
  };

  return (
    <div className="min-h-screen w-full bg-[#050505] text-white selection:bg-primary selection:text-white">
      {/* Dynamic Background Elements */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[10%] -right-[10%] size-[50%] rounded-full bg-primary/10 blur-[120px]" />
        <div className="absolute bottom-[5%] -left-[5%] size-[40%] rounded-full bg-blue-500/5 blur-[100px]" />
      </div>

      <ProfileHubHeader
        onBack={() => navigate("/")}
        onOpenSettings={() => {
          navigate("/profile?settings=1");
          setEditOpen(true);
        }}
        notifications={notifications}
        unreadCount={unreadCount}
        onMarkRead={markRead}
      />

      <main className="relative mx-auto w-full max-w-6xl px-4 md:px-8 pb-32 pt-16">
        {loading ? (
          <div className="space-y-8 animate-pulse">
            <div className="h-80 rounded-[48px] bg-white/[0.03]" />
            <div className="grid grid-cols-4 gap-4">
              {[1, 2, 3, 4].map(i => <div key={i} className="h-24 rounded-3xl bg-white/[0.03]" />)}
            </div>
            <div className="h-64 rounded-[40px] bg-white/[0.03]" />
          </div>
        ) : (
          <div className="space-y-8">
            <ProfileHubHero
              displayName={displayName?.trim() || "Player"}
              handle={athleteProfile.handle ?? null}
              avatarUrl={avatarUrl}
              fallbackInitial={fallbackInitial}
              verified={!!athleteProfile.verified}
              rating={repAvg ?? athleteProfile.trust?.sportsmanship ?? null}
              ratingCount={repCount}
              gamesPlayed={stats?.games_played_total ?? 0}
              statusText={statusText}
              bio={athleteProfile.bio ?? null}
              performanceMetrics={athleteProfile.performanceMetrics ?? []}
              primarySports={primarySports}
              followersCount={0}
              followingCount={followingCount}
              homeBaseLabel={homeBaseLabel}
              onShare={() => void handleShare()}
              onAbout={() => setAboutOpen(true)}
              discoverExpanded={discoverOpen}
              onDiscoverPeople={() => setDiscoverOpen((v) => !v)}
              isOwnProfile={true}
              className="animate-in fade-in slide-in-from-top-4 duration-700"
            />

            {shareCopiedAt !== null && (
              <div className="fixed top-20 right-8 z-[80] animate-in fade-in zoom-in slide-in-from-top-2">
                <Badge className="bg-emerald-500 text-white border-none font-black px-4 py-2 shadow-lg shadow-emerald-500/20">
                  LINK COPIED ⚡
                </Badge>
              </div>
            )}

            {/* Carousel + Stories grouped so collapsed carousel takes 0 height */}
            <div className="animate-in fade-in slide-in-from-top-2 duration-700">
              {user?.id && (
                <div className={cn(
                  "overflow-hidden transition-all duration-500",
                  discoverOpen ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0 pointer-events-none"
                )}>
                  <div className="rounded-[40px] border border-white/[0.05] bg-white/[0.02] p-6 backdrop-blur-xl">
                    {discoverOpen && (
                      <div className="mb-4 px-1 space-y-0.5">
                        <h2 className="text-xl font-bold text-white tracking-tight uppercase italic flex items-center gap-2">
                          Global Network
                          <span className="inline-block size-1.5 rounded-full bg-blue-500 animate-pulse" />
                        </h2>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-[0.2em] font-bold">Discover Athletes</p>
                      </div>
                    )}
                    <DiscoveredPeopleCarousel
                      expanded={discoverOpen}
                      onClose={() => setDiscoverOpen(false)}
                      excludeUserId={user.id}
                      primarySports={primarySports}
                    />
                  </div>
                </div>
              )}

              {/* Stories Rail — sits immediately after collapsed (0-height) carousel */}
              <div className={cn("px-1", discoverOpen ? "mt-4" : "mt-0")}>
                <StoriesRail
                  stories={athleteProfile.stories ?? []}
                  allowCreate={true}
                  onCreateStory={async (story) => {
                    const err = await updateProfile({
                      athlete_profile: mergeAthleteProfile(athleteProfile, {
                        stories: [...(athleteProfile.stories ?? []), story],
                      }),
                    });
                    if (err) throw new Error(err.message);
                    await refetch();
                  }}
                />
              </div>
            </div>

            {/* Composer */}
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200">
              <ProfileComposerCard
                onPhoto={openAddPost}
                onVideo={openAddReel}
                onSubmitText={async (text) => {
                  const postId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `post-${Date.now()}`;
                  const newPost = { id: postId, caption: text, timeAgo: "now" };
                  const nextProfile = { ...athleteProfile, posts: [newPost, ...(athleteProfile.posts ?? [])] };
                  
                  const err = await updateProfile({ athlete_profile: nextProfile });
                  if (err) throw new Error(err.message);

                  await upsertMyStatus(text);
                  setStatusText(text);
                  await refetch();
                }}
              />
            </div>

            {/* Activity Hub */}
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300">
              <PostsReelsSection
                variant="hub"
                reels={athleteProfile.highlights ?? []}
                posts={athleteProfile.posts ?? []}
                pinnedPost={pinnedPost}
                onAddReel={openAddReel}
                onAddPost={openAddPost}
                userMeta={{
                  name: displayName || undefined,
                  handle: athleteProfile.handle || undefined,
                  avatarUrl: avatarUrl || undefined,
                }}
              />
            </div>
          </div>
        )}

        <AboutSheet
          open={aboutOpen}
          onOpenChange={setAboutOpen}
          side={isMobile ? "bottom" : "right"}
          wide={!isMobile}
          performanceMetrics={athleteProfile.performanceMetrics ?? []}
          primarySports={primarySports}
        >
          <div className="p-6 md:p-8 space-y-10">
            <header className="space-y-2">
              <h2 className="text-3xl font-black italic uppercase tracking-tighter text-white">Player Specs</h2>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Verified Athletic Profile</p>
            </header>

            <section className="space-y-6">
              <h3 className="text-sm font-black uppercase tracking-[0.2em] text-primary">Performance</h3>
              <div className="grid gap-4">
                <div className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.03] border border-white/5">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Skill Level</span>
                  <span className="text-sm font-black text-white italic uppercase">Level {stats?.level ?? 1}</span>
                </div>
                {athleteProfile.availability && (
                  <div className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.03] border border-white/5">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Availability</span>
                    <span className="text-sm font-black text-white italic uppercase">{athleteProfile.availability.replaceAll("_", " ")}</span>
                  </div>
                )}
                {athleteProfile.snapshot?.intensity && (
                  <div className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.03] border border-white/5">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Intensity</span>
                    <span className="text-sm font-black text-white italic uppercase">{athleteProfile.snapshot.intensity}</span>
                  </div>
                )}
              </div>
            </section>

            <section className="space-y-6">
              <h3 className="text-sm font-black uppercase tracking-[0.2em] text-primary">Athlete Specs</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-5 rounded-[32px] bg-white/[0.03] border border-white/5 space-y-1">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Height</p>
                  <p className="text-sm font-black text-white italic uppercase">{athleteProfile.snapshot?.height || "—"}</p>
                </div>
                <div className="p-5 rounded-[32px] bg-white/[0.03] border border-white/5 space-y-1">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Weight</p>
                  <p className="text-sm font-black text-white italic uppercase">{athleteProfile.snapshot?.weight || "—"}</p>
                </div>
                <div className="p-5 rounded-[32px] bg-white/[0.03] border border-white/5 space-y-1">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Dominant Side</p>
                  <p className="text-sm font-black text-white italic uppercase">{athleteProfile.snapshot?.handedness || "—"}</p>
                </div>
                <div className="p-5 rounded-[32px] bg-white/[0.03] border border-white/5 space-y-1">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Experience</p>
                  <p className="text-sm font-black text-white italic uppercase">{athleteProfile.snapshot?.yearsExperience ? `${athleteProfile.snapshot.yearsExperience} YRS` : "—"}</p>
                </div>
              </div>
            </section>

            <section className="space-y-6">
              <h3 className="text-sm font-black uppercase tracking-[0.2em] text-primary">Trust Matrix</h3>
              <div className="p-6 rounded-[32px] bg-emerald-500/[0.03] border border-emerald-500/10 space-y-6">
                <div className="space-y-3">
                  <div className="flex justify-between items-center px-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Sportsmanship</span>
                    <span className="text-sm font-black text-emerald-400">{repAvg?.toFixed(1) || "0.0"} / 5.0</span>
                  </div>
                  <Progress value={(repAvg || 0) * 20} className="h-1.5 bg-white/5 [&>[data-slot=progress-indicator]]:bg-emerald-500" />
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center px-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Reliability</span>
                    <span className="text-sm font-black text-cyan-400">{athleteProfile.trust?.showUpRate || 0}%</span>
                  </div>
                  <Progress value={athleteProfile.trust?.showUpRate || 0} className="h-1.5 bg-white/5 [&>[data-slot=progress-indicator]]:bg-cyan-500" />
                </div>
              </div>
            </section>

            {athleteProfile.bio?.trim() && (
              <section className="space-y-4">
                <h3 className="text-sm font-black uppercase tracking-[0.2em] text-primary">Manifesto</h3>
                <p className="text-base font-medium text-slate-300 leading-relaxed italic">"{athleteProfile.bio.trim()}"</p>
              </section>
            )}

            <section className="space-y-6">
              <h3 className="text-sm font-black uppercase tracking-[0.2em] text-primary">Stats</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-5 rounded-[32px] bg-white/[0.03] border border-white/5">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Total Games</p>
                  <p className="text-2xl font-black italic tracking-tighter text-white">{stats?.games_played_total || 0}</p>
                </div>
                <div className="p-5 rounded-[32px] bg-white/[0.03] border border-white/5">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Live Streak</p>
                  <p className="text-2xl font-black italic tracking-tighter text-white">{stats?.current_streak_days || 0}D</p>
                </div>
              </div>
            </section>

            <section className="space-y-6">
              <h3 className="text-sm font-black uppercase tracking-[0.2em] text-primary">Journey</h3>
              <ExperienceTimeline
                items={athleteProfile.experience ?? []}
                hideHeading
                className="border-0 rounded-none bg-transparent px-0"
              />
            </section>

            <section className="pt-4">
              <ProfileBadgesSection badges={badges} className="border-0 rounded-none bg-transparent px-0" />
            </section>
          </div>
        </AboutSheet>

        <QuickStatusPostDialog
          open={statusDialogOpen}
          onOpenChange={setStatusDialogOpen}
          onSave={async (post) => {
            const postId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `post-${Date.now()}`;
            const newPost = { id: postId, caption: post.caption, timeAgo: "now" };
            const nextProfile = { ...athleteProfile, posts: [newPost, ...(athleteProfile.posts ?? [])] };
            
            const profileErr = await updateProfile({ athlete_profile: nextProfile });
            if (profileErr) throw new Error(profileErr.message);

            await upsertMyStatus(post.caption);
            setStatusText(post.caption);
            await refetch();
          }}
        />

        <AddPostOrReelDialog
          open={addFeedOpen}
          onOpenChange={setAddFeedOpen}
          kind={addFeedKind}
          onSave={async (item) => {
            if (item.type === "post") {
              const err = await updateProfile({
                athlete_profile: mergeAthleteProfile(athleteProfile, {
                  posts: [...(athleteProfile.posts ?? []), item.post],
                }),
              });
              if (err) throw new Error(err.message);
            } else {
              const err = await updateProfile({
                athlete_profile: mergeAthleteProfile(athleteProfile, {
                  highlights: [...(athleteProfile.highlights ?? []), item.highlight],
                }),
              });
              if (err) throw new Error(err.message);
            }
            await refetch();
          }}
        />

        <ProfileSettingsErrorBoundary
          onReset={() => {
            setEditOpen(false);
            navigate("/profile", { replace: true });
          }}
        >
          <ProfileEditSheet
            open={editOpen}
            onOpenChange={(open) => {
              setEditOpen(open);
              if (!open) navigate("/profile", { replace: true });
            }}
            editDisplayName={editDisplayName}
            onEditDisplayNameChange={setEditDisplayName}
            currentAvatarUrl={avatarUrl}
            athleteProfile={athleteProfile}
            profileLevel={stats?.level ?? 1}
            profileXp={stats?.xp ?? 0}
            onSignOut={() => void handleSignOut()}
            onSaveAthleteProfile={async (next, options) => {
              let avatar_url: string | undefined;
              if (options?.avatarFile) {
                const { url, error: upErr } = await uploadAvatarImage(options.avatarFile);
                if (upErr) throw new Error(upErr.message);
                if (url) avatar_url = url;
              }
              const err = await updateProfile({
                display_name: editDisplayName.trim() || null,
                ...(avatar_url !== undefined ? { avatar_url } : {}),
                athlete_profile: next,
              });
              if (err) throw new Error(err.message);
              await refetch();
            }}
          />
        </ProfileSettingsErrorBoundary>
      </main>
    </div>
  );
}
