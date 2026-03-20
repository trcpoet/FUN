import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useMyProfile } from "../../hooks/useMyProfile";
import { useUserStats } from "../../hooks/useUserStats";
import { signOut, getMyBadges, uploadAvatarImage } from "../../lib/api";
import { useIsMobile } from "../components/ui/use-mobile";
import {
  ProfileHero,
  ProfileActionRow,
  AthleticSnapshotCard,
  SportsSkillCard,
  PerformanceMetricsSection,
  ExperienceTimeline,
  ProfileEditSheet,
  ProfileStickyBar,
  StoriesRail,
  PostsReelsSection,
  AddPostOrReelDialog,
  type AddFeedKind,
  AboutSheet,
  TrustRatingsBlock,
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
              <ProfileActionRow isOwnProfile onAbout={() => setAboutOpen(true)} onShare={handleShare} />

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
            <h3 className="text-sm font-semibold text-white mb-3">Stats</h3>
            <div className="space-y-6">
              <AthleticSnapshotCard
                snapshot={athleteProfile.snapshot}
                hideHeading
                className="border-0 border-b border-white/[0.06] rounded-none bg-transparent pb-6"
              />
              <SportsSkillCard
                primarySports={primarySports}
                secondarySports={athleteProfile.secondarySports ?? []}
                sportsSkills={athleteProfile.sportsSkills ?? []}
                skillRatings={athleteProfile.skillRatings ?? []}
                hideHeading
                className="border-0 border-b border-white/[0.06] rounded-none bg-transparent pb-6"
              />
              <PerformanceMetricsSection
                metrics={athleteProfile.performanceMetrics ?? []}
                primarySports={primarySports}
                hideHeading
                className="border-0 rounded-none bg-transparent"
              />
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-white mb-3">Journey</h3>
            <ExperienceTimeline
              items={athleteProfile.experience ?? []}
              hideHeading
              className="border-0 rounded-none bg-transparent"
            />
          </div>

          <div>
            <h3 className="text-sm font-semibold text-white mb-3">Trust</h3>
            <TrustRatingsBlock trust={athleteProfile.trust} className="mb-6" />
            {(athleteProfile.endorsements ?? []).length > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Teammate quotes</p>
                <ul className="space-y-3">
                  {(athleteProfile.endorsements ?? []).map((e) => (
                    <li
                      key={e.id}
                      className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 text-sm text-slate-200"
                    >
                      <p className="leading-relaxed">&ldquo;{e.quote}&rdquo;</p>
                      <p className="text-xs text-slate-500 mt-2">
                        — {e.authorName}
                        {e.relation ? ` · ${e.relation}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="mt-8">
              <ProfileBadgesSection badges={badges} className="border-0 rounded-none bg-transparent" />
            </div>
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
