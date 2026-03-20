import { useEffect, useRef, useState } from "react";
import {
  type AthleteProfilePayload,
  type AvailabilityValue,
  type SportSkillEntry,
  AVAILABILITY_OPTIONS,
  emptyAthleteProfile,
} from "../../../lib/athleteProfile";
import { SPORT_OPTIONS } from "../../../lib/sports";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "../ui/sheet";
import { ScrollArea } from "../ui/scroll-area";
import { Slider } from "../ui/slider";
import { Switch } from "../ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { cn } from "../ui/utils";
import { Plus, Trash2, LogOut } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editDisplayName: string;
  onEditDisplayNameChange: (v: string) => void;
  /** Current map / profile photo URL (2D). */
  currentAvatarUrl: string | null;
  athleteProfile: AthleteProfilePayload;
  onSaveAthleteProfile: (
    next: AthleteProfilePayload,
    options?: { avatarFile: File | null }
  ) => Promise<void>;
  onSignOut?: () => void | Promise<void>;
};

const SKILL_DEFAULTS = [
  { key: "speed", label: "Speed" },
  { key: "endurance", label: "Endurance" },
  { key: "defense", label: "Defense" },
  { key: "playmaking", label: "Playmaking" },
] as const;

function toggleSport(list: string[], sport: string): string[] {
  const i = list.indexOf(sport);
  if (i >= 0) return list.filter((_, j) => j !== i);
  return [...list, sport];
}

function mergeSkillRatingsFor(d: AthleteProfilePayload) {
  const existing = d.skillRatings ?? [];
  return SKILL_DEFAULTS.map((s) => {
    const found = existing.find((e) => e.key === s.key);
    return { key: s.key, label: s.label, value: found?.value ?? 0 };
  });
}

export function ProfileEditSheet({
  open,
  onOpenChange,
  editDisplayName,
  onEditDisplayNameChange,
  currentAvatarUrl,
  athleteProfile,
  onSaveAthleteProfile,
  onSignOut,
}: Props) {
  const [draft, setDraft] = useState<AthleteProfilePayload>(() => emptyAthleteProfile());
  const [defaultLevel, setDefaultLevel] = useState<SportSkillEntry["level"]>("intermediate");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarObjectUrl, setAvatarObjectUrl] = useState<string | null>(null);
  const prevOpenRef = useRef(false);

  useEffect(() => {
    if (open) {
      setDraft({ ...emptyAthleteProfile(), ...athleteProfile });
      setErr(null);
    }
  }, [open, athleteProfile]);

  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;
    if (open && !wasOpen) {
      setAvatarFile(null);
      setAvatarObjectUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      const el = document.getElementById("profile-settings-avatar-file") as HTMLInputElement | null;
      if (el) el.value = "";
    }
  }, [open]);

  useEffect(() => {
    return () => {
      if (avatarObjectUrl) URL.revokeObjectURL(avatarObjectUrl);
    };
  }, [avatarObjectUrl]);

  const setSnap = (patch: Partial<NonNullable<AthleteProfilePayload["snapshot"]>>) => {
    setDraft((d) => ({ ...d, snapshot: { ...d.snapshot, ...patch } }));
  };

  const handleSave = async () => {
    setErr(null);
    setSaving(true);
    try {
      const ratings = mergeSkillRatingsFor(draft);
      const sportsSkills: SportSkillEntry[] = [
        ...(draft.primarySports ?? []).map((sport) => ({
          sport,
          level: defaultLevel,
          primary: true as const,
        })),
        ...(draft.secondarySports ?? []).map((sport) => ({
          sport,
          level: "casual" as const,
          primary: false as const,
        })),
      ];
      await onSaveAthleteProfile(
        {
          ...draft,
          coverUrl: null,
          skillRatings: ratings,
          sportsSkills,
          stories: (draft.stories ?? []).filter((s) => s.label.trim().length > 0),
        },
        { avatarFile }
      );
      onOpenChange(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const ratings = mergeSkillRatingsFor(draft);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-[92vh] rounded-t-2xl border-white/10 bg-[#0A0F1C] text-white p-0"
      >
        <SheetHeader className="px-4 pt-2 pb-0 text-left border-b border-white/10">
          <SheetTitle className="text-lg">Profile settings</SheetTitle>
          <SheetDescription className="text-slate-500">
            Stories, reels, posts, and full athlete details. Log out from the bottom of this screen.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-[calc(92vh-8rem)] px-4">
          <div className="space-y-6 py-4 pb-36">
            {err && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {err}
              </div>
            )}

            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500">Identity</h3>
              <div className="space-y-2">
                <Label className="text-slate-400">Display name</Label>
                <Input
                  value={editDisplayName}
                  onChange={(e) => onEditDisplayNameChange(e.target.value)}
                  className="bg-white/5 border-white/10"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-400">Profile photo</Label>
                <p className="text-xs text-slate-500">
                  Shown as your circle on the bottom left of your profile (and on the map).
                </p>
                <div className="flex flex-wrap items-center gap-4">
                  <div
                    className="size-20 shrink-0 overflow-hidden rounded-[1rem] border-[3px] border-[#080c14] bg-slate-800 ring-1 ring-white/10"
                    aria-hidden
                  >
                    {(avatarObjectUrl || currentAvatarUrl)?.trim() ? (
                      <img
                        src={(avatarObjectUrl || currentAvatarUrl)!.trim()}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center text-2xl font-bold text-slate-500">
                        {(editDisplayName.trim() || "?")[0]?.toUpperCase() ?? "?"}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <Input
                      id="profile-settings-avatar-file"
                      type="file"
                      accept="image/*"
                      className="cursor-pointer bg-white/5 border-white/10 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-sm file:text-white"
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null;
                        setAvatarFile(file);
                        setAvatarObjectUrl((prev) => {
                          if (prev) URL.revokeObjectURL(prev);
                          return file ? URL.createObjectURL(file) : null;
                        });
                      }}
                    />
                    {avatarFile && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-slate-400 hover:text-white"
                        onClick={() => {
                          setAvatarFile(null);
                          setAvatarObjectUrl((prev) => {
                            if (prev) URL.revokeObjectURL(prev);
                            return null;
                          });
                          const el = document.getElementById("profile-settings-avatar-file") as HTMLInputElement | null;
                          if (el) el.value = "";
                        }}
                      >
                        Use current photo
                      </Button>
                    )}
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-slate-400">Favorite sport</Label>
                <p className="text-xs text-slate-500">Badge on your profile photo (optional).</p>
                <Select
                  value={draft.favoriteSport?.trim() ? draft.favoriteSport.trim() : "__none__"}
                  onValueChange={(v) =>
                    setDraft((d) => ({
                      ...d,
                      favoriteSport: v === "__none__" ? null : v,
                    }))
                  }
                >
                  <SelectTrigger className="bg-white/5 border-white/10">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#121a2e] border-white/10 text-white max-h-60">
                    <SelectItem value="__none__">None</SelectItem>
                    {SPORT_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-slate-400">Handle</Label>
                <Input
                  value={draft.handle ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, handle: e.target.value || null }))}
                  placeholder="alexplays"
                  className="bg-white/5 border-white/10 font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-400">City / area</Label>
                <Input
                  value={draft.city ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, city: e.target.value || null }))}
                  placeholder="Arlington, TX"
                  className="bg-white/5 border-white/10"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-400">Athlete tagline</Label>
                <Textarea
                  value={draft.bio ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, bio: e.target.value || null }))}
                  placeholder="Explosive winger. Competitive runs only."
                  rows={3}
                  className="bg-white/5 border-white/10 resize-none"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-400">Availability</Label>
                <Select
                  value={draft.availability ?? "open_to_games"}
                  onValueChange={(v) =>
                    setDraft((d) => ({ ...d, availability: v as AvailabilityValue }))
                  }
                >
                  <SelectTrigger className="bg-white/5 border-white/10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#121a2e] border-white/10 text-white">
                    {AVAILABILITY_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-slate-400">Tier label (optional)</Label>
                <Input
                  value={draft.athleteTierLabel ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, athleteTierLabel: e.target.value || null }))}
                  placeholder="e.g. Club · A division"
                  className="bg-white/5 border-white/10"
                />
              </div>
              <div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                <span className="text-sm text-slate-300">Verified badge (self)</span>
                <Switch
                  checked={!!draft.verified}
                  onCheckedChange={(v) => setDraft((d) => ({ ...d, verified: v }))}
                />
              </div>
              <div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                <span className="text-sm text-slate-300">Fair play badge</span>
                <Switch
                  checked={!!draft.sportsmanshipBadge}
                  onCheckedChange={(v) => setDraft((d) => ({ ...d, sportsmanshipBadge: v }))}
                />
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500">Stories</h3>
              <p className="text-xs text-slate-600">
                Story rings on your profile — use any label you want. Separate from reels and posts.
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-emerald-400 h-8 -ml-2"
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    stories: [
                      ...(d.stories ?? []),
                      { id: `story-${Date.now()}`, label: "", thumbUrl: "" },
                    ],
                  }))
                }
              >
                <Plus className="size-4 mr-1" /> Add story
              </Button>
              {(draft.stories ?? []).map((row, idx) => (
                <div key={row.id} className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-3">
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-slate-500 h-8 w-8"
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          stories: (d.stories ?? []).filter((_, i) => i !== idx),
                        }))
                      }
                      aria-label="Remove story"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <Input
                    placeholder="Label (e.g. Morning runs)"
                    value={row.label}
                    onChange={(e) => {
                      const next = [...(draft.stories ?? [])];
                      next[idx] = { ...row, label: e.target.value };
                      setDraft((d) => ({ ...d, stories: next }));
                    }}
                    className="bg-white/5 border-white/10"
                  />
                  <Input
                    placeholder="Cover image URL (optional)"
                    value={row.thumbUrl ?? ""}
                    onChange={(e) => {
                      const next = [...(draft.stories ?? [])];
                      next[idx] = { ...row, thumbUrl: e.target.value || null };
                      setDraft((d) => ({ ...d, stories: next }));
                    }}
                    className="bg-white/5 border-white/10 text-xs font-mono"
                  />
                </div>
              ))}
            </section>

            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500">Sports</h3>
              <p className="text-xs text-slate-600">Tap to toggle. Primary uses the level you pick below.</p>
              <div className="space-y-2">
                <Label className="text-slate-400">Primary</Label>
                <div className="flex flex-wrap gap-1.5">
                  {SPORT_OPTIONS.map((sport) => (
                    <button
                      key={`p-${sport}`}
                      type="button"
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          primarySports: toggleSport(d.primarySports ?? [], sport),
                        }))
                      }
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs transition-colors",
                        (draft.primarySports ?? []).includes(sport)
                          ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-100"
                          : "border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/20",
                      )}
                    >
                      {sport}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-slate-400">Secondary</Label>
                <div className="flex flex-wrap gap-1.5">
                  {SPORT_OPTIONS.map((sport) => (
                    <button
                      key={`s-${sport}`}
                      type="button"
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          secondarySports: toggleSport(d.secondarySports ?? [], sport),
                        }))
                      }
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs transition-colors",
                        (draft.secondarySports ?? []).includes(sport)
                          ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-100"
                          : "border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/20",
                      )}
                    >
                      {sport}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-slate-400">Level for primary sports</Label>
                <Select
                  value={defaultLevel ?? "intermediate"}
                  onValueChange={(v) => setDefaultLevel(v as SportSkillEntry["level"])}
                >
                  <SelectTrigger className="bg-white/5 border-white/10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#121a2e] border-white/10 text-white">
                    <SelectItem value="casual">Casual</SelectItem>
                    <SelectItem value="intermediate">Intermediate</SelectItem>
                    <SelectItem value="advanced">Advanced</SelectItem>
                    <SelectItem value="competitive">Competitive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500">Athletic snapshot</h3>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-slate-500 text-xs">Height</Label>
                  <Input
                    value={draft.snapshot?.height ?? ""}
                    onChange={(e) => setSnap({ height: e.target.value || null })}
                    className="bg-white/5 border-white/10 h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-slate-500 text-xs">Weight</Label>
                  <Input
                    value={draft.snapshot?.weight ?? ""}
                    onChange={(e) => setSnap({ weight: e.target.value || null })}
                    className="bg-white/5 border-white/10 h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-slate-500 text-xs">Hand / foot</Label>
                  <Input
                    value={draft.snapshot?.handedness ?? ""}
                    onChange={(e) => setSnap({ handedness: e.target.value || null })}
                    className="bg-white/5 border-white/10 h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-slate-500 text-xs">Positions (comma)</Label>
                  <Input
                    value={(draft.snapshot?.positions ?? []).join(", ")}
                    onChange={(e) =>
                      setSnap({
                        positions: e.target.value
                          .split(",")
                          .map((x) => x.trim())
                          .filter(Boolean),
                      })
                    }
                    className="bg-white/5 border-white/10 h-9"
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-slate-500 text-xs">Play style</Label>
                  <Input
                    value={draft.snapshot?.playStyle ?? ""}
                    onChange={(e) => setSnap({ playStyle: e.target.value || null })}
                    className="bg-white/5 border-white/10 h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-slate-500 text-xs">Years experience</Label>
                  <Input
                    type="number"
                    min={0}
                    value={draft.snapshot?.yearsExperience ?? ""}
                    onChange={(e) =>
                      setSnap({
                        yearsExperience: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                    className="bg-white/5 border-white/10 h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-slate-500 text-xs">Fitness focus</Label>
                  <Input
                    value={draft.snapshot?.fitnessFocus ?? ""}
                    onChange={(e) => setSnap({ fitnessFocus: e.target.value || null })}
                    className="bg-white/5 border-white/10 h-9"
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-slate-500 text-xs">Intensity</Label>
                  <Select
                    value={draft.snapshot?.intensity ?? "none"}
                    onValueChange={(v) =>
                      setSnap({
                        intensity: v === "none" ? null : (v as "low" | "moderate" | "high"),
                      })
                    }
                  >
                    <SelectTrigger className="bg-white/5 border-white/10 h-9">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#121a2e] border-white/10 text-white">
                      <SelectItem value="none">—</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="moderate">Moderate</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500">Top strengths</h3>
              {SKILL_DEFAULTS.map((s) => {
                const val = ratings.find((r) => r.key === s.key)?.value ?? 0;
                return (
                  <div key={s.key} className="space-y-2">
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>{s.label}</span>
                      <span className="tabular-nums">{val}</span>
                    </div>
                    <Slider
                      value={[val]}
                      max={100}
                      step={1}
                      onValueChange={([n]) =>
                        setDraft((d) => {
                          const next = mergeSkillRatingsFor(d).map((r) =>
                            r.key === s.key ? { ...r, value: n } : r,
                          );
                          return { ...d, skillRatings: next };
                        })
                      }
                      className="py-1"
                    />
                  </div>
                );
              })}
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500">Metrics</h3>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-emerald-400 h-8"
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      performanceMetrics: [
                        ...(d.performanceMetrics ?? []),
                        {
                          id: `m-${Date.now()}`,
                          label: "",
                          value: "",
                          sportKeys: [],
                        },
                      ],
                    }))
                  }
                >
                  <Plus className="size-4 mr-1" /> Add
                </Button>
              </div>
              {(draft.performanceMetrics ?? []).map((m, idx) => (
                <div
                  key={m.id}
                  className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-3 sm:flex-row sm:items-end"
                >
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs text-slate-500">Label</Label>
                    <Input
                      value={m.label}
                      onChange={(e) => {
                        const next = [...(draft.performanceMetrics ?? [])];
                        next[idx] = { ...m, label: e.target.value };
                        setDraft((d) => ({ ...d, performanceMetrics: next }));
                      }}
                      placeholder="Vertical jump"
                      className="bg-white/5 border-white/10 h-9"
                    />
                  </div>
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs text-slate-500">Value</Label>
                    <Input
                      value={m.value}
                      onChange={(e) => {
                        const next = [...(draft.performanceMetrics ?? [])];
                        next[idx] = { ...m, value: e.target.value };
                        setDraft((d) => ({ ...d, performanceMetrics: next }));
                      }}
                      placeholder='32"'
                      className="bg-white/5 border-white/10 h-9"
                    />
                  </div>
                  <div className="flex-[2] space-y-1">
                    <Label className="text-xs text-slate-500">Sports (slugs, comma)</Label>
                    <Input
                      value={(m.sportKeys ?? []).join(", ")}
                      onChange={(e) => {
                        const next = [...(draft.performanceMetrics ?? [])];
                        next[idx] = {
                          ...m,
                          sportKeys: e.target.value
                            .split(",")
                            .map((x) => x.trim().toLowerCase())
                            .filter(Boolean),
                        };
                        setDraft((d) => ({ ...d, performanceMetrics: next }));
                      }}
                      placeholder="basketball or leave empty for all"
                      className="bg-white/5 border-white/10 h-9 font-mono text-xs"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 text-xs text-slate-500 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={!!m.verified}
                        onChange={(e) => {
                          const next = [...(draft.performanceMetrics ?? [])];
                          next[idx] = { ...m, verified: e.target.checked };
                          setDraft((d) => ({ ...d, performanceMetrics: next }));
                        }}
                        className="rounded border-white/20"
                      />
                      Verified
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-slate-500 shrink-0"
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          performanceMetrics: (d.performanceMetrics ?? []).filter((_, i) => i !== idx),
                        }))
                      }
                      aria-label="Remove metric"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500">Journey</h3>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-emerald-400 h-8"
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      experience: [
                        ...(d.experience ?? []),
                        {
                          id: `e-${Date.now()}`,
                          organization: "",
                          role: "",
                          dateRange: "",
                          detail: "",
                        },
                      ],
                    }))
                  }
                >
                  <Plus className="size-4 mr-1" /> Add
                </Button>
              </div>
              {(draft.experience ?? []).map((row, idx) => (
                <div key={row.id} className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-3">
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-slate-500 h-8 w-8"
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          experience: (d.experience ?? []).filter((_, i) => i !== idx),
                        }))
                      }
                      aria-label="Remove"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <Input
                    placeholder="Team / league"
                    value={row.organization}
                    onChange={(e) => {
                      const next = [...(draft.experience ?? [])];
                      next[idx] = { ...row, organization: e.target.value };
                      setDraft((d) => ({ ...d, experience: next }));
                    }}
                    className="bg-white/5 border-white/10"
                  />
                  <Input
                    placeholder="Role / position"
                    value={row.role}
                    onChange={(e) => {
                      const next = [...(draft.experience ?? [])];
                      next[idx] = { ...row, role: e.target.value };
                      setDraft((d) => ({ ...d, experience: next }));
                    }}
                    className="bg-white/5 border-white/10"
                  />
                  <Input
                    placeholder="2022 – Present"
                    value={row.dateRange}
                    onChange={(e) => {
                      const next = [...(draft.experience ?? [])];
                      next[idx] = { ...row, dateRange: e.target.value };
                      setDraft((d) => ({ ...d, experience: next }));
                    }}
                    className="bg-white/5 border-white/10"
                  />
                  <Textarea
                    placeholder="Optional detail"
                    value={row.detail ?? ""}
                    onChange={(e) => {
                      const next = [...(draft.experience ?? [])];
                      next[idx] = { ...row, detail: e.target.value };
                      setDraft((d) => ({ ...d, experience: next }));
                    }}
                    className="bg-white/5 border-white/10 min-h-[60px]"
                  />
                </div>
              ))}
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500">Reels</h3>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-emerald-400 h-8"
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      highlights: [
                        ...(d.highlights ?? []),
                        {
                          id: `h-${Date.now()}`,
                          kind: "other",
                          title: "",
                          subtitle: "",
                          date: "",
                        },
                      ],
                    }))
                  }
                >
                  <Plus className="size-4 mr-1" /> Add
                </Button>
              </div>
              {(draft.highlights ?? []).map((row, idx) => (
                <div key={row.id} className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-3">
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-slate-500 h-8 w-8"
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          highlights: (d.highlights ?? []).filter((_, i) => i !== idx),
                        }))
                      }
                      aria-label="Remove"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <Select
                    value={row.kind}
                    onValueChange={(v) => {
                      const next = [...(draft.highlights ?? [])];
                      next[idx] = { ...row, kind: v as typeof row.kind };
                      setDraft((d) => ({ ...d, highlights: next }));
                    }}
                  >
                    <SelectTrigger className="bg-white/5 border-white/10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#121a2e] border-white/10 text-white">
                      <SelectItem value="pr">PR</SelectItem>
                      <SelectItem value="win">Win</SelectItem>
                      <SelectItem value="clip">Clip</SelectItem>
                      <SelectItem value="tournament">Tournament</SelectItem>
                      <SelectItem value="streak">Streak</SelectItem>
                      <SelectItem value="training">Training</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="Thumbnail URL (grid / stories)"
                    value={row.thumbUrl ?? ""}
                    onChange={(e) => {
                      const next = [...(draft.highlights ?? [])];
                      next[idx] = { ...row, thumbUrl: e.target.value || null };
                      setDraft((d) => ({ ...d, highlights: next }));
                    }}
                    className="bg-white/5 border-white/10 text-xs font-mono"
                  />
                  <Input
                    placeholder="Title"
                    value={row.title}
                    onChange={(e) => {
                      const next = [...(draft.highlights ?? [])];
                      next[idx] = { ...row, title: e.target.value };
                      setDraft((d) => ({ ...d, highlights: next }));
                    }}
                    className="bg-white/5 border-white/10"
                  />
                  <Input
                    placeholder="Subtitle"
                    value={row.subtitle ?? ""}
                    onChange={(e) => {
                      const next = [...(draft.highlights ?? [])];
                      next[idx] = { ...row, subtitle: e.target.value };
                      setDraft((d) => ({ ...d, highlights: next }));
                    }}
                    className="bg-white/5 border-white/10"
                  />
                  <Input
                    placeholder="Date"
                    value={row.date ?? ""}
                    onChange={(e) => {
                      const next = [...(draft.highlights ?? [])];
                      next[idx] = { ...row, date: e.target.value };
                      setDraft((d) => ({ ...d, highlights: next }));
                    }}
                    className="bg-white/5 border-white/10"
                  />
                </div>
              ))}
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500">Activity posts</h3>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-emerald-400 h-8"
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      posts: [
                        ...(d.posts ?? []),
                        {
                          id: `p-${Date.now()}`,
                          caption: "",
                          sport: "",
                          timeAgo: "",
                          likes: 0,
                          comments: 0,
                          mediaUrl: "",
                          pinned: false,
                        },
                      ],
                    }))
                  }
                >
                  <Plus className="size-4 mr-1" /> Add
                </Button>
              </div>
              {(draft.posts ?? []).map((row, idx) => (
                <div key={row.id} className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-3">
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-slate-500 h-8 w-8"
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          posts: (d.posts ?? []).filter((_, i) => i !== idx),
                        }))
                      }
                      aria-label="Remove"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <Input
                    placeholder="Media image URL"
                    value={row.mediaUrl ?? ""}
                    onChange={(e) => {
                      const next = [...(draft.posts ?? [])];
                      next[idx] = { ...row, mediaUrl: e.target.value || null };
                      setDraft((d) => ({ ...d, posts: next }));
                    }}
                    className="bg-white/5 border-white/10 text-xs font-mono"
                  />
                  <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
                    <span className="text-sm text-slate-300">Pin to profile top</span>
                    <Switch
                      checked={!!row.pinned}
                      onCheckedChange={(v) => {
                        const next = (draft.posts ?? []).map((p, i) =>
                          i === idx ? { ...p, pinned: v } : { ...p, pinned: v ? false : p.pinned },
                        );
                        setDraft((d) => ({ ...d, posts: next }));
                      }}
                    />
                  </div>
                  <Textarea
                    placeholder="Caption"
                    value={row.caption}
                    onChange={(e) => {
                      const next = [...(draft.posts ?? [])];
                      next[idx] = { ...row, caption: e.target.value };
                      setDraft((d) => ({ ...d, posts: next }));
                    }}
                    className="bg-white/5 border-white/10 min-h-[72px]"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      placeholder="Sport"
                      value={row.sport ?? ""}
                      onChange={(e) => {
                        const next = [...(draft.posts ?? [])];
                        next[idx] = { ...row, sport: e.target.value };
                        setDraft((d) => ({ ...d, posts: next }));
                      }}
                      className="bg-white/5 border-white/10 h-9"
                    />
                    <Input
                      placeholder="Time (e.g. 2d ago)"
                      value={row.timeAgo ?? ""}
                      onChange={(e) => {
                        const next = [...(draft.posts ?? [])];
                        next[idx] = { ...row, timeAgo: e.target.value };
                        setDraft((d) => ({ ...d, posts: next }));
                      }}
                      className="bg-white/5 border-white/10 h-9"
                    />
                  </div>
                </div>
              ))}
            </section>

            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500">Trust (preview)</h3>
              <p className="text-xs text-slate-600">
                Long-term these should come from games. For now you can preview how numbers render.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">Sportsmanship /5</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={draft.trust?.sportsmanship ?? ""}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        trust: {
                          ...d.trust,
                          sportsmanship: e.target.value === "" ? null : Number(e.target.value),
                        },
                      }))
                    }
                    className="bg-white/5 border-white/10 h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">Show-up %</Label>
                  <Input
                    type="number"
                    value={draft.trust?.showUpRate ?? ""}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        trust: {
                          ...d.trust,
                          showUpRate: e.target.value === "" ? null : Number(e.target.value),
                        },
                      }))
                    }
                    className="bg-white/5 border-white/10 h-9"
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs text-slate-500">Reliability label</Label>
                  <Input
                    value={draft.trust?.reliabilityLabel ?? ""}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        trust: { ...d.trust, reliabilityLabel: e.target.value || null },
                      }))
                    }
                    placeholder="High"
                    className="bg-white/5 border-white/10 h-9"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">Played-with count (preview)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={draft.playedWithCount ?? ""}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        playedWithCount: e.target.value === "" ? null : Number(e.target.value),
                      }))
                    }
                    className="bg-white/5 border-white/10 h-9"
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs text-slate-500">Teammate avatar URLs (comma)</Label>
                  <Input
                    value={(draft.playedWithAvatarUrls ?? []).join(", ")}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        playedWithAvatarUrls: e.target.value
                          .split(",")
                          .map((x) => x.trim())
                          .filter(Boolean),
                      }))
                    }
                    className="bg-white/5 border-white/10 h-9 text-xs font-mono"
                    placeholder="https://…"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500">Endorsements</h3>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-emerald-400 h-8"
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      endorsements: [
                        ...(d.endorsements ?? []),
                        {
                          id: `en-${Date.now()}`,
                          quote: "",
                          authorName: "",
                          relation: "",
                        },
                      ],
                    }))
                  }
                >
                  <Plus className="size-4 mr-1" /> Add
                </Button>
              </div>
              {(draft.endorsements ?? []).map((row, idx) => (
                <div key={row.id} className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-3">
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-slate-500 h-8 w-8"
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          endorsements: (d.endorsements ?? []).filter((_, i) => i !== idx),
                        }))
                      }
                      aria-label="Remove"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <Textarea
                    placeholder="Quote"
                    value={row.quote}
                    onChange={(e) => {
                      const next = [...(draft.endorsements ?? [])];
                      next[idx] = { ...row, quote: e.target.value };
                      setDraft((d) => ({ ...d, endorsements: next }));
                    }}
                    className="bg-white/5 border-white/10 min-h-[60px]"
                  />
                  <Input
                    placeholder="Name"
                    value={row.authorName}
                    onChange={(e) => {
                      const next = [...(draft.endorsements ?? [])];
                      next[idx] = { ...row, authorName: e.target.value };
                      setDraft((d) => ({ ...d, endorsements: next }));
                    }}
                    className="bg-white/5 border-white/10"
                  />
                  <Input
                    placeholder="Relation (teammate)"
                    value={row.relation ?? ""}
                    onChange={(e) => {
                      const next = [...(draft.endorsements ?? [])];
                      next[idx] = { ...row, relation: e.target.value };
                      setDraft((d) => ({ ...d, endorsements: next }));
                    }}
                    className="bg-white/5 border-white/10"
                  />
                </div>
              ))}
            </section>
          </div>
        </ScrollArea>

        <div className="absolute bottom-0 left-0 right-0 border-t border-white/10 bg-[#0A0F1C]/95 backdrop-blur-md p-4 space-y-3">
          {onSignOut && (
            <Button
              type="button"
              variant="outline"
              className="w-full border-red-500/35 text-red-300 hover:bg-red-500/10 hover:text-red-200"
              onClick={() => {
                void Promise.resolve(onSignOut());
                onOpenChange(false);
              }}
            >
              <LogOut className="size-4 mr-2" />
              Log out
            </Button>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1 border-white/15"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={saving}
              onClick={() => void handleSave()}
            >
              {saving ? "Saving…" : "Save profile"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
