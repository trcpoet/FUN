import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Loader2, Users } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { ScrollArea } from "../ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { getFollowers, getFollowing, type FollowListEntry } from "../../../lib/api";
import { cn } from "../ui/utils";

export type FollowTab = "followers" | "following";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string | null;
  initialTab?: FollowTab;
};

/** Followers / Following list for a profile — opens from the Network stat on the hero. */
export function FollowersFollowingModal({ open, onOpenChange, userId, initialTab = "followers" }: Props) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<FollowTab>(initialTab);
  const [entries, setEntries] = useState<FollowListEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;
    setLoading(true);
    setEntries([]);
    const load = tab === "followers" ? getFollowers : getFollowing;
    void load(userId).then((r) => {
      if (cancelled) return;
      setEntries(r.data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, userId, tab]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[min(92vw,26rem)] gap-0 rounded-[28px] border border-white/10 bg-[#0D1117]/95 p-0 backdrop-blur-xl">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle className="text-base font-black uppercase tracking-wider text-white">Network</DialogTitle>
          <DialogDescription className="sr-only">Followers and following list</DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 p-4 pt-3">
          {(["followers", "following"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              aria-pressed={tab === t}
              className={cn(
                "flex-1 rounded-xl px-3 py-2 text-xs font-bold uppercase tracking-widest transition-colors",
                tab === t ? "bg-primary text-white" : "bg-white/[0.03] text-slate-400 hover:text-white"
              )}
            >
              {t}
            </button>
          ))}
        </div>

        <ScrollArea className="max-h-[60vh]">
          <div className="px-3 pb-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="size-5 animate-spin text-primary" aria-label="Loading" />
              </div>
            ) : entries.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12 text-center">
                <Users className="size-6 text-slate-600" />
                <p className="text-xs text-slate-500">No {tab} yet.</p>
              </div>
            ) : (
              <ul className="grid gap-1">
                {entries.map((e) => (
                  <li key={e.userId}>
                    <button
                      type="button"
                      onClick={() => {
                        onOpenChange(false);
                        navigate(`/athlete/${encodeURIComponent(e.userId)}`);
                      }}
                      className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition-colors hover:bg-white/[0.05]"
                    >
                      <Avatar className="size-10 rounded-2xl border border-white/10">
                        <AvatarImage src={e.avatarUrl ?? undefined} className="object-cover" />
                        <AvatarFallback className="rounded-2xl bg-slate-800 text-sm font-black text-slate-200">
                          {(e.displayName?.trim()?.[0] ?? "?").toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="min-w-0 flex-1 truncate text-sm font-bold text-white">
                        {e.displayName?.trim() || "Athlete"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
