import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useMyProfile } from "../../hooks/useMyProfile";
import { useAuth } from "../contexts/AuthContext";
import { uploadAvatarImage } from "../../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { safeReturnTo } from "../../lib/guestAccess";
import { POPULAR_SPORT_LABELS } from "../../lib/sportsCatalog";
import { sportEmojiFor } from "../../lib/sportDisplay";
import { mergeAthleteProfile } from "../../lib/athleteProfile";
import { cn } from "../components/ui/utils";

/**
 * What a brand-new account tells us about itself.
 *
 * Until now: a name, a gender and an optional photo. Nothing about what the
 * person plays — which meant every "games for you" surface had no signal to work
 * with, and `get_suggested_games` would have scored everyone identically. One
 * screen, one extra question, and the map can answer "is anyone playing my sport
 * near me tonight?" from the first session.
 *
 * Deliberately not required. Someone who skips it still gets distance-ranked
 * games, and the question is asked again the first time the map has nothing in
 * their sports to show.
 *
 * Gender is no longer asked here: sign-up asks it, with date of birth and country,
 * before the account exists (see AccountDetailsFields).
 */
export default function Onboarding() {
  const { displayName, avatarUrl, athleteProfile, updateProfile, refetch } = useMyProfile();
  const { refetchProfile } = useAuth();
  const [name, setName] = useState("");
  const [sports, setSports] = useState<string[]>([]);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: string } };
  /**
   * Whatever sent them here — a game they tried to join, a note they tried to
   * reply to. Onboarding used to end on the profile page, which is the one screen
   * a brand-new account has nothing on.
   */
  const returnTo = safeReturnTo(location.state?.from);

  React.useEffect(() => {
    if (displayName != null) setName(displayName);
  }, [displayName, avatarUrl]);

  // Re-running onboarding should not silently wipe sports already on file.
  React.useEffect(() => {
    const existing = athleteProfile?.primarySports;
    if (existing && existing.length > 0) setSports(existing);
  }, [athleteProfile?.primarySports]);

  const toggleSport = (label: string) =>
    setSports((prev) =>
      prev.includes(label) ? prev.filter((s) => s !== label) : [...prev, label],
    );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Display name is required");
      return;
    }
    setError(null);
    setLoading(true);

    let newAvatarUrl: string | null = null;
    if (avatarFile) {
      const { url, error: uploadErr } = await uploadAvatarImage(avatarFile);
      if (uploadErr) {
        setLoading(false);
        setError(uploadErr.message);
        return;
      }
      newAvatarUrl = url;
    }

    const err = await updateProfile({
      display_name: trimmedName,
      ...(newAvatarUrl !== null ? { avatar_url: newAvatarUrl } : {}),
      onboarding_completed: true,
      // Merged, not replaced: this screen knows about two of the twenty-odd
      // fields in an athlete profile, and a re-run must not drop the rest.
      // `favoriteSport` is the first pick, which is what a single-sport surface
      // (the profile badge, the map's "For you" chip) reads.
      ...(sports.length > 0
        ? {
            athlete_profile: mergeAthleteProfile(athleteProfile ?? undefined, {
              primarySports: sports,
              favoriteSport: sports[0] ?? null,
            }),
          }
        : {}),
    });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    await refetch();
    await refetchProfile();
    navigate(returnTo ?? "/", { replace: true });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-white">Set up your profile</h1>
          <p className="mt-1 text-sm text-slate-400">This is how others will see you on the map</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-3 py-2">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="displayName" className="text-slate-300">
              Display name
            </Label>
            <Input
              id="displayName"
              type="text"
              autoComplete="username"
              placeholder="e.g. Alex"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="bg-slate-800/60 border-slate-700 text-white placeholder:text-slate-500"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-slate-300">What do you play?</Label>
            <div className="flex flex-wrap gap-2">
              {POPULAR_SPORT_LABELS.map((label) => {
                const selected = sports.includes(label);
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => toggleSport(label)}
                    aria-pressed={selected}
                    className={cn(
                      "inline-flex min-h-11 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/70",
                      selected
                        ? "bg-primary text-primary-foreground"
                        : "bg-surface-2 text-slate-300 hover:bg-surface-3",
                    )}
                  >
                    <span aria-hidden>{sportEmojiFor(label)}</span>
                    {label}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-slate-500">
              Optional, and you can change it later. Picking a few is what lets the map put
              games in your sports first.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="avatarFile" className="text-slate-300">
              Avatar image (optional)
            </Label>
            <Input
              id="avatarFile"
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                setAvatarFile(file);
              }}
              className="bg-slate-800/60 border-slate-700 text-white file:text-slate-200"
            />
            <p className="text-xs text-slate-500">
              Recommended: square image, under 2&nbsp;MB.
            </p>
          </div>
          <Button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-primary text-primary-foreground shadow-[var(--glow-md)] hover:bg-primary-container"
          >
            {loading ? "Saving..." : "Continue"}
          </Button>
        </form>
      </div>
    </div>
  );
}
