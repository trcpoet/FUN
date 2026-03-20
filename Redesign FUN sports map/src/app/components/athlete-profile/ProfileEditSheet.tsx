import { useEffect, useRef, useState } from "react";
import {
  type AthleteProfilePayload,
  type AvailabilityValue,
  type SkillRating,
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../ui/collapsible";
import { Progress } from "../ui/progress";
import { SportIconRow } from "./SportIconRow";
import { sportEmoji } from "../../../lib/sportVisuals";
import { cn } from "../ui/utils";
import {
  Plus,
  Trash2,
  LogOut,
  ChevronDown,
  User,
  Trophy,
  Dumbbell,
  Shield,
  Camera,
  Sparkles,
  Eye,
} from "lucide-react";

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
  /** Shown on the live dock (from user_stats). */
  profileLevel?: number;
  profileXp?: number;
};

const MAX_STRENGTHS = 4;

const SKILL_DEFAULTS = [
  { key: "speed", label: "Speed" },
  { key: "endurance", label: "Endurance" },
  { key: "defense", label: "Defense" },
  { key: "playmaking", label: "Playmaking" },
] as const;

/** Up to MAX_STRENGTHS rows for UI + save (custom labels allowed). */
function seedStrengths(raw: SkillRating[] | undefined): SkillRating[] {
  const src = raw?.length ? [...raw] : [];
  const trimmed = src.slice(0, MAX_STRENGTHS).map((r, i) => ({
    key: (r.key && r.key.trim()) || `stat-${i}`,
    label: (r.label && r.label.trim()) || "Stat",
    value: Math.min(100, Math.max(0, r.value ?? 0)),
  }));
  if (trimmed.length === 0) {
    return SKILL_DEFAULTS.map((s) => ({ ...s, value: 0 }));
  }
  return trimmed;
}

function strengthsForSave(raw: SkillRating[] | undefined): SkillRating[] {
  return seedStrengths(raw)
    .filter((r) => r.label.trim().length > 0)
    .slice(0, MAX_STRENGTHS);
}

type EditTab = "identity" | "sports" | "athletic" | "trust";

const EDIT_TAB_ORDER: EditTab[] = ["identity", "sports", "athletic", "trust"];

function statValue(ratings: SkillRating[], id: "speed" | "endurance" | "defense" | "playmaking"): number {
  const d = SKILL_DEFAULTS.find((x) => x.key === id)!;
  const hit =
    ratings.find((r) => r.key === id) ??
    ratings.find((r) => r.label.trim().toLowerCase() === d.label.toLowerCase());
  return hit?.value ?? 0;
}

function synergyMessage(ratings: SkillRating[]): string | null {
  const m = {
    speed: statValue(ratings, "speed"),
    endurance: statValue(ratings, "endurance"),
    defense: statValue(ratings, "defense"),
    playmaking: statValue(ratings, "playmaking"),
  };
  if (m.speed >= 70 && m.endurance < 35) {
    return "Balanced athletes win Sundays — try nudging endurance up.";
  }
  if (m.endurance >= 70 && m.speed < 35) {
    return "Speed shows up in transition — consider raising speed for a dual threat.";
  }
  if (m.defense >= 65 && m.playmaking >= 65) {
    return "Floor-general energy: defense + playmaking both high.";
  }
  if (m.speed >= 75 && m.defense >= 75) {
    return "Lockdown pace — speed and defense are carrying your build.";
  }
  return null;
}

function profileCompletenessPct(
  d: AthleteProfilePayload,
  displayName: string,
  hasAvatar: boolean,
): number {
  let ok = 0;
  const total = 11;
  if (displayName.trim()) ok++;
  if (hasAvatar) ok++;
  if ((d.handle ?? "").trim()) ok++;
  if ((d.city ?? "").trim()) ok++;
  if ((d.bio ?? "").trim()) ok++;
  if ((d.favoriteSport ?? "").trim()) ok++;
  if ((d.primarySports ?? []).length > 0) ok++;
  if ((d.secondarySports ?? []).length > 0) ok++;
  if (seedStrengths(d.skillRatings).some((r) => r.value > 0)) ok++;
  if ((d.snapshot?.height ?? "").trim() || (d.snapshot?.weight ?? "").trim()) ok++;
  if (d.trust?.sportsmanship != null || d.trust?.showUpRate != null) ok++;
  if ((d.performanceMetrics ?? []).length > 0) ok++;
  return Math.round((ok / total) * 100);
}

function trustMeterPercent(d: AthleteProfilePayload): { pct: number; label: string } {
  const sm = d.trust?.sportsmanship;
  const su = d.trust?.showUpRate;
  let score = 0;
  let n = 0;
  if (sm != null && !Number.isNaN(sm)) {
    score += Math.min(100, Math.max(0, (sm / 5) * 100));
    n++;
  }
  if (su != null && !Number.isNaN(su)) {
    score += Math.min(100, Math.max(0, su));
    n++;
  }
  if (n === 0) return { pct: 0, label: "Add sportsmanship or show-up % to see reputation" };
  return { pct: Math.round(score / n), label: "Reputation preview" };
}

function sectionCard(className?: string) {
  return cn(
    "rounded-2xl border border-white/10 bg-white/[0.03] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
    className,
  );
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
  profileLevel = 1,
  profileXp = 0,
}: Props) {
  const [draft, setDraft] = useState<AthleteProfilePayload>(() => emptyAthleteProfile());
  const [defaultLevel, setDefaultLevel] = useState<SportSkillEntry["level"]>("intermediate");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarObjectUrl, setAvatarObjectUrl] = useState<string | null>(null);
  const [editTab, setEditTab] = useState<EditTab>("identity");
  const [sportFilter, setSportFilter] = useState("");
  const [previewAsPublic, setPreviewAsPublic] = useState(false);
  const prevOpenRef = useRef(false);

  useEffect(() => {
    if (open) {
      const merged = { ...emptyAthleteProfile(), ...athleteProfile };
      merged.skillRatings = seedStrengths(merged.skillRatings);
      merged.athleticLoadouts = undefined;
      setDraft(merged);
      setErr(null);
      setEditTab("identity");
      setSportFilter("");
      setPreviewAsPublic(false);
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

  const setMainSport = (sport: string | null) => {
    setDraft((d) => {
      const prim = [...(d.primarySports ?? [])];
      const sec = [...(d.secondarySports ?? [])];
      if (!sport) {
        return { ...d, primarySports: prim.slice(1), secondarySports: sec };
      }
      const rest = prim.filter((x) => x !== sport);
      return {
        ...d,
        primarySports: [sport, ...rest],
        secondarySports: sec.filter((x) => x !== sport),
      };
    });
  };

  const toggleAdditionalPrimary = (sport: string) => {
    setDraft((d) => {
      const main = d.primarySports?.[0];
      if (sport === main) return d;
      const primary = [...(d.primarySports ?? [])];
      const idx = primary.indexOf(sport);
      if (idx > 0) {
        return { ...d, primarySports: primary.filter((x) => x !== sport) };
      }
      const secondary = (d.secondarySports ?? []).filter((x) => x !== sport);
      return { ...d, primarySports: [...primary, sport], secondarySports: secondary };
    });
  };

  const toggleSecondarySport = (sport: string) => {
    setDraft((d) => {
      let primary = [...(d.primarySports ?? [])];
      let secondary = [...(d.secondarySports ?? [])];
      const i = secondary.indexOf(sport);
      if (i >= 0) {
        secondary.splice(i, 1);
        return { ...d, primarySports: primary, secondarySports: secondary };
      }
      primary = primary.filter((x) => x !== sport);
      secondary.push(sport);
      return { ...d, primarySports: primary, secondarySports: secondary };
    });
  };

  const handleSave = async () => {
    setErr(null);
    setSaving(true);
    try {
      const ratings = strengthsForSave(draft.skillRatings);
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
          athleticLoadouts: undefined,
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

  const ratings = seedStrengths(draft.skillRatings);
  const completeness = profileCompletenessPct(
    draft,
    editDisplayName,
    !!(avatarObjectUrl || currentAvatarUrl)?.trim(),
  );
  const trustMeter = trustMeterPercent(draft);
  const synergy = synergyMessage(ratings);
  const sportQ = sportFilter.trim().toLowerCase();
  const filteredSports = sportQ
    ? SPORT_OPTIONS.filter((s) => s.toLowerCase().includes(sportQ))
    : SPORT_OPTIONS;
  const mainSport = draft.primarySports?.[0] ?? null;
  const stepIndex = EDIT_TAB_ORDER.indexOf(editTab) + 1;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="flex h-[92vh] flex-col gap-0 overflow-hidden rounded-t-2xl border-white/10 bg-[#0A0F1C] p-0 text-white"
      >
        <SheetHeader className="shrink-0 space-y-3 border-b border-white/10 px-4 pb-3 pt-2 text-left">
          <div className="flex flex-wrap items-start justify-between gap-2 pr-10">
            <div>
              <SheetTitle className="text-lg text-white">Profile settings</SheetTitle>
              <SheetDescription className="text-sm text-slate-500">
                Tab through your build. Save applies everything.
              </SheetDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant={previewAsPublic ? "secondary" : "ghost"}
                size="sm"
                className={cn(
                  "h-8 gap-1.5 border border-white/10 text-xs",
                  previewAsPublic && "border-emerald-500/40 bg-emerald-500/15 text-emerald-100",
                )}
                onClick={() => setPreviewAsPublic((v) => !v)}
              >
                <Eye className="size-3.5" />
                Public preview
              </Button>
              <span className="text-xs tabular-nums text-slate-500">{completeness}%</span>
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] font-medium uppercase tracking-wider text-slate-500">
              <span>Season · {draft.city?.trim() || "Your journey"}</span>
              <span>
                Step {stepIndex} of 4 · {EDIT_TAB_ORDER[stepIndex - 1]}
              </span>
            </div>
            <Progress
              value={completeness}
              className="h-1.5 bg-white/10 [&>[data-slot=progress-indicator]]:bg-emerald-500 motion-reduce:[&>[data-slot=progress-indicator]]:transition-none"
            />
          </div>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
        <div
          className={cn(
            "shrink-0 border-b border-white/10 bg-gradient-to-b from-slate-800/40 via-[#0A0F1C] to-[#0A0F1C] px-4 py-4 max-h-[min(52vh,28rem)] overflow-y-auto sm:max-h-none sm:w-[min(44%,17.5rem)] sm:max-w-[280px] sm:border-b-0 sm:border-r sm:py-5 sm:overflow-y-auto",
            previewAsPublic && "from-emerald-950/50 via-[#0c1528] to-[#0A0F1C]",
          )}
        >
          <div className="flex w-full max-w-sm flex-col items-start text-left sm:max-w-none">
            <p className="mb-3 text-left text-[11px] font-medium uppercase tracking-[0.2em] text-slate-500">
              Profile photo
            </p>
            <div className="relative shrink-0">
              <div
                className={cn(
                  "size-[7.5rem] overflow-hidden rounded-full border-4 border-[#080c14] bg-slate-800 shadow-[0_12px_40px_rgba(0,0,0,0.55)] ring-2 ring-white/10",
                  previewAsPublic && "ring-emerald-500/50",
                )}
              >
                {(avatarObjectUrl || currentAvatarUrl)?.trim() ? (
                  <img
                    src={(avatarObjectUrl || currentAvatarUrl)!.trim()}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center text-4xl font-bold text-slate-500">
                    {(editDisplayName.trim() || "?")[0]?.toUpperCase() ?? "?"}
                  </div>
                )}
              </div>
              {draft.favoriteSport?.trim() ? (
                <span
                  className="absolute -bottom-1 left-1 flex size-10 items-center justify-center rounded-full border-[3px] border-[#080c14] bg-slate-900 text-xl shadow-lg"
                  title={draft.favoriteSport.trim()}
                >
                  {sportEmoji(draft.favoriteSport.trim())}
                </span>
              ) : null}
              <label
                htmlFor="profile-settings-avatar-file"
                className="absolute -bottom-0.5 -right-0.5 flex size-11 cursor-pointer items-center justify-center rounded-full border-2 border-[#080c14] bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-lg shadow-emerald-900/50 transition-transform motion-safe:duration-200 hover:scale-105 active:scale-95"
              >
                <Camera className="size-5" aria-hidden />
                <span className="sr-only">Change profile photo</span>
              </label>
              <input
                id="profile-settings-avatar-file"
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  setAvatarFile(file);
                  setAvatarObjectUrl((prev) => {
                    if (prev) URL.revokeObjectURL(prev);
                    return file ? URL.createObjectURL(file) : null;
                  });
                }}
              />
            </div>
            <p className="mt-3 text-left text-base font-semibold text-white">
              {editDisplayName.trim() || "Your name"}
            </p>
            <p className="text-left font-mono text-sm text-slate-500">
              @{(draft.handle ?? "").replace(/^@/, "") || "handle"}
            </p>
            <p className="mt-1 max-w-[16rem] text-left text-xs leading-relaxed text-slate-500">
              Tap the green button to choose a new photo. Saves when you tap Save profile.
            </p>
            {avatarFile ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-2 h-8 text-xs text-slate-400 hover:text-white"
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
                Revert to current photo
              </Button>
            ) : null}
            <div className="mt-4 w-full space-y-2 border-t border-white/10 pt-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500">
                <span>Preview</span>
                <span className="tabular-nums">
                  Lvl {profileLevel} · {profileXp.toLocaleString()} XP
                </span>
              </div>
              <SportIconRow sports={draft.primarySports ?? []} size="sm" className="justify-start gap-1.5" />
              <div className="flex flex-col gap-1.5 sm:hidden">
                {ratings.slice(0, MAX_STRENGTHS).map((s) => (
                  <div key={s.key} className="flex items-center gap-2">
                    <span className="w-16 truncate text-[9px] font-medium uppercase tracking-wide text-slate-500">
                      {s.label}
                    </span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400"
                        style={{ width: `${s.value}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="hidden flex-col gap-1.5 sm:flex">
                {ratings.slice(0, MAX_STRENGTHS).map((s) => (
                  <div key={s.key} className="flex items-center gap-2">
                    <span className="w-24 truncate text-[9px] font-medium uppercase tracking-wide text-slate-500">
                      {s.label}
                    </span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400"
                        style={{ width: `${s.value}%` }}
                      />
                    </div>
                    <span className="w-7 text-right text-[9px] tabular-nums text-slate-400">{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-5 flex w-full flex-col items-center gap-2 border-t border-white/10 pt-4">
              <Button
                type="button"
                className="h-10 w-full max-w-[13.5rem] bg-emerald-600 text-sm text-white hover:bg-emerald-700"
                disabled={saving}
                onClick={() => void handleSave()}
              >
                {saving ? "Saving…" : "Save profile"}
              </Button>
              {onSignOut ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 w-full max-w-[13.5rem] border-red-500/35 text-sm text-red-300 hover:bg-red-500/10 hover:text-red-200"
                  onClick={() => {
                    void Promise.resolve(onSignOut());
                    onOpenChange(false);
                  }}
                >
                  <LogOut className="mr-2 size-4" />
                  Log out
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-white/10 px-2 py-2">
          {(
            [
              ["identity", "Identity", User],
              ["sports", "Sports", Trophy],
              ["athletic", "Build", Dumbbell],
              ["trust", "Trust", Shield],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setEditTab(id)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition-colors motion-safe:duration-200 cursor-pointer",
                editTab === id
                  ? "bg-emerald-600/25 text-emerald-100 ring-1 ring-emerald-500/40"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-200",
              )}
            >
              <Icon className="size-3.5 opacity-80" />
              {label}
            </button>
          ))}
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-6 px-4 py-4 pb-8">
            {err && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {err}
              </div>
            )}

            {editTab === "identity" && (
            <section className={cn("space-y-3", sectionCard())}>
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-emerald-400/90" />
                <h3 className="text-sm font-semibold tracking-wide text-slate-200">Identity</h3>
              </div>
              <div className="space-y-2">
                <Label className="text-slate-400">Display name</Label>
                <Input
                  value={editDisplayName}
                  onChange={(e) => onEditDisplayNameChange(e.target.value)}
                  className="bg-white/5 border-white/10"
                />
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
                <Label className="text-slate-400">Neighbourhood</Label>
                <Input
                  value={draft.snapshot?.neighbourhood ?? ""}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      snapshot: { ...d.snapshot, neighbourhood: e.target.value || null },
                    }))
                  }
                  placeholder="e.g. Clarendon, campus district"
                  className="bg-white/5 border-white/10"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-400">Occupation</Label>
                <Input
                  value={draft.snapshot?.occupation ?? ""}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      snapshot: { ...d.snapshot, occupation: e.target.value || null },
                    }))
                  }
                  placeholder="e.g. Student, coach, analyst"
                  className="bg-white/5 border-white/10"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-400">University</Label>
                <Input
                  value={draft.snapshot?.university ?? ""}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      snapshot: { ...d.snapshot, university: e.target.value || null },
                    }))
                  }
                  placeholder="e.g. State University"
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
              <div className="grid gap-3 sm:grid-cols-2">
                <div
                  className={cn(
                    "rounded-2xl border p-4 motion-safe:transition-colors motion-safe:duration-200",
                    draft.verified
                      ? "border-amber-400/35 bg-gradient-to-br from-amber-500/10 to-transparent"
                      : "border-white/10 bg-white/[0.02]",
                  )}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-amber-100/95">Verified crest</p>
                      <p className="text-xs text-slate-500">Self-claim for now — real verify can replace later.</p>
                    </div>
                    <Trophy className="size-5 text-amber-400/80" />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                    <span className="text-xs text-slate-400">Display on profile</span>
                    <Switch
                      checked={!!draft.verified}
                      onCheckedChange={(v) => setDraft((d) => ({ ...d, verified: v }))}
                    />
                  </div>
                </div>
                <div
                  className={cn(
                    "rounded-2xl border p-4 motion-safe:transition-colors motion-safe:duration-200",
                    draft.sportsmanshipBadge
                      ? "border-emerald-400/35 bg-gradient-to-br from-emerald-500/10 to-transparent"
                      : "border-white/10 bg-white/[0.02]",
                  )}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-emerald-100/95">Fair play trophy</p>
                      <p className="text-xs text-slate-500">Show others you prioritize clean competition.</p>
                    </div>
                    <Shield className="size-5 text-emerald-400/80" />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                    <span className="text-xs text-slate-400">Display on profile</span>
                    <Switch
                      checked={!!draft.sportsmanshipBadge}
                      onCheckedChange={(v) => setDraft((d) => ({ ...d, sportsmanshipBadge: v }))}
                    />
                  </div>
                </div>
              </div>
            </section>
            )}

            {editTab === "sports" && (
            <section className={cn("space-y-4", sectionCard())}>
              <div className="flex items-center gap-2">
                <Trophy className="size-4 text-amber-300/90" />
                <h3 className="text-sm font-semibold tracking-wide text-slate-200">Sports roster</h3>
              </div>
              <p className="text-xs text-slate-500">
                Pick one <span className="text-emerald-400/90">main</span> sport, add same-tier extras, then casual
                secondaries.
              </p>
              <div className="space-y-2">
                <Label className="text-slate-400">Main sport</Label>
                <Select
                  value={mainSport ?? "__none__"}
                  onValueChange={(v) => setMainSport(v === "__none__" ? null : v)}
                >
                  <SelectTrigger className="bg-white/5 border-white/10">
                    <SelectValue placeholder="Select main" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60 bg-[#121a2e] border-white/10 text-white">
                    <SelectItem value="__none__">None</SelectItem>
                    {SPORT_OPTIONS.map((s) => (
                      <SelectItem key={`main-${s}`} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-slate-400">Also compete in (same tier)</Label>
                <div className="flex flex-wrap gap-1.5">
                  {filteredSports.map((sport) => {
                    const isOn = (draft.primarySports ?? []).includes(sport) && sport !== mainSport;
                    return (
                      <button
                        key={`ap-${sport}`}
                        type="button"
                        disabled={!mainSport || sport === mainSport}
                        onClick={() => toggleAdditionalPrimary(sport)}
                        className={cn(
                          "flex cursor-pointer items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors motion-safe:duration-200",
                          !mainSport || sport === mainSport
                            ? "cursor-not-allowed opacity-40"
                            : isOn
                              ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-100"
                              : "border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/20",
                        )}
                      >
                        <span aria-hidden>{sportEmoji(sport)}</span>
                        {sport}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-slate-400">Secondary (casual)</Label>
                <Input
                  placeholder="Search sports…"
                  value={sportFilter}
                  onChange={(e) => setSportFilter(e.target.value)}
                  className="bg-white/5 border-white/10 h-9 text-sm"
                />
                <div className="max-h-40 overflow-y-auto rounded-xl border border-white/10 bg-black/20 p-2">
                  <div className="flex flex-wrap gap-1.5">
                    {filteredSports.map((sport) => {
                      const inPrimary = (draft.primarySports ?? []).includes(sport);
                      const isOn = (draft.secondarySports ?? []).includes(sport);
                      return (
                        <button
                          key={`sec-${sport}`}
                          type="button"
                          disabled={inPrimary}
                          onClick={() => toggleSecondarySport(sport)}
                          className={cn(
                            "flex cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors motion-safe:duration-200",
                            inPrimary
                              ? "cursor-not-allowed opacity-30"
                              : isOn
                                ? "border-cyan-500/45 bg-cyan-500/12 text-cyan-100"
                                : "border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/20",
                          )}
                        >
                          <span aria-hidden className="text-sm">
                            {sportEmoji(sport)}
                          </span>
                          {sport}
                        </button>
                      );
                    })}
                  </div>
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
            )}

            {editTab === "athletic" && (
            <>
            <section className={cn("space-y-3", sectionCard())}>
              <h3 className="text-sm font-semibold tracking-wide text-slate-200">Athletic snapshot</h3>
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

            <section className={cn("space-y-3", sectionCard())}>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold tracking-wide text-slate-200">Performance metrics</h3>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 cursor-pointer text-emerald-400"
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
              <p className="text-xs text-slate-500">
                Optional numbers (vertical jump, mile time, etc.). Shown on your profile when set.
              </p>
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
                      className="h-9 bg-white/5 border-white/10"
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
                      className="h-9 bg-white/5 border-white/10"
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
                      placeholder="empty = all sports"
                      className="h-9 bg-white/5 border-white/10 font-mono text-xs"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-slate-500">
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
                      className="shrink-0 text-slate-500"
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

            <section className={cn("space-y-4", sectionCard())}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold tracking-wide text-slate-200">Top strengths</h3>
                <span className="text-[10px] font-medium tabular-nums text-slate-500">
                  {ratings.length}/{MAX_STRENGTHS}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Up to four custom stats (rename freely). They power the bars on your profile and in this preview.
              </p>
              {ratings.map((row, idx) => (
                <div
                  key={`${row.key}-${idx}`}
                  className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-3"
                >
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="min-w-0 flex-1 space-y-1">
                      <Label className="text-xs text-slate-500">Stat name</Label>
                      <Input
                        value={row.label}
                        onChange={(e) => {
                          const label = e.target.value;
                          setDraft((d) => {
                            const list = [...seedStrengths(d.skillRatings)];
                            if (!list[idx]) return d;
                            list[idx] = { ...list[idx], label };
                            return { ...d, skillRatings: list };
                          });
                        }}
                        placeholder="e.g. Speed, Vertical"
                        className="h-9 bg-white/5 border-white/10"
                      />
                    </div>
                    {ratings.length > 1 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="shrink-0 text-slate-500 hover:text-red-300"
                        aria-label="Remove stat"
                        onClick={() =>
                          setDraft((d) => {
                            const list = seedStrengths(d.skillRatings).filter((_, i) => i !== idx);
                            return {
                              ...d,
                              skillRatings: list.length ? list : SKILL_DEFAULTS.map((s) => ({ ...s, value: 0 })),
                            };
                          })
                        }
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    ) : null}
                  </div>
                  <div className="flex justify-between text-xs text-slate-400">
                    <span className="tabular-nums font-medium text-emerald-200/90">{row.value}</span>
                  </div>
                  <Slider
                    value={[row.value]}
                    max={100}
                    step={1}
                    variant="game"
                    onValueChange={([n]) =>
                      setDraft((d) => {
                        const list = [...seedStrengths(d.skillRatings)];
                        if (!list[idx]) return d;
                        list[idx] = { ...list[idx], value: n };
                        return { ...d, skillRatings: list };
                      })
                    }
                  />
                </div>
              ))}
              {ratings.length < MAX_STRENGTHS ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full cursor-pointer border-dashed border-white/20 text-slate-300 hover:bg-white/5"
                  onClick={() =>
                    setDraft((d) => {
                      const list = seedStrengths(d.skillRatings);
                      if (list.length >= MAX_STRENGTHS) return d;
                      return {
                        ...d,
                        skillRatings: [
                          ...list,
                          { key: `stat-${Date.now()}`, label: "New stat", value: 50 },
                        ],
                      };
                    })
                  }
                >
                  <Plus className="mr-1 size-4" /> Add stat ({ratings.length}/{MAX_STRENGTHS})
                </Button>
              ) : null}
              {synergy ? (
                <p className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-2 text-xs text-cyan-100/90">
                  {synergy}
                </p>
              ) : null}
            </section>
            </>
            )}


            {editTab === "trust" && (
            <section className={cn("space-y-4", sectionCard())}>
              <div className="flex items-center gap-2">
                <Shield className="size-4 text-emerald-400/90" />
                <h3 className="text-sm font-semibold tracking-wide text-slate-200">Trust & reputation</h3>
              </div>
              <p className="text-xs text-slate-500">
                Long-term these should come from games. Tune the preview to see how it reads on your profile.
              </p>
              <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-emerald-500/10 to-transparent p-4">
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-200">{trustMeter.label}</span>
                  <span className="tabular-nums text-emerald-300/90">{trustMeter.pct}%</span>
                </div>
                <Progress
                  value={trustMeter.pct}
                  className="h-2.5 bg-white/10 [&>[data-slot=progress-indicator]]:bg-gradient-to-r [&>[data-slot=progress-indicator]]:from-emerald-500 [&>[data-slot=progress-indicator]]:to-cyan-400 motion-reduce:[&>[data-slot=progress-indicator]]:transition-none"
                />
              </div>
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
                    className="h-9 bg-white/5 border-white/10"
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
                    className="h-9 bg-white/5 border-white/10"
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
                    className="h-9 bg-white/5 border-white/10"
                  />
                </div>
              </div>
              <Collapsible className="rounded-xl border border-white/10 bg-black/20">
                <CollapsibleTrigger className="flex w-full cursor-pointer items-center justify-between px-3 py-2.5 text-left text-xs font-medium text-slate-300 hover:bg-white/[0.04] data-[state=open]:[&>svg]:rotate-180">
                  Advanced preview data
                  <ChevronDown className="size-4 shrink-0 text-slate-500 transition-transform duration-200" />
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-3 border-t border-white/10 px-3 pb-3 pt-2">
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
                      className="h-9 bg-white/5 border-white/10"
                    />
                  </div>
                  <div className="space-y-1">
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
                      className="h-9 bg-white/5 border-white/10 font-mono text-xs"
                      placeholder="https://…"
                    />
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </section>
            )}
          </div>
        </ScrollArea>
        </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
