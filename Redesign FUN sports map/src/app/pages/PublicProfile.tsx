import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useAuth } from "../contexts/AuthContext";
import { getPublicProfileById } from "../../lib/api";
import type { AthleteProfilePayload } from "../../lib/athleteProfile";
import { useIsMobile } from "../components/ui/use-mobile";
import { ProfileHero, ProfileActionRow } from "../components/athlete-profile";
import { cn } from "../components/ui/utils";
import { isFollowing, toggleFollowing } from "../../lib/localFollows";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { StarRating } from "../components/ui/StarRating";
import { Skeleton } from "../components/ui/skeleton";
import { Spinner } from "../components/ui/Spinner";
import { endorseAthlete, getAthleteReputation, getSharedCompletedGames } from "../../lib/endorsements";
import { getLatestStatus } from "../../lib/status";

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
  const [repAvg, setRepAvg] = useState<number | null>(null);
  const [repCount, setRepCount] = useState<number>(0);
  const [statusText, setStatusText] = useState<string | null>(null);

  const [endorseOpen, setEndorseOpen] = useState(false);
  const [sharedGames, setSharedGames] = useState<{ id: string; label: string }[]>([]);
  const [sharedGamesLoading, setSharedGamesLoading] = useState(false);
  const [endorseErr, setEndorseErr] = useState<string | null>(null);
  const [endorseGameId, setEndorseGameId] = useState<string | null>(null);
  const [endorseRating, setEndorseRating] = useState<number>(5);
  const [endorseTags, setEndorseTags] = useState<string[]>([]);
  const [endorseSaving, setEndorseSaving] = useState(false);

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
        setRepAvg(null);
        setRepCount(0);
        setStatusText(null);
      } else {
        setErr(null);
        setDisplayName(res.displayName);
        setAvatarUrl(res.avatarUrl);
        setAthleteProfile(res.athleteProfile);
        setFollowing(isFollowing(userId));
        void getAthleteReputation(userId).then((r) => {
          if (cancelled) return;
          if (r.error || !r.data) {
            setRepAvg(null);
            setRepCount(0);
          } else {
            setRepAvg(typeof r.data.sportsmanship_avg === "number" ? r.data.sportsmanship_avg : null);
            setRepCount(r.data.sportsmanship_count ?? 0);
          }
        });
        void getLatestStatus(userId).then((r) => {
          if (cancelled) return;
          setStatusText(r.data?.body ?? null);
        });
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
  const rating = repAvg ?? ap?.trust?.sportsmanship ?? null;

  const shellClass = cn(
    "mx-auto w-full px-4 pb-24 pt-0",
    isMobile ? "max-w-lg" : "max-w-6xl md:px-10 lg:px-14",
  );

  return (
    <div className="min-h-screen w-full bg-[#080c14] text-white">
      <div className={shellClass}>
        {loading ? (
          <div className="mt-4 space-y-4" role="status" aria-label="Loading profile" aria-busy="true">
            <Skeleton className="h-64 w-full rounded-2xl bg-white/[0.04]" />
            <div className="space-y-2">
              <Skeleton className="h-12 w-full rounded-xl bg-white/[0.04]" />
              <Skeleton className="h-10 w-2/3 rounded-xl bg-white/[0.04]" />
            </div>
          </div>
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
                rating={rating}
                statusText={statusText}
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
              <div className="flex flex-col items-center gap-2">
                {typeof rating === "number" ? (
                  <div className="flex items-center gap-2 text-slate-300">
                    <StarRating value={rating} size={14} className="text-amber-300/95" />
                    <span className="text-xs text-slate-500 tabular-nums">({repCount})</span>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">No endorsements yet.</p>
                )}
                <Button
                  type="button"
                  className="h-10 rounded-full bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700"
                  onClick={() => {
                    if (!userId) return;
                    setEndorseErr(null);
                    setEndorseOpen(true);
                    setSharedGames([]);
                    setEndorseGameId(null);
                    setEndorseRating(5);
                    setEndorseTags([]);
                    setSharedGamesLoading(true);
                    void getSharedCompletedGames(userId).then((res) => {
                      setSharedGamesLoading(false);
                      if (res.error || !res.data) {
                        setEndorseErr(res.error?.message ?? "Could not load shared games");
                        return;
                      }
                      const next = res.data.map((g) => ({
                        id: g.game_id,
                        label: `${g.title || "Game"}${g.sport ? ` · ${g.sport}` : ""}`,
                      }));
                      setSharedGames(next);
                      setEndorseGameId(next[0]?.id ?? null);
                    });
                  }}
                >
                  Endorse
                </Button>
              </div>
              <p className="text-xs text-slate-500 text-center px-2">
                Follow, message, and invites will connect here as social features roll out.
              </p>
            </div>
          </>
        )}
      </div>

      <Dialog open={endorseOpen} onOpenChange={setEndorseOpen}>
        <DialogContent className="max-w-[min(92vw,28rem)]">
          <DialogHeader>
            <DialogTitle>Endorse athlete</DialogTitle>
            <DialogDescription>
              Games only. Pick a completed game you both played, then leave a quick rating.
            </DialogDescription>
          </DialogHeader>

          {endorseErr ? (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {endorseErr}
            </div>
          ) : null}

          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label>Completed game</Label>
                {sharedGamesLoading ? <Spinner label="Loading games…" /> : null}
              </div>
              <Select
                value={endorseGameId ?? ""}
                onValueChange={(v) => setEndorseGameId(v || null)}
                disabled={sharedGamesLoading || sharedGames.length === 0}
              >
                <SelectTrigger className="h-10">
                  <SelectValue
                    placeholder={sharedGamesLoading ? "Loading…" : sharedGames.length === 0 ? "No shared completed games" : "Pick a game"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {sharedGames.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Rating</Label>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setEndorseRating(n)}
                      className={cn(
                        "text-2xl leading-none transition-colors",
                        n <= endorseRating ? "text-amber-300" : "text-slate-600 hover:text-slate-400",
                      )}
                      aria-label={`${n} stars`}
                    >
                      {n <= endorseRating ? "★" : "☆"}
                    </button>
                  ))}
                </div>
                <span className="text-sm text-slate-400 tabular-nums">{endorseRating}/5</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Tags (optional)</Label>
              <div className="flex flex-wrap gap-2">
                {["Shows up", "Good vibes", "Skilled"].map((t) => {
                  const on = endorseTags.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() =>
                        setEndorseTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]))
                      }
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                        on
                          ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-100"
                          : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.05]",
                      )}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEndorseOpen(false)} disabled={endorseSaving}>
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              disabled={endorseSaving || !userId || !endorseGameId || sharedGamesLoading || sharedGames.length === 0}
              onClick={() => {
                if (!userId || !endorseGameId) return;
                setEndorseErr(null);
                setEndorseSaving(true);
                void endorseAthlete({
                  athleteId: userId,
                  gameId: endorseGameId,
                  rating: endorseRating,
                  tags: endorseTags,
                }).then((e) => {
                  setEndorseSaving(false);
                  if (e) {
                    setEndorseErr(e.message);
                    return;
                  }
                  void getAthleteReputation(userId).then((r) => {
                    if (!r.error && r.data) {
                      setRepAvg(r.data.sportsmanship_avg);
                      setRepCount(r.data.sportsmanship_count);
                    }
                  });
                  setEndorseOpen(false);
                });
              }}
            >
              {endorseSaving ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner label="Submitting…" className="text-white" />
                </span>
              ) : (
                "Submit endorsement"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
