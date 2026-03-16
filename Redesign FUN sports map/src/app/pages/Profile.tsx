import React, { useState } from "react";
import { useNavigate } from "react-router";
import { useMyProfile } from "../../hooks/useMyProfile";
import { useUserStats } from "../../hooks/useUserStats";
import { signOut, uploadAvatarImage } from "../../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "../components/ui/avatar";
import type { UserBadgeRow } from "../../lib/supabase";
import type { BadgeRow } from "../../lib/supabase";
import { getMyBadges } from "../../lib/api";
import { LogOut } from "lucide-react";

type BadgeWithDetail = UserBadgeRow & { badges?: BadgeRow | null };

export default function Profile() {
  const { displayName, avatarUrl, avatarId, updateProfile, refetch } = useMyProfile();
  const { stats } = useUserStats();
  const [badges, setBadges] = useState<BadgeWithDetail[]>([]);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(displayName ?? "");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  React.useEffect(() => {
    let cancelled = false;
    getMyBadges().then(({ data }) => {
      if (!cancelled) setBadges((data as BadgeWithDetail[]) ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    setName(displayName ?? "");
  }, [displayName, avatarUrl]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    setSaving(true);

    let newAvatarUrl: string | null = null;
    if (avatarFile) {
      const { url, error } = await uploadAvatarImage(avatarFile);
      if (error) {
        setSaving(false);
        setSaveError(error.message);
        return;
      }
      newAvatarUrl = url;
    }

    const err = await updateProfile({
      display_name: name.trim() || null,
      ...(newAvatarUrl !== null ? { avatar_url: newAvatarUrl } : {}),
    });
    setSaving(false);
    if (err) {
      setSaveError(err.message);
      return;
    }
    await refetch();
    setEditing(false);
  };

  const fallbackInitial = (displayName?.trim() || "?")[0].toUpperCase();

  return (
    <div className="min-h-screen bg-[#0A0F1C] text-white">
      <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Profile</h1>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleSignOut}
            className="text-slate-400 hover:text-white"
            aria-label="Sign out"
          >
            <LogOut className="w-5 h-5" />
          </Button>
        </div>

        {!editing ? (
          <Card className="bg-slate-800/60 border-slate-700">
            <CardHeader>
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16 rounded-full border-2 border-slate-600">
                  {avatarUrl?.trim() ? (
                    <AvatarImage src={avatarUrl} alt="" />
                  ) : null}
                  <AvatarFallback className="bg-slate-700 text-slate-300 text-xl">
                    {fallbackInitial}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <CardTitle className="text-white text-lg">
                    {displayName || "Player"}
                  </CardTitle>
                  <p className="text-sm text-slate-400">Your public display name</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                className="border-slate-600 text-slate-300 hover:bg-slate-700"
                onClick={() => setEditing(true)}
              >
                Edit profile
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="bg-slate-800/60 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white">Edit profile</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSave} className="space-y-4">
                {saveError && (
                  <div className="rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-3 py-2">
                    {saveError}
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="profile-displayName" className="text-slate-300">
                    Display name
                  </Label>
                  <Input
                    id="profile-displayName"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="bg-slate-800 border-slate-700 text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile-avatarFile" className="text-slate-300">
                    New avatar image
                  </Label>
                  <Input
                    id="profile-avatarFile"
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      setAvatarFile(file);
                    }}
                    className="bg-slate-800 border-slate-700 text-white file:text-slate-200"
                  />
                  <p className="text-xs text-slate-500">
                    Leave empty to keep your current avatar.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="submit"
                    disabled={saving}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    {saving ? "Saving..." : "Save"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="border-slate-600 text-slate-300"
                    onClick={() => {
                      setEditing(false);
                      setName(displayName ?? "");
                      setAvatarFile(null);
                      setSaveError(null);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {stats && (
          <Card className="bg-slate-800/60 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white">Stats</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="text-slate-300">
                Games played: <span className="text-white font-medium">{stats.games_played_total}</span>
              </p>
              <p className="text-slate-300">
                Level: <span className="text-white font-medium">{stats.level}</span>
              </p>
              <p className="text-slate-300">
                XP: <span className="text-white font-medium">{stats.xp}</span>
              </p>
              <p className="text-slate-300">
                Current streak: <span className="text-white font-medium">{stats.current_streak_days} days</span>
              </p>
            </CardContent>
          </Card>
        )}

        {badges.length > 0 && (
          <Card className="bg-slate-800/60 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white">Badges</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {badges.map((ub) => {
                  const b = ub as BadgeWithDetail;
                  return (
                    <li
                      key={ub.id}
                      className="flex items-center gap-2 rounded-lg bg-slate-700/50 px-3 py-2 text-sm"
                    >
                      <span className="font-medium text-emerald-400">
                        {b.badges?.name ?? ub.badge_id}
                      </span>
                      {b.badges?.description && (
                        <span className="text-slate-400">— {b.badges.description}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        )}

        <div className="pt-4">
          <Button
            variant="outline"
            className="w-full border-slate-600 text-slate-300"
            onClick={() => navigate("/")}
          >
            Back to map
          </Button>
        </div>
      </div>
    </div>
  );
}
