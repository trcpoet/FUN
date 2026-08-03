import React, { useState } from "react";
import { useNavigate } from "react-router";
import { useMyProfile } from "../../hooks/useMyProfile";
import { useAuth } from "../contexts/AuthContext";
import { uploadAvatarImage } from "../../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { GENDER_OPTIONS, type Gender } from "../../lib/gamePreferenceOptions";

export default function Onboarding() {
  const { displayName, avatarUrl, gender: savedGender, updateProfile, refetch } = useMyProfile();
  const { refetchProfile } = useAuth();
  const [name, setName] = useState("");
  const [gender, setGender] = useState<Gender | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  React.useEffect(() => {
    if (displayName != null) setName(displayName);
  }, [displayName, avatarUrl]);

  React.useEffect(() => {
    if (savedGender) setGender(savedGender);
  }, [savedGender]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Display name is required");
      return;
    }
    // Gender gates game visibility, so it can't be deferred past onboarding.
    if (!gender) {
      setError("Please select your gender to continue");
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
      gender,
      onboarding_completed: true,
    });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    await refetch();
    await refetchProfile();
    navigate("/profile", { replace: true });
  };

  return (
    <div className="min-h-screen bg-[#0A0F1C] flex flex-col items-center justify-center px-4">
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
            <Label className="text-slate-300">Gender</Label>
            <div className="grid grid-cols-3 gap-2">
              {GENDER_OPTIONS.map((o) => {
                const selected = gender === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setGender(o.value)}
                    aria-pressed={selected}
                    className={
                      "min-h-11 rounded-xl border px-3 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 " +
                      (selected
                        ? "border-emerald-500 bg-emerald-500/15 text-emerald-200"
                        : "border-slate-700 bg-slate-800/60 text-slate-300 hover:border-slate-500")
                    }
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-slate-500">
              Required. Games open only to one gender are shown just to matching players — this is
              what keeps them private, so we can&rsquo;t show you games until it&rsquo;s set.
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
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {loading ? "Saving..." : "Continue"}
          </Button>
        </form>
      </div>
    </div>
  );
}
