import { useLocation, useNavigate } from "react-router";
import { LogIn, UserPlus } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "./ui/sheet";
import { profileAuthPath, safeReturnTo } from "../../lib/guestAccess";

export type SignInGateAction =
  | "join"
  | "create"
  | "chat"
  | "note"
  | "comment"
  | "review"
  | "photo"
  | "players"
  | "feed";

/**
 * One line for what they were reaching for, one for what an account gives them.
 * Never a scolding, never a feature list: the reason is whatever they just tapped.
 */
const COPY: Record<SignInGateAction, { title: string; body: string }> = {
  join: {
    title: "Create an account to join this game",
    body: "Claim your spot, see who else is in, and message the crew.",
  },
  create: {
    title: "Create an account to host a game",
    body: "Pick a spot, set the time, and players nearby will see it on the map.",
  },
  chat: {
    title: "Create an account to chat",
    body: "Game chats and direct messages are for players who've joined.",
  },
  note: {
    title: "Create an account to drop a note",
    body: "Leave word about a court — who's there, what's open, what to bring.",
  },
  comment: {
    title: "Create an account to reply",
    body: "Replies come from real accounts, so players know who they're meeting.",
  },
  review: {
    title: "Create an account to review this spot",
    body: "Ratings come from real accounts, so players can trust them.",
  },
  photo: {
    title: "Create an account to add a photo",
    body: "Photos are credited to you, and can be moderated if something's off.",
  },
  players: {
    title: "Create an account to see who's playing",
    body: "Rosters are members-only — the players you'd be meeting can see you back.",
  },
  feed: {
    title: "Create an account to open the feed",
    body: "Recaps, notes and what players near you are up to this week.",
  },
};

/**
 * The prompt a guest meets at the moment they reach for something an account
 * owns. It never interrupts browsing — the map, venues, games and notes are all
 * open — and it always returns them to what they tapped.
 *
 * Built on the Radix sheet, so focus trap, Escape and focus restore come for
 * free. `action == null` keeps it closed.
 */
export function SignInGate({
  action,
  returnTo,
  onClose,
}: {
  action: SignInGateAction | null;
  /** Where to land after signing in — usually a `/?focus…` deep link to this very thing. */
  returnTo?: string | null;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const copy = action ? COPY[action] : null;

  const go = (mode: "signin" | "signup") => {
    onClose();
    const from = safeReturnTo(returnTo) ?? location;
    navigate(profileAuthPath(mode), { state: { from } });
  };

  return (
    <Sheet
      open={action != null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        side="bottom"
        className="mx-auto max-w-md rounded-t-2xl border-white/10 pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <SheetHeader>
          <SheetTitle className="text-lg text-white">{copy?.title ?? "Create an account to continue"}</SheetTitle>
          <SheetDescription className="text-slate-400">{copy?.body}</SheetDescription>
        </SheetHeader>
        <SheetFooter>
          {/* Sign-up leads: almost everyone who reaches this sheet is new here. */}
          <button
            type="button"
            onClick={() => go("signup")}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-[var(--glow-md)] transition hover:bg-primary-container focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <UserPlus className="size-4" aria-hidden />
            Create account
          </button>
          <button
            type="button"
            onClick={() => go("signin")}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-4 text-sm font-medium text-slate-200 transition hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <LogIn className="size-4" aria-hidden />
            I already have one
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-9 rounded-xl px-4 text-sm text-slate-500 transition hover:text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/40"
          >
            Keep browsing
          </button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
