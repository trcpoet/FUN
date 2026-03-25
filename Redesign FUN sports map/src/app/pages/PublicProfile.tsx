import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useAuth } from "../contexts/AuthContext";
import { getPublicProfileById } from "../../lib/api";
import type { AthleteProfilePayload } from "../../lib/athleteProfile";
import { useIsMobile } from "../components/ui/use-mobile";
import { ProfileHero, ProfileActionRow } from "../components/athlete-profile";
import { cn } from "../components/ui/utils";
import { isFollowing, toggleFollowing } from "../../lib/localFollows";

/**
 * Read-only athlete profile opened from map search (or shared link).
 * Does not expose map coordinates — only public profile JSON + display fields.
 */
export default function PublicProfile() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [athleteProfile, setAthleteProfile] = useState<AthleteProfilePayload | null>(null);
  const [following, setFollowing] = useState(false);

  useEffect(() => {
    if (!userId) {
      setErr("Missing profile");
      setLoading(false);
      return;
    }
    if (user?.id === userId) {
      navigate("/profile", { replace: true });
      return;
    }
    let cancelled = false;
    setLoading(true);
    void getPublicProfileById(userId).then((res) => {
      if (cancelled) return;
      if (res.error) {
        setErr(res.error.message);
        setAthleteProfile(null);
      } else {
        setErr(null);
        setDisplayName(res.displayName);
        setAvatarUrl(res.avatarUrl);
        setAthleteProfile(res.athleteProfile);
        setFollowing(isFollowing(userId));
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, user?.id, navigate]);

  const ap = athleteProfile;
  const fallbackInitial = (displayName?.trim() || "?")[0]?.toUpperCase() ?? "?";
  const primarySports = ap?.primarySports ?? [];

  const shellClass = cn(
    "mx-auto w-full px-4 pb-24 pt-0",
    isMobile ? "max-w-lg" : "max-w-6xl md:px-10 lg:px-14",
  );

  return (
    <div className="min-h-screen w-full bg-[#080c14] text-white">
      <div className={shellClass}>
        {loading ? (
          <div className="mt-4 rounded-2xl bg-white/[0.04] h-64 animate-pulse" />
        ) : err || !ap ? (
          <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-center text-slate-300">
            <p className="text-sm">{err ?? "Profile unavailable."}</p>
            <button
              type="button"
              className="mt-4 text-emerald-400 font-semibold text-sm"
              onClick={() => navigate("/")}
            >
              Back to map
            </button>
          </div>
        ) : (
          <>
            <div className="rounded-b-3xl overflow-hidden">
              <ProfileHero
                displayName={displayName?.trim() || "Player"}
                handle={ap.handle ?? null}
                city={ap.city ?? null}
                avatarUrl={avatarUrl}
                favoriteSport={ap.favoriteSport ?? null}
                fallbackInitial={fallbackInitial}
                primarySports={primarySports}
                bio={ap.bio ?? null}
                level={1}
                xp={0}
                tierLabel={ap.athleteTierLabel ?? null}
                availability={ap.availability ?? null}
                verified={!!ap.verified}
                sportsmanshipBadge={!!ap.sportsmanshipBadge}
                lastGameIso={null}
                onBack={() => navigate("/")}
                onOpenSettings={() => {}}
                readOnly
                minimal
                isDesktop={!isMobile}
              />
            </div>

            <div className="space-y-5 pt-4">
              <ProfileActionRow
                isOwnProfile={false}
                onAbout={() => {}}
                onShare={() => {
                  const url = `${window.location.origin}/athlete/${userId}`;
                  void navigator.clipboard.writeText(url);
                }}
                isFollowing={following}
                onFollow={() => {
                  if (!userId) return;
                  const res = toggleFollowing(userId);
                  setFollowing(res.next);
                }}
                onMessage={() => {
                  if (!userId) return;
                  navigate(`/?dm=${encodeURIComponent(userId)}`);
                }}
                onInvite={() => {}}
              />
              <p className="text-xs text-slate-500 text-center px-2">
                Follow, message, and invites will connect here as social features roll out.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
