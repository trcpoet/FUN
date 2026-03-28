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
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "../ui/sheet";
import { Slider } from "../ui/slider";
import { Switch } from "../ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Progress } from "../ui/progress";
import { SportIconRow } from "./SportIconRow";
import { sportEmoji } from "../../../lib/sportVisuals";
import { cn } from "../ui/utils";
import {
  Plus,
  Trash2,
  LogOut,
  ArrowLeft,
  User,
  Trophy,
  Dumbbell,
  Shield,
  Camera,
  Eye,
  X,
  ChevronRight,
  TrendingUp,
  Lock,
  Globe,
  Zap,
  Settings,
} from "lucide-react";
import { Badge } from "../ui/badge";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editDisplayName: string;
  onEditDisplayNameChange: (v: string) => void;
  currentAvatarUrl: string | null;
  athleteProfile: AthleteProfilePayload;
  onSaveAthleteProfile: (
    next: AthleteProfilePayload,
    options?: { avatarFile: File | null }
  ) => Promise<void>;
  onSignOut?: () => void | Promise<void>;
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

type EditTab = "home" | "identity" | "sports" | "athletic" | "more";

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
  return Math.round((ok / total) * 100);
}

function sectionCard(className?: string) {
  return cn(
    "rounded-[32px] border border-white/[0.08] bg-card/40 backdrop-blur-xl p-6 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.3)]",
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
  const [editTab, setEditTab] = useState<EditTab>("home");
  const [sportFilter, setSportFilter] = useState("");
  const prevOpenRef = useRef(false);

  useEffect(() => {
    if (open) {
      const merged = { ...emptyAthleteProfile(), ...athleteProfile };
      merged.skillRatings = seedStrengths(merged.skillRatings);
      merged.athleticLoadouts = undefined;
      setDraft(merged);
      setErr(null);
      setEditTab("home");
      setSportFilter("");
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
  const mainSport = draft.primarySports?.[0] ?? null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        hideCloseButton
        className="flex h-[94vh] flex-col gap-0 overflow-hidden rounded-t-[48px] border-white/5 bg-[#050505] p-0 text-white selection:bg-primary selection:text-white"
      >
        {/* Decorative Background */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden opacity-50">
          <div className="absolute top-0 -right-[10%] size-[40%] rounded-full bg-primary/10 blur-[100px]" />
          <div className="absolute bottom-0 -left-[10%] size-[40%] rounded-full bg-blue-500/5 blur-[100px]" />
        </div>

        {/* Floating Header Controls */}
        <div className="absolute left-0 right-0 top-0 z-[100] pointer-events-none">
          <div className="mx-auto max-w-6xl w-full px-6 pt-6 flex items-center justify-between pointer-events-auto">
            <div className="flex items-center gap-3">
              {editTab !== "home" && (
                <button
                  type="button"
                  onClick={() => setEditTab("home")}
                  className="flex size-10 items-center justify-center rounded-2xl bg-white/[0.03] border border-white/5 text-primary transition-all hover:bg-primary hover:text-white hover:scale-110 active:scale-95"
                  aria-label="Back to menu"
                >
                  <ArrowLeft className="size-5" />
                </button>
              )}
              <div className="flex flex-col">
                <SheetTitle className="text-xl font-black italic tracking-tighter uppercase text-white leading-none">
                  Athlete <span className="text-primary">Config</span>
                </SheetTitle>
                <div className="flex items-center gap-1.5 mt-1">
                  <div className="size-1 rounded-full bg-primary animate-pulse" />
                  <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Session Active</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-3 px-4 py-2 rounded-2xl bg-white/[0.03] border border-white/5">
                {draft.is_private ? (
                  <Lock className="size-3.5 text-primary" />
                ) : (
                  <Globe className="size-3.5 text-emerald-400" />
                )}
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                  {draft.is_private ? "Private Account" : "Public Profile"}
                </span>
                <Switch
                  checked={!!draft.is_private}
                  onCheckedChange={(v) => setDraft((d) => ({ ...d, is_private: v }))}
                  className="scale-75"
                />
              </div>
              <SheetClose className="size-10 flex items-center justify-center rounded-2xl bg-white/[0.03] border border-white/5 text-slate-400 hover:text-white hover:bg-white/[0.08] transition-all">
                <X className="size-5" />
              </SheetClose>
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden pt-24">
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain sm:grid sm:grid-cols-4 sm:px-6 sm:pb-6 gap-6">
            
            {/* Left Column: Profile Preview Visuals (Shrunken for Mobile) */}
            <div className="sm:col-span-2 overflow-y-auto pr-2 space-y-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <section className="rounded-[32px] border border-white/[0.08] bg-card/40 backdrop-blur-xl p-6 sm:p-8 shadow-2xl relative overflow-hidden group shrink-0">
                <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                  <TrendingUp className="size-24 sm:size-32 -rotate-12" />
                </div>
                
                <div className="relative z-10 flex flex-col items-center sm:items-start text-center sm:text-left">
                  <div className="relative group/avatar">
                    <div className="absolute -inset-1 rounded-full bg-gradient-to-br from-primary to-blue-500 opacity-20 blur-lg group-hover/avatar:opacity-40 transition-opacity" />
                    <div className={cn(
                      "relative overflow-hidden rounded-full border-[4px] sm:border-[6px] border-[#050505] bg-slate-800 shadow-2xl ring-2 ring-white/10 transition-all duration-500",
                      "size-24 sm:size-40"
                    )}>
                      {(avatarObjectUrl || currentAvatarUrl)?.trim() ? (
                        <img src={(avatarObjectUrl || currentAvatarUrl)!.trim()} alt="" className="size-full object-cover" />
                      ) : (
                        <div className="flex size-full items-center justify-center text-3xl sm:text-5xl font-black italic tracking-tighter text-slate-500">
                          {(editDisplayName.trim() || "?")[0]?.toUpperCase() ?? "?"}
                        </div>
                      )}
                    </div>
                    
                    <label htmlFor="profile-settings-avatar-file" className="absolute -bottom-1 -right-1 flex size-10 sm:size-12 cursor-pointer items-center justify-center rounded-full border-2 sm:border-4 border-[#050505] bg-primary text-white shadow-xl hover:scale-110 active:scale-95 transition-all group-hover/avatar:rotate-12">
                      <Camera className="size-4 sm:size-5" />
                    </label>
                    <input id="profile-settings-avatar-file" type="file" accept="image/*" className="sr-only" onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      setAvatarFile(file);
                      setAvatarObjectUrl((prev) => {
                        if (prev) URL.revokeObjectURL(prev);
                        return file ? URL.createObjectURL(file) : null;
                      });
                    }} />
                  </div>

                  <div className="mt-4 sm:mt-6 space-y-1">
                    <h3 className="text-xl sm:text-2xl font-black italic tracking-tighter uppercase text-white leading-none">
                      {editDisplayName.trim() || "Player One"}
                    </h3>
                    <p className="text-xs sm:text-sm font-bold text-primary tracking-tight">
                      @{(draft.handle ?? "").replace(/^@/, "") || "handle_missing"}
                    </p>
                  </div>

                  <div className="mt-4 sm:mt-6 w-full space-y-3 sm:space-y-4 border-t border-white/[0.05] pt-4 sm:pt-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-white/[0.05] text-slate-400 border-none font-black text-[8px] sm:text-[9px] uppercase tracking-widest px-2 py-0.5 sm:py-1">BUILD v1.0</Badge>
                        <span className="text-[9px] sm:text-[10px] font-black italic text-white uppercase tracking-tighter">LVL {profileLevel}</span>
                      </div>
                      <span className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-widest tabular-nums">{completeness}% COMPLETE</span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 sm:gap-3">
                      {ratings.slice(0, MAX_STRENGTHS).map((s) => (
                        <div key={s.key} className="space-y-1.5 p-2 sm:p-3 rounded-xl sm:rounded-2xl bg-white/[0.02] border border-white/[0.05]">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-widest text-slate-500 truncate">{s.label}</span>
                            <span className="text-[9px] sm:text-[10px] font-black italic text-white tabular-nums">{s.value}</span>
                          </div>
                          <div className="h-1 w-full overflow-hidden rounded-full bg-white/5">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${s.value}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Performance Metrics Preview */}
                  { (draft.performanceMetrics ?? []).length > 0 && (
                    <div className="mt-4 sm:mt-6 w-full flex flex-wrap gap-1.5 sm:gap-2">
                      {(draft.performanceMetrics ?? []).map((m) => (
                        <div key={m.id} className="flex items-center gap-1.5 px-2 py-1 rounded-xl bg-white/[0.03] border border-white/5">
                          <Zap className="size-2.5 text-primary fill-current" />
                          <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">{m.label}</span>
                          <span className="text-[10px] font-black text-white">{m.value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </div>

            {/* Right Column: Edit Controls */}
            <div className="sm:col-span-2 flex flex-col min-h-0">
              <div className={cn(
                "flex-1 overflow-y-auto px-1 pb-32",
                editTab === "home" ? "space-y-3 sm:space-y-4" : "space-y-4 sm:space-y-6"
              )}>
                {err && (
                  <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs font-bold text-rose-200">
                    SYSTEM_ERR: {err}
                  </div>
                )}

                {editTab === "home" && (
                  <div className="grid gap-2 sm:gap-3">
                    {(
                      [
                        { id: "identity", title: "IDENTITY", desc: "Identity, handles, home base", Icon: User },
                        { id: "sports", title: "ROSTER", desc: "Main disciplines & tier", Icon: Trophy },
                        { id: "athletic", title: "SNAPSHOT", desc: "Combat stats & metrics", Icon: Dumbbell },
                        { id: "more", title: "SYSTEM", desc: "Auth & advanced settings", Icon: Lock },
                      ] as const
                    ).map((row) => (
                      <button
                        key={row.id}
                        type="button"
                        onClick={() => setEditTab(row.id)}
                        className="group flex items-center gap-3 sm:gap-4 p-4 sm:p-5 rounded-[24px] sm:rounded-3xl border border-white/[0.05] bg-white/[0.02] text-left transition-all hover:bg-white/[0.05] hover:border-primary/20 active:scale-[0.98]"
                      >
                        <div className="size-10 sm:size-12 rounded-xl sm:rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-center text-slate-400 group-hover:text-primary transition-colors">
                          <row.Icon className="size-4 sm:size-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs sm:text-sm font-black italic uppercase tracking-tighter text-white">{row.title}</p>
                          <p className="text-[9px] sm:text-[10px] font-medium text-slate-500 uppercase tracking-widest mt-0.5">{row.desc}</p>
                        </div>
                        <ChevronRight className="size-3.5 sm:size-4 text-slate-700 group-hover:text-primary group-hover:translate-x-1 transition-all" />
                      </button>
                    ))}
                  </div>
                )}

                {editTab === "identity" && (
                  <div className={sectionCard("space-y-6 animate-in fade-in slide-in-from-right-4 duration-500")}>
                    <div className="space-y-4">
                      <div className="space-y-2 px-1">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Global Display Name</Label>
                        <Input value={editDisplayName} onChange={(e) => onEditDisplayNameChange(e.target.value)} className="h-12 rounded-2xl bg-white/[0.03] border-white/5 text-white font-bold" />
                      </div>
                      <div className="space-y-2 px-1">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Athlete Handle</Label>
                        <Input value={draft.handle ?? ""} onChange={(e) => setDraft((d) => ({ ...d, handle: e.target.value || null }))} placeholder="handle" className="h-12 rounded-2xl bg-white/[0.03] border-white/5 text-primary font-black italic uppercase tracking-tighter" />
                      </div>
                      <div className="grid grid-cols-2 gap-4 px-1">
                        <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Home Base</Label>
                          <Input value={draft.city ?? ""} onChange={(e) => setDraft((d) => ({ ...d, city: e.target.value || null }))} placeholder="City, State" className="h-12 rounded-2xl bg-white/[0.03] border-white/5 text-white" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Availability</Label>
                          <Select value={draft.availability ?? "open_to_games"} onValueChange={(v) => setDraft((d) => ({ ...d, availability: v as AvailabilityValue }))}>
                            <SelectTrigger className="h-12 rounded-2xl bg-white/[0.03] border-white/5 text-white uppercase text-[10px] font-black">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-[#0D1117] border-white/10 rounded-2xl">
                              {AVAILABILITY_OPTIONS.map((o) => (
                                <SelectItem key={o.value} value={o.value} className="uppercase text-[10px] font-black">{o.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="space-y-2 px-1">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Athlete Manifesto</Label>
                        <Textarea value={draft.bio ?? ""} onChange={(e) => setDraft((d) => ({ ...d, bio: e.target.value || null }))} placeholder="Explosive winger. Competitive runs only." rows={3} className="rounded-2xl bg-white/[0.03] border-white/5 text-white font-medium italic resize-none" />
                      </div>
                    </div>
                  </div>
                )}

                {editTab === "sports" && (
                  <div className={sectionCard("space-y-6 animate-in fade-in slide-in-from-right-4 duration-500")}>
                    <div className="space-y-6">
                      <div className="space-y-2 px-1">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Primary Discipline</Label>
                        <Select value={mainSport ?? "__none__"} onValueChange={(v) => setMainSport(v === "__none__" ? null : v)}>
                          <SelectTrigger className="h-12 rounded-2xl bg-white/[0.03] border-white/5 text-white font-black uppercase italic tracking-tighter">
                            <SelectValue placeholder="SELECT MAIN" />
                          </SelectTrigger>
                          <SelectContent className="bg-[#0D1117] border-white/10 rounded-2xl max-h-60">
                            <SelectItem value="__none__">NONE</SelectItem>
                            {SPORT_OPTIONS.map((s) => (
                              <SelectItem key={`main-${s}`} value={s}>{s.toUpperCase()}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-3 px-1">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Secondary Roster</Label>
                        <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-2 rounded-2xl bg-white/[0.02] border border-white/5 p-2">
                          {SPORT_OPTIONS.map((sport) => {
                            const inPrimary = (draft.primarySports ?? []).includes(sport);
                            const isOn = (draft.secondarySports ?? []).includes(sport);
                            if (inPrimary) return null;
                            return (
                              <button
                                key={`sec-${sport}`}
                                type="button"
                                onClick={() => toggleSecondarySport(sport)}
                                className={cn(
                                  "flex items-center gap-2 p-2 rounded-xl border text-[10px] font-bold uppercase tracking-wider transition-all",
                                  isOn 
                                    ? "bg-primary/10 border-primary/30 text-primary" 
                                    : "bg-white/[0.02] border-white/5 text-slate-500 hover:text-white"
                                )}
                              >
                                <span className="text-sm">{sportEmoji(sport)}</span>
                                {sport}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="space-y-3 px-1">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Skill Tier</Label>
                        <Select value={defaultLevel ?? "intermediate"} onValueChange={(v) => setDefaultLevel(v as SportSkillEntry["level"])}>
                          <SelectTrigger className="h-12 rounded-2xl bg-white/[0.03] border-white/5 text-primary font-black uppercase italic tracking-tighter shadow-lg shadow-primary/10">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-[#0D1117] border-white/10 rounded-2xl">
                            {["casual", "intermediate", "advanced", "competitive"].map(l => (
                              <SelectItem key={l} value={l} className="font-black uppercase italic tracking-tighter">{l.toUpperCase()}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                )}

                {editTab === "athletic" && (
                  <div className={sectionCard("space-y-6 animate-in fade-in slide-in-from-right-4 duration-500")}>

                    {/* Athlete Specs */}
                    <div className="space-y-4">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500 px-1">Athlete Specs</Label>
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { label: "Height", key: "height", placeholder: "e.g. 5'10\"" },
                          { label: "Weight", key: "weight", placeholder: "e.g. 175 lbs" },
                          { label: "Position", key: "position", placeholder: "e.g. Forward" },
                          { label: "Play Style", key: "playStyle", placeholder: "e.g. Aggressive" },
                        ].map(({ label, key, placeholder }) => (
                          <div key={key} className="p-4 rounded-[28px] bg-white/[0.03] border border-white/5 space-y-2">
                            <Label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{label}</Label>
                            <Input
                              value={
                                key === "position"
                                  ? (draft.snapshot?.positions?.[0] ?? "")
                                  : key === "playStyle"
                                  ? (draft.snapshot?.playStyle ?? "")
                                  : key === "height"
                                  ? (draft.snapshot?.height ?? "")
                                  : (draft.snapshot?.weight ?? "")
                              }
                              onChange={(e) => {
                                const val = e.target.value;
                                setDraft((d) => ({
                                  ...d,
                                  snapshot: {
                                    ...d.snapshot,
                                    ...(key === "position"
                                      ? { positions: val ? [val] : [] }
                                      : key === "playStyle"
                                      ? { playStyle: val }
                                      : key === "height"
                                      ? { height: val }
                                      : { weight: val }),
                                  },
                                }));
                              }}
                              placeholder={placeholder}
                              className="h-9 rounded-xl bg-white/[0.03] border-white/5 text-white font-black italic uppercase tracking-tighter text-sm"
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="border-t border-white/[0.05] pt-6 space-y-4">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500 px-1">Skills</Label>
                      {ratings.map((row, idx) => (
                        <div key={`${row.key}-${idx}`} className="space-y-4 p-4 rounded-3xl bg-white/[0.02] border border-white/5">
                          <div className="space-y-2">
                            <Label className="text-[9px] font-black uppercase tracking-widest text-slate-500 px-1">Skill Name</Label>
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
                              className="h-10 rounded-xl bg-white/[0.03] border-white/5 text-white font-black uppercase italic tracking-tighter"
                            />
                          </div>
                          <div className="space-y-2">
                            <div className="flex justify-between items-center px-1">
                              <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 px-1">Proficiency Level</span>
                              <span className="text-sm font-black italic text-primary">{row.value}</span>
                            </div>
                            <Slider value={[row.value]} max={100} step={1} variant="game" onValueChange={([n]) => setDraft((d) => {
                              const list = [...seedStrengths(d.skillRatings)];
                              if (!list[idx]) return d;
                              list[idx] = { ...list[idx], value: n };
                              return { ...d, skillRatings: list };
                            })} />
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="border-t border-white/[0.05] pt-6 space-y-4">
                      <div className="flex items-center justify-between px-1">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Performance Metrics</Label>
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-7 px-2 rounded-lg bg-primary/10 text-primary font-black text-[9px] uppercase"
                          onClick={() => {
                            setDraft(d => ({
                              ...d,
                              performanceMetrics: [
                                ...(d.performanceMetrics ?? []),
                                { 
                                  id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `m-${Date.now()}`, 
                                  label: "New Metric", 
                                  value: "0" 
                                }
                              ]
                            }));
                          }}
                        >
                          <Plus className="size-3 mr-1" /> Add
                        </Button>
                      </div>
                      
                      <div className="grid gap-3">
                        {(draft.performanceMetrics ?? []).map((m, idx) => (
                          <div key={m.id} className="flex items-center gap-3 p-3 rounded-2xl bg-white/[0.02] border border-white/5 group">
                            <div className="size-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                              <Zap className="size-4 text-primary fill-current" />
                            </div>
                            <div className="grid grid-cols-2 gap-2 flex-1">
                              <div className="space-y-1">
                                <Label className="text-[8px] font-black text-slate-600 uppercase ml-1">Metric Name</Label>
                                <Input
                                  value={m.label}
                                  onChange={(e) => {
                                    const label = e.target.value;
                                    setDraft(d => {
                                      const list = [...(d.performanceMetrics ?? [])];
                                      list[idx] = { ...list[idx], label };
                                      return { ...d, performanceMetrics: list };
                                    });
                                  }}
                                  placeholder="e.g. Max Bench"
                                  className="h-8 rounded-lg bg-white/[0.03] border-white/5 text-[10px] font-bold uppercase tracking-tight"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[8px] font-black text-slate-600 uppercase ml-1">Quantity</Label>
                                <Input
                                  value={String(m.value)}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setDraft(d => {
                                      const list = [...(d.performanceMetrics ?? [])];
                                      list[idx] = { ...list[idx], value: val };
                                      return { ...d, performanceMetrics: list };
                                    });
                                  }}
                                  placeholder="e.g. 225 lbs"
                                  className="h-8 rounded-lg bg-white/[0.03] border-white/5 text-[10px] font-bold text-white"
                                />
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setDraft(d => ({
                                  ...d,
                                  performanceMetrics: (d.performanceMetrics ?? []).filter((_, i) => i !== idx)
                                }));
                              }}
                              className="p-2 text-slate-600 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"
                            >
                              <Trash2 className="size-4" />
                            </button>
                          </div>
                        ))}
                        
                        {(draft.performanceMetrics ?? []).length === 0 && (
                          <div className="py-8 text-center rounded-3xl border border-dashed border-white/5 bg-white/[0.01]">
                            <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">No metrics added</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {editTab === "more" && (
                  <div className={sectionCard("space-y-6 animate-in fade-in slide-in-from-right-4 duration-500")}>
                    <div className="space-y-4">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500 px-1">Public Verification</Label>
                      <div className="flex items-center justify-between p-5 rounded-[32px] bg-white/[0.02] border border-white/5">
                        <div className="flex items-center gap-3">
                          <Trophy className="size-5 text-amber-400" />
                          <div>
                            <p className="text-xs font-black uppercase tracking-tighter text-white">Verified Status</p>
                            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Show verified crest</p>
                          </div>
                        </div>
                        <Switch checked={!!draft.verified} onCheckedChange={(v) => setDraft((d) => ({ ...d, verified: v }))} />
                      </div>

                      {onSignOut && (
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-14 w-full rounded-[32px] bg-rose-500/5 border border-rose-500/10 text-rose-500 font-black uppercase tracking-widest text-[10px] hover:bg-rose-500 hover:text-white transition-all mt-4"
                          onClick={() => { void Promise.resolve(onSignOut()); onOpenChange(false); }}
                        >
                          <LogOut className="mr-3 size-4" />
                          Terminate Session
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Persistent Sticky Footer for Actions */}
              <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-[#050505] via-[#050505]/90 to-transparent pointer-events-none">
                <div className="mx-auto max-w-lg flex flex-col gap-3 pointer-events-auto">
                  <Button
                    type="button"
                    className="h-14 w-full bg-primary text-white shadow-[0_20px_40px_-10px_rgba(225,29,72,0.4)] rounded-[32px] font-black uppercase tracking-[0.2em] italic tracking-tighter hover:scale-[1.02] active:scale-[0.98] transition-all"
                    disabled={saving}
                    onClick={() => void handleSave()}
                  >
                    {saving ? "SAVING PROFILE . . ." : "FINALIZE CHANGES"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
