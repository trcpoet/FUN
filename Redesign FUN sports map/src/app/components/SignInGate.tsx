import { useLocation, useNavigate } from "react-router";
import { LogIn, UserPlus } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "./ui/sheet";

export type SignInGateAction = "join" | "create" | "chat" | "note";

const COPY: Record<SignInGateAction, { title: string; body: string }> = {
  join: {
    title: "Sign in to join this game",
    body: "Create a free account to claim your spot and message the crew.",
  },
  create: {
    title: "Sign in to create a game",
    body: "You'll need an account to host games and invite players.",
  },
  chat: {
    title: "Sign in to chat",
    body: "Messaging players and game crews requires a free account.",
  },
  note: {
    title: "Sign in to drop a note",
    body: "Map notes are for signed-in players. Join to add yours.",
  },
};

/**
 * Friendly "sign in to continue" prompt for guests who tap a signed-in-only
 * action (join / create / chat / note). Built on the Radix sheet, so focus
 * trap, Escape, and focus restore come for free. `action == null` keeps it
 * closed. Sign in / Create account carry the current location so the auth
 * flow can return here.
 */
export function SignInGate({
  action,
  onClose,
}: {
  action: SignInGateAction | null;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const copy = action ? COPY[action] : null;

  const go = (to: string) => {
    onClose();
    navigate(to, { state: { from: location } });
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
          <SheetTitle className="text-lg text-white">{copy?.title ?? "Sign in to continue"}</SheetTitle>
          <SheetDescription className="text-slate-400">{copy?.body}</SheetDescription>
        </SheetHeader>
        <SheetFooter>
          <button
            type="button"
            onClick={() => go("/login")}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0F1C]"
          >
            <LogIn className="size-4" aria-hidden />
            Sign in
          </button>
          <button
            type="button"
            onClick={() => go("/signup")}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-4 text-sm font-medium text-slate-200 transition hover:border-emerald-400/40 hover:text-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
          >
            <UserPlus className="size-4" aria-hidden />
            Create account
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
