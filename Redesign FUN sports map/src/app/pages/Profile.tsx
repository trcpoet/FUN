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
  ProfileActionRow,
  DiscoveredPeopleCarousel,
} from "../components/athlete-profile";
import { mergeAthleteProfile } from "../../lib/athleteProfile";
import { readFollowedIds } from "../../lib/localFollows";
import { cn } from "../components/ui/utils";
import { useAuth } from "../contexts/AuthContext";
import { getAthleteReputation } from "../../lib/endorsements";
import { getLatestStatus, upsertMyStatus } from "../../lib/status";

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
  const openedSettingsRef = useRef(false);

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
    if (openedSettingsRef.current) return;
    const qs = new URLSearchParams(location.search);
    if (qs.get("settings") === "1") {
      openedSettingsRef.current = true;
      setEditOpen(true);
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
        /* fall through to clipboard */
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

  /* pt-14 clears fixed header on all breakpoints (hero no longer extends under the bar). */
  const shellClass = cn("mx-auto w-full max-w-lg px-3 pb-28 pt-14 md:max-w-6xl md:px-8");

  return (
    <div className="min-h-screen w-full bg-[#0D1117] text-white">
      <ProfileHubHeader
        onBack={() => navigate("/")}
        onOpenSettings={() => setEditOpen(true)}
        notifications={notifications}
        unreadCount={unreadCount}
        onMarkRead={markRead}
      />

      <div className={shellClass}>
        {loading ? (
          <div className="mt-4 space-y-4 md:mt-0">
            <div className="h-48 animate-pulse rounded-2xl bg-white/[0.04]" />
            <div className="h-16 animate-pulse rounded-xl bg-white/[0.04]" />
            <div className="h-32 animate-pulse rounded-xl bg-white/[0.04]" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1">
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
              />
              {shareCopiedAt !== null ? (
                <p className="text-right text-xs text-emerald-400/95" role="status">
                  Copied to clipboard
                </p>
              ) : null}
            </div>

            {/* Desktop: metrics + discover toggle on one row; discover panel expands below and pushes content down. */}
            <div className="hidden md:block">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <PerformanceStatsStrip metrics={athleteProfile.performanceMetrics ?? []} primarySports={primarySports} />
                </div>
                <ProfileActionRow
                  isOwnProfile
                  discoverExpanded={discoverOpen}
                  onDiscoverPeople={() => setDiscoverOpen((v) => !v)}
                />
              </div>
              {user?.id ? (
                <div className="mt-3">
                  <DiscoveredPeopleCarousel
                    expanded={discoverOpen}
                    onClose={() => setDiscoverOpen(false)}
                    excludeUserId={user.id}
                    primarySports={primarySports}
                  />
                </div>
              ) : null}
            </div>

            {/* Mobile: discover toggle lives as its own row (metrics already inside the hero). */}
            <div className="md:hidden">
              <ProfileActionRow
                isOwnProfile
                discoverExpanded={discoverOpen}
                onDiscoverPeople={() => setDiscoverOpen((v) => !v)}
              />
              {user?.id ? (
                <div className="mt-3">
                  <DiscoveredPeopleCarousel
                    expanded={discoverOpen}
                    onClose={() => setDiscoverOpen(false)}
                    excludeUserId={user.id}
                    primarySports={primarySports}
                  />
                </div>
              ) : null}
            </div>

            <ProfileComposerCard
              onPhoto={openAddPost}
              onVideo={openAddReel}
              onStatus={() => setStatusDialogOpen(true)}
            />

            <PostsReelsSection
              variant="hub"
              reels={athleteProfile.highlights ?? []}
              posts={athleteProfile.posts ?? []}
              pinnedPost={pinnedPost}
              onAddReel={openAddReel}
              onAddPost={openAddPost}
            />
          </div>
        )}

        <AboutSheet
          open={aboutOpen}
          onOpenChange={setAboutOpen}
          side={isMobile ? "bottom" : "right"}
          wide={!isMobile}
        >
          <div>
            <h3 className="mb-3 text-sm font-semibold text-white">Player info</h3>
            <ul className="space-y-2 text-sm text-slate-300">
              <li>
                <span className="text-slate-500">Skill level · </span>
                <span className="text-white">Level {stats?.level ?? 1}</span>
              </li>
              {athleteProfile.availability ? (
                <li>
                  <span className="text-slate-500">Availability · </span>
                  <span className="text-white">{athleteProfile.availability.replaceAll("_", " ")}</span>
                </li>
              ) : null}
              {athleteProfile.snapshot?.intensity ? (
                <li>
                  <span className="text-slate-500">Intensity · </span>
                  <span className="text-white">{athleteProfile.snapshot.intensity}</span>
                </li>
              ) : null}
              {athleteProfile.trust?.showUpRate != null ? (
                <li>
                  <span className="text-slate-500">Show up rate · </span>
                  <span className="font-semibold tabular-nums text-white">
                    {Math.round(athleteProfile.trust.showUpRate * 100)}%
                  </span>
                </li>
              ) : null}
              {athleteProfile.trust?.sportsmanship != null ? (
                <li>
                  <span className="text-slate-500">Rating · </span>
                  <span className="font-semibold tabular-nums text-white">
                    {athleteProfile.trust.sportsmanship.toFixed(1)}
                  </span>
                </li>
              ) : null}
              <li>
                <span className="text-slate-500">Last active · </span>
                <span className="text-white">—</span>
              </li>
            </ul>
          </div>

          {athleteProfile.bio?.trim() ? (
            <div>
              <h3 className="mb-3 text-sm font-semibold text-white">Athlete tagline</h3>
              <p className="text-sm leading-relaxed text-slate-300">{athleteProfile.bio.trim()}</p>
            </div>
          ) : null}

          {(athleteProfile.snapshot?.university?.trim() ||
            athleteProfile.city?.trim() ||
            athleteProfile.snapshot?.neighbourhood?.trim() ||
            athleteProfile.favoriteSport?.trim()) && (
            <div>
              <h3 className="mb-3 text-sm font-semibold text-white">Location &amp; school</h3>
              <ul className="space-y-2 text-sm text-slate-300">
                {athleteProfile.snapshot?.university?.trim() ? (
                  <li>
                    <span className="text-slate-500">University · </span>
                    <span className="text-white">{athleteProfile.snapshot.university.trim()}</span>
                  </li>
                ) : null}
                {athleteProfile.city?.trim() ? (
                  <li>
                    <span className="text-slate-500">City / area · </span>
                    <span className="text-white">{athleteProfile.city.trim()}</span>
                  </li>
                ) : null}
                {athleteProfile.snapshot?.neighbourhood?.trim() ? (
                  <li>
                    <span className="text-slate-500">Neighbourhood · </span>
                    <span className="text-white">{athleteProfile.snapshot.neighbourhood.trim()}</span>
                  </li>
                ) : null}
                {athleteProfile.favoriteSport?.trim() ? (
                  <li>
                    <span className="text-slate-500">Favorite sport · </span>
                    <span className="text-white">{athleteProfile.favoriteSport.trim()}</span>
                  </li>
                ) : null}
              </ul>
            </div>
          )}

          <div>
            <h3 className="mb-3 text-sm font-semibold text-white">Games</h3>
            {stats ? (
              <div className="space-y-2 text-sm text-slate-300">
                <p>
                  Games played{" "}
                  <span className="font-semibold tabular-nums text-white">{stats.games_played_total}</span>
                </p>
                <p>
                  Current streak{" "}
                  <span className="font-semibold tabular-nums text-white">{stats.current_streak_days} days</span>
                </p>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Play games to see your activity here.</p>
            )}
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold text-white">Journey</h3>
            <ExperienceTimeline
              items={athleteProfile.experience ?? []}
              hideHeading
              className="border-0 rounded-none bg-transparent"
            />
          </div>

          <div className="pt-2">
            <ProfileBadgesSection badges={badges} className="border-0 rounded-none bg-transparent" />
          </div>
        </AboutSheet>

        <QuickStatusPostDialog
          open={statusDialogOpen}
          onOpenChange={setStatusDialogOpen}
          onSave={async (post) => {
            const err = await upsertMyStatus(post.caption);
            if (err) throw new Error(err.message);
            setStatusText(post.caption);
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

        <ProfileEditSheet
          open={editOpen}
          onOpenChange={setEditOpen}
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
      </div>
    </div>
  );
}
