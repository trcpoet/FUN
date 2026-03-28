import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useAuth } from "../contexts/AuthContext";
import { getPublicProfileById } from "../../lib/api";
import type { AthleteProfilePayload } from "../../lib/athleteProfile";
import { useIsMobile } from "../components/ui/use-mobile";
import { ProfileHubHero, ProfileHubHeader, PostsReelsSection } from "../components/athlete-profile";
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
import { Globe, ChevronRight, Lock } from "lucide-react";

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
  const isPrivate = !!ap?.is_private;
  const hideContent = isPrivate && !following;

  return (
    <div className="min-h-screen w-full bg-[#050505] text-white selection:bg-primary selection:text-white">
      {/* Dynamic Background Elements */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[10%] -right-[10%] size-[50%] rounded-full bg-primary/10 blur-[120px]" />
        <div className="absolute bottom-[5%] -left-[5%] size-[40%] rounded-full bg-blue-500/5 blur-[100px]" />
      </div>

      <ProfileHubHeader
        onBack={() => navigate("/")}
        onOpenSettings={() => {}}
        notifications={[]}
        unreadCount={0}
        onMarkRead={() => {}}
      />

      <main className="relative mx-auto w-full max-w-6xl px-4 md:px-8 pb-32 pt-20">
        {loading ? (
          <div className="space-y-8 animate-pulse">
            <div className="h-80 rounded-[48px] bg-white/[0.03]" />
            <div className="grid grid-cols-4 gap-4">
              {[1, 2, 3, 4].map(i => <div key={i} className="h-24 rounded-3xl bg-white/[0.03]" />)}
            </div>
          </div>
        ) : err || !ap ? (
          <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.04] p-12 text-center text-slate-300">
            <p className="text-lg font-black italic uppercase tracking-tighter">{err ?? "Profile unavailable."}</p>
            <button
              type="button"
              className="mt-6 inline-flex h-10 items-center justify-center rounded-xl bg-primary px-6 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-primary/20"
              onClick={() => navigate("/")}
            >
              Back to map
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            <ProfileHubHero
              displayName={displayName?.trim() || "Player"}
              handle={ap.handle ?? null}
              avatarUrl={avatarUrl}
              fallbackInitial={fallbackInitial}
              verified={!!ap.verified}
              rating={rating}
              ratingCount={repCount}
              gamesPlayed={0}
              statusText={hideContent ? "Content restricted" : statusText}
              bio={ap.bio ?? null}
              performanceMetrics={ap.performanceMetrics ?? []}
              primarySports={primarySports}
              followersCount={0}
              followingCount={0}
              homeBaseLabel={ap.city ?? null}
              onAbout={() => {}}
              onShare={() => {
                const url = `${window.location.origin}/athlete/${userId}`;
                void navigator.clipboard.writeText(url);
              }}
              isOwnProfile={false}
              className="animate-in fade-in slide-in-from-top-4 duration-700"
            />

            <div className="flex flex-col items-center gap-6 py-4">
              <div className="flex items-center gap-4">
                <Button
                  type="button"
                  variant={following ? "outline" : "default"}
                  className={cn(
                    "h-12 px-8 rounded-2xl font-black uppercase tracking-widest text-[10px]",
                    following ? "border-white/10 text-white" : "bg-primary text-white shadow-lg shadow-primary/20"
                  )}
                  onClick={() => {
                    if (!userId) return;
                    const res = toggleFollowing(userId);
                    setFollowing(res.next);
                  }}
                >
                  {following ? "Following" : "Follow Athlete"}
                </Button>
                
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 px-8 rounded-2xl border-white/10 text-white font-black uppercase tracking-widest text-[10px]"
                  onClick={() => {
                    if (!userId) return;
                    navigate(`/?dm=${encodeURIComponent(userId)}`);
                  }}
                >
                  Message
                </Button>
              </div>

              <Button
                type="button"
                variant="ghost"
                className="text-primary font-black uppercase tracking-widest text-[10px] hover:bg-primary/10"
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
                Endorse Athlete
              </Button>
            </div>

            <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300">
              {hideContent ? (
                <div className="rounded-[48px] border-2 border-dashed border-white/5 bg-white/[0.01] py-32 text-center">
                  <div className="size-20 rounded-full bg-white/[0.03] border border-white/5 flex items-center justify-center mx-auto mb-8 shadow-2xl">
                    <Lock className="size-10 text-slate-600" />
                  </div>
                  <h3 className="text-2xl font-black italic uppercase tracking-tighter text-white">Private Profile</h3>
                  <p className="text-sm font-medium text-slate-500 mt-3 uppercase tracking-widest">Follow this athlete to see their activity</p>
                </div>
              ) : (
                <PostsReelsSection
                  variant="hub"
                  reels={ap.highlights ?? []}
                  posts={ap.posts ?? []}
                  pinnedPost={(ap.posts ?? []).find(p => p.pinned) ?? null}
                  onAddReel={() => {}}
                  onAddPost={() => {}}
                  userMeta={{
                    name: displayName || undefined,
                    handle: ap.handle || undefined,
                    avatarUrl: avatarUrl || undefined,
                  }}
                />
              )}
            </div>
          </div>
        )}
      </main>

      <Dialog open={endorseOpen} onOpenChange={setEndorseOpen}>
        <DialogContent className="max-w-[min(92vw,28rem)] rounded-[32px] border border-white/10 bg-[#0D1117]/95 backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black italic uppercase tracking-tighter text-white">Endorse athlete</DialogTitle>
            <DialogDescription className="text-xs font-medium text-slate-400 uppercase tracking-widest">
              Verified Game History Only
            </DialogDescription>
          </DialogHeader>

          {endorseErr ? (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs font-bold text-red-200">
              {endorseErr}
            </div>
          ) : null}

          <div className="space-y-6 py-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 px-1">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Shared History</Label>
                {sharedGamesLoading ? <Spinner label="Scanning…" /> : null}
              </div>
              <Select
                value={endorseGameId ?? ""}
                onValueChange={(v) => setEndorseGameId(v || null)}
                disabled={sharedGamesLoading || sharedGames.length === 0}
              >
                <SelectTrigger className="h-12 rounded-2xl bg-white/[0.03] border-white/5 text-white">
                  <SelectValue
                    placeholder={sharedGamesLoading ? "Loading…" : sharedGames.length === 0 ? "No shared completed games" : "Pick a game"}
                  />
                </SelectTrigger>
                <SelectContent className="bg-[#0D1117] border-white/10 rounded-2xl">
                  {sharedGames.map((g) => (
                    <SelectItem key={g.id} value={g.id} className="text-white hover:bg-white/5">
                      {g.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500 px-1">Reputation Score</Label>
              <div className="flex items-center gap-4 bg-white/[0.03] p-4 rounded-2xl border border-white/5">
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setEndorseRating(n)}
                      className={cn(
                        "text-3xl transition-all hover:scale-110",
                        n <= endorseRating ? "text-amber-400" : "text-white/5 hover:text-white/20",
                      )}
                      aria-label={`${n} stars`}
                    >
                      ★
                    </button>
                  ))}
                </div>
                <span className="ml-auto text-xl font-black italic text-white tabular-nums">{endorseRating}<span className="text-[10px] text-slate-500 not-italic">/5</span></span>
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500 px-1">Athlete Tags</Label>
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
                        "rounded-xl border px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all",
                        on
                          ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
                          : "border-white/5 bg-white/[0.02] text-slate-500 hover:bg-white/[0.05] hover:text-white",
                      )}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter className="sm:justify-between gap-3 pt-4">
            <Button 
              type="button" 
              variant="ghost" 
              onClick={() => setEndorseOpen(false)} 
              disabled={endorseSaving}
              className="rounded-2xl font-bold uppercase tracking-widest text-[10px] text-slate-500 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-primary text-white hover:bg-primary/90 h-12 px-8 rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-primary/20"
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
                <Spinner label="Submitting…" className="text-white" />
              ) : (
                "Post Endorsement"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
