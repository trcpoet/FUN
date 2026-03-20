/**
 * Athlete profile extensions stored in profiles.athlete_profile (jsonb).
 * Onboarding vs advanced: see product notes in Profile page / README.
 */

export const AVAILABILITY_OPTIONS = [
  { value: "open_to_games", label: "Open to games" },
  { value: "training_mode", label: "Training mode" },
  { value: "weekend_only", label: "Weekend only" },
  { value: "competitive_only", label: "Competitive only" },
  { value: "busy", label: "Busy / limited" },
] as const;

export type AvailabilityValue = (typeof AVAILABILITY_OPTIONS)[number]["value"];

export type SportSkillEntry = {
  sport: string;
  level: "casual" | "intermediate" | "advanced" | "competitive" | null;
  primary?: boolean;
};

export type PerformanceMetricEntry = {
  id: string;
  label: string;
  value: string;
  /** Lowercase sport slug; empty = universal */
  sportKeys?: string[];
  verified?: boolean;
  hidden?: boolean;
};

export type ExperienceEntry = {
  id: string;
  organization: string;
  role: string;
  dateRange: string;
  detail?: string;
};

export type HighlightKind = "pr" | "win" | "clip" | "tournament" | "streak" | "training" | "other";

export type StoryMediaItem = {
  url: string;
  type: "image" | "video";
};

/** Instagram-style story ring: user-defined label + optional cover + optional slides. */
export type StoryEntry = {
  id: string;
  label: string;
  thumbUrl?: string | null;
  /** Photos or videos in this story (URLs after upload). */
  media?: StoryMediaItem[];
};

export type HighlightEntry = {
  id: string;
  kind: HighlightKind;
  title: string;
  subtitle?: string;
  date?: string;
  /** Cover image for grid / story ring (optional). */
  thumbUrl?: string | null;
  /** When `video`, grid plays thumbUrl as a video instead of a cover image. */
  mediaKind?: "image" | "video";
};

export type ActivityPost = {
  id: string;
  caption: string;
  sport?: string;
  timeAgo?: string;
  likes?: number;
  comments?: number;
  /** Image or clip poster URL for media-first feed cards. */
  mediaUrl?: string | null;
  /** How to render mediaUrl in the grid (defaults to image). */
  mediaKind?: "image" | "video";
  /** Pinned post shown above the feed (Twitter/IG-style). */
  pinned?: boolean;
};

export type EndorsementEntry = {
  id: string;
  quote: string;
  authorName: string;
  relation?: string;
};

export type SkillRating = {
  key: string;
  label: string;
  value: number;
};

export type AthleteSnapshot = {
  height?: string | null;
  weight?: string | null;
  handedness?: string | null;
  positions?: string[];
  playStyle?: string | null;
  yearsExperience?: number | null;
  fitnessFocus?: string | null;
  intensity?: "low" | "moderate" | "high" | null;
  /** School / university (About + optional edit). */
  university?: string | null;
  /** Finer location than city, e.g. neighbourhood or campus area. */
  neighbourhood?: string | null;
  /** Optional occupation shown in profile edit (stored in snapshot jsonb). */
  occupation?: string | null;
};

export type TrustSignals = {
  sportsmanship?: number | null;
  reliabilityLabel?: string | null;
  showUpRate?: number | null;
  communication?: number | null;
  organizerTrust?: number | null;
};

/** Match-day vs training presets for strengths + intensity (stored in athlete_profile jsonb). */
export type AthleticLoadoutSlot = {
  skillRatings?: SkillRating[];
  intensity?: AthleteSnapshot["intensity"];
};

export type AthleticLoadouts = {
  match?: AthleticLoadoutSlot;
  training?: AthleticLoadoutSlot;
};

export type AthleteProfilePayload = {
  handle?: string | null;
  city?: string | null;
  bio?: string | null;
  primarySports?: string[];
  secondarySports?: string[];
  sportsSkills?: SportSkillEntry[];
  /** Display string e.g. "Rising" — optional override; level from user_stats used if unset */
  athleteTierLabel?: string | null;
  availability?: AvailabilityValue | null;
  verified?: boolean;
  sportsmanshipBadge?: boolean;
  snapshot?: AthleteSnapshot;
  skillRatings?: SkillRating[];
  performanceMetrics?: PerformanceMetricEntry[];
  experience?: ExperienceEntry[];
  highlights?: HighlightEntry[];
  /** Story rings (custom labels only; not tied to highlight items). */
  stories?: StoryEntry[];
  posts?: ActivityPost[];
  endorsements?: EndorsementEntry[];
  trust?: TrustSignals;
  /** @deprecated Unused in UI; cleared on save. Kept for parse/merge of old rows. */
  coverUrl?: string | null;
  /** Single sport shown as a small badge on the profile avatar. */
  favoriteSport?: string | null;
  /** Teaser for “played with” row; full graph can replace later. */
  playedWithCount?: number | null;
  playedWithAvatarUrls?: string[];
  /** Optional dual loadouts for athletic build tab. */
  athleticLoadouts?: AthleticLoadouts;
};

export function emptyAthleteProfile(): AthleteProfilePayload {
  return {
    handle: null,
    city: null,
    bio: null,
    primarySports: [],
    secondarySports: [],
    sportsSkills: [],
    athleteTierLabel: null,
    availability: "open_to_games",
    verified: false,
    sportsmanshipBadge: false,
    snapshot: {},
    skillRatings: [],
    performanceMetrics: [],
    experience: [],
    highlights: [],
    stories: [],
    posts: [],
    endorsements: [],
    trust: {},
    coverUrl: null,
    favoriteSport: null,
    playedWithCount: null,
    playedWithAvatarUrls: [],
    athleticLoadouts: undefined,
  };
}

function asStr(v: unknown): string | null {
  return typeof v === "string" ? v : v == null ? null : String(v);
}

function asNum(v: unknown): number | null {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

function asBool(v: unknown): boolean {
  return v === true;
}

function asStrArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

/** Max custom strength rows stored and shown in profile edit / hero. */
const MAX_SKILL_RATINGS = 4;

export function parseAthleteProfile(raw: unknown): AthleteProfilePayload {
  const base = emptyAthleteProfile();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;

  const snap = o.snapshot && typeof o.snapshot === "object" ? (o.snapshot as Record<string, unknown>) : {};

  const trust = o.trust && typeof o.trust === "object" ? (o.trust as Record<string, unknown>) : {};

  const sportsSkills: SportSkillEntry[] = Array.isArray(o.sportsSkills)
    ? o.sportsSkills
        .filter((x): x is Record<string, unknown> => x != null && typeof x === "object")
        .map((s) => ({
          sport: asStr(s.sport) ?? "",
          level:
            s.level === "casual" ||
            s.level === "intermediate" ||
            s.level === "advanced" ||
            s.level === "competitive"
              ? s.level
              : null,
          primary: s.primary === true,
        }))
        .filter((s) => s.sport.length > 0)
    : [];

  const performanceMetrics: PerformanceMetricEntry[] = Array.isArray(o.performanceMetrics)
    ? o.performanceMetrics
        .filter((x): x is Record<string, unknown> => x != null && typeof x === "object")
        .map((m, i) => ({
          id: asStr(m.id) ?? `metric-${i}`,
          label: asStr(m.label) ?? "Metric",
          value: asStr(m.value) ?? "",
          sportKeys: Array.isArray(m.sportKeys) ? asStrArray(m.sportKeys) : undefined,
          verified: m.verified === true,
          hidden: m.hidden === true,
        }))
    : [];

  const experience: ExperienceEntry[] = Array.isArray(o.experience)
    ? o.experience
        .filter((x): x is Record<string, unknown> => x != null && typeof x === "object")
        .map((e, i) => ({
          id: asStr(e.id) ?? `exp-${i}`,
          organization: asStr(e.organization) ?? "",
          role: asStr(e.role) ?? "",
          dateRange: asStr(e.dateRange) ?? "",
          detail: asStr(e.detail) ?? undefined,
        }))
    : [];

  const stories: StoryEntry[] = Array.isArray(o.stories)
    ? o.stories
        .filter((x): x is Record<string, unknown> => x != null && typeof x === "object")
        .map((s, i) => {
          const mediaRaw = Array.isArray(s.media) ? s.media : [];
          const media: StoryMediaItem[] = mediaRaw
            .filter((m): m is Record<string, unknown> => m != null && typeof m === "object")
            .map((m) => ({
              url: asStr(m.url) ?? "",
              type: m.type === "video" ? ("video" as const) : ("image" as const),
            }))
            .filter((m) => m.url.length > 0);
          return {
            id: asStr(s.id) ?? `story-${i}`,
            label: asStr(s.label) ?? "",
            thumbUrl: asStr(s.thumbUrl) ?? undefined,
            media: media.length ? media : undefined,
          };
        })
        .filter((s) => s.label.trim().length > 0)
    : [];

  const highlightKinds: HighlightKind[] = ["pr", "win", "clip", "tournament", "streak", "training", "other"];
  const highlights: HighlightEntry[] = Array.isArray(o.highlights)
    ? o.highlights
        .filter((x): x is Record<string, unknown> => x != null && typeof x === "object")
        .map((h, i) => ({
          id: asStr(h.id) ?? `hl-${i}`,
          kind: highlightKinds.includes(h.kind as HighlightKind) ? (h.kind as HighlightKind) : "other",
          title: asStr(h.title) ?? "",
          subtitle: asStr(h.subtitle) ?? undefined,
          date: asStr(h.date) ?? undefined,
          thumbUrl: asStr(h.thumbUrl) ?? undefined,
          mediaKind:
            h.mediaKind === "video" ? ("video" as const) : h.mediaKind === "image" ? ("image" as const) : undefined,
        }))
    : [];

  const posts: ActivityPost[] = Array.isArray(o.posts)
    ? o.posts
        .filter((x): x is Record<string, unknown> => x != null && typeof x === "object")
        .map((p, i) => ({
          id: asStr(p.id) ?? `post-${i}`,
          caption: asStr(p.caption) ?? "",
          sport: asStr(p.sport) ?? undefined,
          timeAgo: asStr(p.timeAgo) ?? undefined,
          likes: asNum(p.likes) ?? undefined,
          comments: asNum(p.comments) ?? undefined,
          mediaUrl: asStr(p.mediaUrl) ?? undefined,
          mediaKind:
            p.mediaKind === "video" ? ("video" as const) : p.mediaKind === "image" ? ("image" as const) : undefined,
          pinned: p.pinned === true,
        }))
    : [];

  const endorsements: EndorsementEntry[] = Array.isArray(o.endorsements)
    ? o.endorsements
        .filter((x): x is Record<string, unknown> => x != null && typeof x === "object")
        .map((e, i) => ({
          id: asStr(e.id) ?? `end-${i}`,
          quote: asStr(e.quote) ?? "",
          authorName: asStr(e.authorName) ?? "",
          relation: asStr(e.relation) ?? undefined,
        }))
    : [];

  const skillRatings: SkillRating[] = Array.isArray(o.skillRatings)
    ? o.skillRatings
        .filter((x): x is Record<string, unknown> => x != null && typeof x === "object")
        .map((s) => ({
          key: asStr(s.key) ?? "skill",
          label: asStr(s.label) ?? "Skill",
          value: Math.min(100, Math.max(0, asNum(s.value) ?? 0)),
        }))
        .slice(0, MAX_SKILL_RATINGS)
    : [];

  const parseLoadoutSlot = (slot: unknown): AthleticLoadoutSlot | undefined => {
    if (!slot || typeof slot !== "object") return undefined;
    const s = slot as Record<string, unknown>;
    const sr = Array.isArray(s.skillRatings)
      ? s.skillRatings
          .filter((x): x is Record<string, unknown> => x != null && typeof x === "object")
          .map((r) => ({
            key: asStr(r.key) ?? "skill",
            label: asStr(r.label) ?? "Skill",
            value: Math.min(100, Math.max(0, asNum(r.value) ?? 0)),
          }))
          .slice(0, MAX_SKILL_RATINGS)
      : undefined;
    const int = s.intensity;
    const intensity =
      int === "low" || int === "moderate" || int === "high" ? int : int === null ? null : undefined;
    const out: AthleticLoadoutSlot = {};
    if (sr?.length) out.skillRatings = sr;
    if (intensity !== undefined) out.intensity = intensity;
    return Object.keys(out).length ? out : undefined;
  };

  const loRaw = o.athleticLoadouts && typeof o.athleticLoadouts === "object" ? (o.athleticLoadouts as Record<string, unknown>) : null;
  const athleticLoadouts: AthleticLoadouts | undefined = loRaw
    ? {
        match: parseLoadoutSlot(loRaw.match),
        training: parseLoadoutSlot(loRaw.training),
      }
    : undefined;

  const availability = asStr(o.availability);
  const allowedAvail = AVAILABILITY_OPTIONS.map((a) => a.value) as string[];

  return {
    ...base,
    handle: asStr(o.handle),
    city: asStr(o.city),
    bio: asStr(o.bio),
    primarySports: asStrArray(o.primarySports),
    secondarySports: asStrArray(o.secondarySports),
    sportsSkills: sportsSkills.length ? sportsSkills : base.sportsSkills,
    athleteTierLabel: asStr(o.athleteTierLabel),
    availability: availability && allowedAvail.includes(availability) ? (availability as AvailabilityValue) : base.availability,
    verified: asBool(o.verified),
    sportsmanshipBadge: asBool(o.sportsmanshipBadge),
    snapshot: {
      height: asStr(snap.height),
      weight: asStr(snap.weight),
      handedness: asStr(snap.handedness),
      positions: asStrArray(snap.positions),
      playStyle: asStr(snap.playStyle),
      yearsExperience: asNum(snap.yearsExperience),
      fitnessFocus: asStr(snap.fitnessFocus),
      intensity:
        snap.intensity === "low" || snap.intensity === "moderate" || snap.intensity === "high"
          ? snap.intensity
          : null,
      university: asStr(snap.university),
      neighbourhood: asStr(snap.neighbourhood),
      occupation: asStr(snap.occupation),
    },
    skillRatings: skillRatings.length ? skillRatings : base.skillRatings,
    performanceMetrics,
    experience,
    highlights,
    stories: stories.length ? stories : base.stories,
    posts,
    endorsements,
    trust: {
      sportsmanship: asNum(trust.sportsmanship),
      reliabilityLabel: asStr(trust.reliabilityLabel),
      showUpRate: asNum(trust.showUpRate),
      communication: asNum(trust.communication),
      organizerTrust: asNum(trust.organizerTrust),
    },
    coverUrl: asStr(o.coverUrl),
    favoriteSport: asStr(o.favoriteSport),
    playedWithCount: asNum(o.playedWithCount),
    playedWithAvatarUrls: Array.isArray(o.playedWithAvatarUrls) ? asStrArray(o.playedWithAvatarUrls) : [],
    athleticLoadouts: athleticLoadouts?.match || athleticLoadouts?.training ? athleticLoadouts : undefined,
  };
}

export function mergeAthleteProfile(
  base: AthleteProfilePayload,
  patch: Partial<AthleteProfilePayload>
): AthleteProfilePayload {
  return {
    ...base,
    ...patch,
    primarySports: patch.primarySports ?? base.primarySports,
    secondarySports: patch.secondarySports ?? base.secondarySports,
    sportsSkills: patch.sportsSkills ?? base.sportsSkills,
    skillRatings: patch.skillRatings ?? base.skillRatings,
    performanceMetrics: patch.performanceMetrics ?? base.performanceMetrics,
    experience: patch.experience ?? base.experience,
    highlights: patch.highlights ?? base.highlights,
    stories: patch.stories ?? base.stories,
    posts: patch.posts ?? base.posts,
    endorsements: patch.endorsements ?? base.endorsements,
    snapshot: { ...base.snapshot, ...patch.snapshot },
    trust: { ...base.trust, ...patch.trust },
    coverUrl: patch.coverUrl !== undefined ? patch.coverUrl : base.coverUrl,
    favoriteSport: patch.favoriteSport !== undefined ? patch.favoriteSport : base.favoriteSport,
    playedWithCount: patch.playedWithCount !== undefined ? patch.playedWithCount : base.playedWithCount,
    playedWithAvatarUrls: patch.playedWithAvatarUrls ?? base.playedWithAvatarUrls,
    athleticLoadouts:
      patch.athleticLoadouts !== undefined
        ? {
            ...base.athleticLoadouts,
            ...patch.athleticLoadouts,
            match: patch.athleticLoadouts.match ?? base.athleticLoadouts?.match,
            training: patch.athleticLoadouts.training ?? base.athleticLoadouts?.training,
          }
        : base.athleticLoadouts,
  };
}

/** Normalize sport name to slug for metric filtering */
export function sportSlug(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, "_");
}

export function visibleMetrics(
  metrics: PerformanceMetricEntry[] | undefined,
  primarySports: string[]
): PerformanceMetricEntry[] {
  const slugs = new Set(primarySports.map(sportSlug));
  return (metrics ?? []).filter((m) => {
    if (m.hidden) return false;
    if (!m.sportKeys?.length) return true;
    return m.sportKeys.some((k) => slugs.has(k.toLowerCase()));
  });
}
