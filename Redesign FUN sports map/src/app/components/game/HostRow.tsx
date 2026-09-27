import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { StarRating } from "../ui/StarRating";
import type { GameRow } from "../../../lib/supabase";
import { cn } from "../ui/utils";

/**
 * Who is hosting, and whether anyone has vouched for them.
 *
 * Nothing in the app showed a game's host. The map popup rendered four fake
 * gradient circles holding a generic glyph — not people, just furniture — and
 * the only place a host was ever named was the roster on the back of the card,
 * behind a lazy fetch.
 *
 * Renders nothing at all when `host_name` is absent. For a guest that is always,
 * because `get_guest_games_nearby` nulls the column: a guest sees what is
 * happening, where, when and how many, never who — and an omitted row looks
 * finished, where a "sign up to see who" teaser would advertise the absence on
 * every pin they tap.
 */
export type HostRowProps = {
  game: GameRow;
  onOpenProfile?: (userId: string) => void;
  className?: string;
};

export function HostRow({ game, onOpenProfile, className }: HostRowProps) {
  const name = game.host_name?.trim();
  if (!name) return null;

  const rating = game.host_sportsmanship;
  const canOpen = Boolean(onOpenProfile && game.created_by);
  const initials = name.slice(0, 2).toUpperCase();

  const body = (
    <>
      <Avatar className="size-8 shrink-0 overflow-hidden rounded-full">
        {game.host_avatar_url ? <AvatarImage src={game.host_avatar_url} alt="" /> : null}
        <AvatarFallback className="bg-surface-3 text-[10px] font-semibold text-slate-300">
          {initials}
        </AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          Host
        </span>
        <span className="block truncate text-[13px] font-semibold text-slate-100">{name}</span>
      </span>
      {/* Deliberately shown even when unrated: "Not rated yet" is the honest
          answer for a new host, and hiding it would make rated and unrated
          hosts look identical. */}
      <StarRating value={rating ?? null} size={11} className="shrink-0" />
    </>
  );

  if (!canOpen) {
    return (
      <div className={cn("flex items-center gap-2.5 rounded-2xl bg-surface-1 px-3 py-2", className)}>
        {body}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpenProfile?.(game.created_by!)}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-2xl bg-surface-1 px-3 py-2 text-left transition-colors hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
        className,
      )}
    >
      {body}
    </button>
  );
}
