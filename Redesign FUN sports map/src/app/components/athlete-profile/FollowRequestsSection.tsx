import { useEffect, useState } from "react";
import { Check, Loader2, UserPlus, X } from "lucide-react";
import { fetchFollowRequests, respondFollowRequest, type FollowRequestRow } from "../../../lib/api";

/** Owner-facing list of incoming pending follow requests with accept/reject. */
export function FollowRequestsSection() {
  const [reqs, setReqs] = useState<FollowRequestRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchFollowRequests().then((r) => {
      if (cancelled) return;
      setReqs(r.data);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const respond = async (followerId: string, accept: boolean) => {
    setBusy(followerId);
    const { error } = await respondFollowRequest(followerId, accept);
    setBusy(null);
    if (!error) setReqs((rs) => rs.filter((r) => r.follower_id !== followerId));
  };

  if (!loaded || reqs.length === 0) return null;

  return (
    <section className="space-y-3 rounded-[28px] border border-white/[0.08] bg-white/[0.02] p-4">
      <div className="flex items-center gap-2">
        <UserPlus className="size-4 text-primary" />
        <h2 className="text-sm font-black uppercase tracking-widest text-white">Follow requests</h2>
        <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-black tabular-nums text-primary">
          {reqs.length}
        </span>
      </div>
      <ul className="space-y-2">
        {reqs.map((r) => (
          <li key={r.follower_id} className="flex items-center gap-3">
            {r.avatar_url ? (
              <img src={r.avatar_url} alt="" loading="lazy" className="size-9 rounded-full object-cover" />
            ) : (
              <span className="size-9 rounded-full bg-white/10" />
            )}
            <span className="min-w-0 flex-1 truncate text-sm font-bold text-white">
              {r.display_name?.trim() || "Someone"}
            </span>
            <button
              type="button"
              disabled={busy === r.follower_id}
              onClick={() => void respond(r.follower_id, true)}
              aria-label="Accept"
              className="flex size-9 items-center justify-center rounded-full bg-emerald-600 text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
            >
              {busy === r.follower_id ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            </button>
            <button
              type="button"
              disabled={busy === r.follower_id}
              onClick={() => void respond(r.follower_id, false)}
              aria-label="Reject"
              className="flex size-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-slate-300 transition-colors hover:bg-white/[0.06] disabled:opacity-50"
            >
              <X className="size-4" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
