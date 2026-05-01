import { useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import { cn } from "../ui/utils";
import type { MapNoteCommentRow, MapNoteRow } from "../../../lib/supabase";
import { addNoteComment, fetchNoteComments } from "../../../lib/api";
import { glassMessengerPanel } from "../../styles/glass";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  note: Pick<MapNoteRow, "id" | "body" | "created_at" | "visibility" | "place_name">;
};

function visibilityLabel(v: MapNoteRow["visibility"]): string {
  if (v === "friends") return "Friends";
  if (v === "private") return "Private";
  return "Public";
}

export function NoteThreadDialog({ open, onOpenChange, note }: Props) {
  const [comments, setComments] = useState<MapNoteCommentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchNoteComments(note.id).then((r) => {
      if (cancelled) return;
      setLoading(false);
      if (r.error) {
        setError(r.error.message);
        setComments([]);
        return;
      }
      setComments(r.data ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [open, note.id]);

  const createdLabel = useMemo(() => {
    const d = new Date(note.created_at);
    if (Number.isNaN(d.getTime())) return "Recently";
    return formatDistanceToNow(d, { addSuffix: true });
  }, [note.created_at]);

  const handleSend = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    const { data, error: err } = await addNoteComment({ noteId: note.id, body });
    setSending(false);
    if (err) {
      setError(err.message);
      return;
    }
    setDraft("");
    if (data) setComments((prev) => [...prev, data]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={glassMessengerPanel("max-w-[520px]")}>
        <DialogHeader>
          <DialogTitle className="text-white flex items-center justify-between gap-3">
            <span className="truncate">Note</span>
            <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-300">
              {visibilityLabel(note.visibility)}
            </span>
          </DialogTitle>
          <p className="text-xs text-slate-500">
            {note.place_name?.trim() ? note.place_name.trim() : "Pinned to this location"} · {createdLabel}
          </p>
        </DialogHeader>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-slate-200">
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{note.body}</p>
        </div>

        {error ? (
          <p className="text-xs text-amber-400" role="alert">
            {error}
          </p>
        ) : null}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
              Comments
            </p>
            <p className="text-[11px] text-slate-500 tabular-nums">
              {loading ? "Loading…" : `${comments.length}`}
            </p>
          </div>

          <div className="max-h-[240px] overflow-y-auto space-y-2">
            {loading ? (
              <p className="text-xs text-slate-500 py-6 text-center">Loading replies…</p>
            ) : comments.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">Be the first to reply.</p>
            ) : (
              comments.map((c) => (
                <div
                  key={c.id}
                  className="rounded-2xl border border-white/10 bg-white/[0.02] px-3 py-2"
                >
                  <p className="text-sm text-slate-200 whitespace-pre-wrap break-words">{c.body}</p>
                  <p className="text-[10px] mt-1 text-slate-500">
                    {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                  </p>
                </div>
              ))
            )}
          </div>

          <div className="flex items-end gap-2 pt-1">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              rows={2}
              placeholder="Write a reply…"
              className="flex-1 resize-none rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
            />
            <Button
              type="button"
              onClick={() => void handleSend()}
              disabled={sending || !draft.trim()}
              className={cn(
                "h-11 rounded-xl px-4 font-semibold",
                "bg-gradient-to-r from-cyan-500/90 to-emerald-400/80 hover:from-cyan-400 hover:to-emerald-300",
                "text-slate-950 border-0 disabled:opacity-50",
              )}
            >
              {sending ? "Sending…" : "Reply"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

