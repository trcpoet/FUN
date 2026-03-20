import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useMyProfile } from "../../hooks/useMyProfile";
import { useUserStats } from "../../hooks/useUserStats";
import { signOut, getMyBadges, uploadAvatarImage } from "../../lib/api";
import { useIsMobile } from "../components/ui/use-mobile";
import {
  ProfileHero,
  ProfileActionRow,
  ExperienceTimeline,
  ProfileEditSheet,
  ProfileStickyBar,
  StoriesRail,
  PostsReelsSection,
  AddPostOrReelDialog,
  type AddFeedKind,
  AboutSheet,
  DiscoveredPeopleCarousel,
  ProfileBadgesSection,
  type UserBadgeWithDetail,
} from "../components/athlete-profile";
import { mergeAthleteProfile } from "../../lib/athleteProfile";
import { cn } from "../components/ui/utils";
import { useAuth } from "../contexts/AuthContext";

export default function Profile() {
  const { user } = useAuth();
  const { displayName, avatarUrl, updateProfile, refetch, athleteProfile, loading } = useMyProfile();
  const { stats } = useUserStats();
  const isMobile = useIsMobile();
  const [badges, setBadges] = useState<UserBadgeWithDetail[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [addFeedOpen, setAddFeedOpen] = useState(false);
  const [addFeedKind, setAddFeedKind] = useState<AddFeedKind>("post");
  const [aboutOpen, setAboutOpen] = useState(false);
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [sticky, setSticky] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

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
    const hero = heroRef.current;
    if (!hero || loading) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        setSticky(!e.isIntersecting);
      },
      { threshold: 0, rootMargin: "-52px 0px 0px 0px" },
    );
    obs.observe(hero);
    return () => obs.disconnect();
  }, [loading]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  const handleShare = () => {
    const url = user?.id
      ? `${window.location.origin}/athlete/${user.id}`
      : `${window.location.origin}/profile`;
    const handle = athleteProfile.handle?.replace(/^@/, "") || "";
    const sports = (athleteProfile.primarySports ?? []).slice(0, 2).join(" · ");
    const lvl = stats?.level ?? 1;
    const block = [
      `${displayName?.trim() || "Player"}${handle ? ` @${handle}` : ""} · FUN`,
      [sports && `Sports: ${sports}`, `Lvl ${lvl}`].filter(Boolean).join(" · "),
      url,
    ]
      .filter(Boolean)
      .join("\n");
    void navigator.clipboard.writeText(block).catch(() => navigator.clipboard.writeText(url));
  };

  const fallbackInitial = (displayName?.trim() || "?")[0].toUpperCase();
  const primarySports = athleteProfile.primarySports ?? [];
  const pinnedPost = (athleteProfile.posts ?? []).find((p) => p.pinned) ?? null;

  const shellClass = cn(
    "mx-auto w-full px-4 pb-24 pt-0",
    isMobile ? "max-w-lg" : "max-w-6xl md:px-10 lg:px-14",
  );

  return (
    <div className="min-h-screen w-full bg-[#080c14] text-white">
      <ProfileStickyBar
        visible={sticky && !loading}
        displayName={displayName?.trim() || "Player"}
        avatarUrl={avatarUrl}
        fallbackInitial={fallbackInitial}
        onBack={() => navigate("/")}
        onOpenSettings={() => setEditOpen(true)}
        onShare={handleShare}
      />

      <div className={shellClass}>
        {loading ? (
          <div className="mt-4 rounded-2xl bg-white/[0.04] h-64 animate-pulse" />
        ) : (
          <>
            <div ref={heroRef}>
              <div className={cn(!isMobile && "rounded-b-3xl overflow-hidden")}>
                <ProfileHero
                  displayName={displayName?.trim() || "Player"}
                  handle={athleteProfile.handle ?? null}
                  city={athleteProfile.city ?? null}
                  avatarUrl={avatarUrl}
                  favoriteSport={athleteProfile.favoriteSport ?? null}
                  fallbackInitial={fallbackInitial}
                  primarySports={primarySports}
                  sportsSkills={athleteProfile.sportsSkills ?? []}
                  snapshot={athleteProfile.snapshot}
                  skillRatings={athleteProfile.skillRatings ?? []}
                  bio={athleteProfile.bio ?? null}
                  level={stats?.level ?? 1}
                  xp={stats?.xp ?? 0}
                  tierLabel={athleteProfile.athleteTierLabel ?? null}
                  availability={athleteProfile.availability ?? null}
                  verified={!!athleteProfile.verified}
                  sportsmanshipBadge={!!athleteProfile.sportsmanshipBadge}
                  lastGameIso={stats?.last_game_date ?? null}
                  onBack={() => navigate("/")}
                  onOpenSettings={() => setEditOpen(true)}
                  minimal
                  isDesktop={!isMobile}
                />
              </div>
            </div>

            <div className="space-y-5 pt-4">
              <ProfileActionRow
                isOwnProfile
                onAbout={() => setAboutOpen(true)}
                onShare={handleShare}
                discoverExpanded={discoverOpen}
                onDiscoverPeople={() => setDiscoverOpen((v) => !v)}
              />

              <div className="space-y-2">
                {user?.id ? (
                  <DiscoveredPeopleCarousel
                    expanded={discoverOpen}
                    onClose={() => setDiscoverOpen(false)}
                    excludeUserId={user.id}
                    primarySports={primarySports}
                  />
                ) : null}

                <StoriesRail
                  stories={athleteProfile.stories ?? []}
                  allowCreate
                  onCreateStory={async (story) => {
                    const err = await updateProfile({
                      athlete_profile: mergeAthleteProfile(athleteProfile, {
                        stories: [...(athleteProfile.stories ?? []), story],
                      }),
                    });
                    if (err) throw new Error(err.message);
                  }}
                />
              </div>

              <PostsReelsSection
                reels={athleteProfile.highlights ?? []}
                posts={athleteProfile.posts ?? []}
                pinnedPost={pinnedPost}
                onAddReel={() => {
                  setAddFeedKind("reel");
                  setAddFeedOpen(true);
                }}
                onAddPost={() => {
                  setAddFeedKind("post");
                  setAddFeedOpen(true);
                }}
              />
            </div>
          </>
        )}

        <AboutSheet
          open={aboutOpen}
          onOpenChange={setAboutOpen}
          side={isMobile ? "bottom" : "right"}
          wide={!isMobile}
        >
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
            <h3 className="text-sm font-semibold text-white mb-3">Games</h3>
            {stats ? (
              <div className="space-y-2 text-sm text-slate-300">
                <p>
                  Games played{" "}
                  <span className="text-white font-semibold tabular-nums">{stats.games_played_total}</span>
                </p>
                <p>
                  Current streak{" "}
                  <span className="text-white font-semibold tabular-nums">{stats.current_streak_days} days</span>
                </p>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Play games to see your activity here.</p>
            )}
          </div>

          <div>
            <h3 className="text-sm font-semibold text-white mb-3">Journey</h3>
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
          }}
        />
      </div>
    </div>
  );
}
