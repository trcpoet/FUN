import { cn } from "../ui/utils";

export type FeedChipSection = { id: string; label: string };

const DEFAULT_CHIPS: FeedChipSection[] = [
  { id: "profile-posts-reels", label: "Posts & Reels" },
  { id: "profile-games", label: "Games" },
  { id: "profile-stats", label: "Stats" },
  { id: "profile-journey", label: "Journey" },
  { id: "profile-trust", label: "Trust" },
];

type Props = {
  sections?: FeedChipSection[];
  className?: string;
};

export function ProfileFeedChips({ sections = DEFAULT_CHIPS, className }: Props) {
  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div
      className={cn(
        "-mx-4 px-4 overflow-x-auto scrollbar-hide flex gap-2 pb-1 snap-x snap-mandatory scroll-pl-4",
        className,
      )}
      style={{ WebkitOverflowScrolling: "touch" }}
    >
      {sections.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => scrollTo(s.id)}
          className="snap-start shrink-0 rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-sm font-medium text-slate-200 hover:bg-white/[0.09] hover:border-white/15 transition-colors"
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
