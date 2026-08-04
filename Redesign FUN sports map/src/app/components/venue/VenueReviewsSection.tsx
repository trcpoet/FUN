import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Loader2, Pencil, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { StarRating } from "../ui/StarRating";
import { StarRatingInput } from "../ui/StarRatingInput";
import { formatRelativeShort } from "../../../lib/formatRelative";
import {
  deleteVenueReview,
  fetchVenueReviews,
  upsertVenueReview,
  type VenueReviewRow,
  type VenueReviewSummary,
} from "../../../lib/venueSocial";
import type { VenueSelection } from "../mapboxMapTypes";

type Props = {
  venue: VenueSelection;
  /**
   * Accepted for symmetry with the comments section, but ownership here comes
   * from the RPC's `is_mine` rather than a client-side comparison — the server
   * already knows who is asking, and one source of truth avoids the two
   * disagreeing after a sign-in.
   */
  currentUserId?: string | null;
  ensureSession?: () => Promise<boolean>;
  /** Lifted so a caller can show the aggregate without expanding the section. */
  onSummaryChange?: (summary: VenueReviewSummary) => void;
};

const EMPTY: VenueReviewSummary = { count: 0, average: null };

/**
 * First-party venue reviews: one rated verdict per member, editable.
 *
 * Collapsed until opened and only then fetched, matching how the modal already
 * defers enrichment — the common flow is "find a game here", not "read reviews".
 *
 * Kept visually distinct from the Google rating chip on purpose: Places terms
 * forbid presenting Google's ratings and reviews as interchangeable with
 * first-party ones.
 */
export function VenueReviewsSection({ venue, ensureSession, onSummaryChange }: Props) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<VenueReviewRow[]>([]);
  const [summary, setSummary] = useState<VenueReviewSummary>(EMPTY);

  const [composing, setComposing] = useState(false);
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  const mine = rows.find((r) => r.is_mine) ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    const { data, summary: s, error } = await fetchVenueReviews({ venueId: venue.id });
    setLoading(false);
    setLoaded(true);
    if (error) {
      toast.error("Couldn't load reviews", { description: error.message });
      return;
    }
    setRows(data);
    setSummary(s);
    onSummaryChange?.(s);
  }, [venue.id, onSummaryChange]);

  // Reset when the modal switches venues while mounted.
  useEffect(() => {
    setOpen(false);
    setLoaded(false);
    setRows([]);
    setSummary(EMPTY);
    setComposing(false);
    setRating(0);
    setBody("");
  }, [venue.id]);

  useEffect(() => {
    if (open && !loaded && !loading) void load();
  }, [open, loaded, loading, load]);

  const startCompose = async () => {
    if (ensureSession && !(await ensureSession())) return;
    setRating(mine?.rating ?? 0);
    setBody(mine?.body ?? "");
    setComposing(true);
  };

  const submit = async () => {
    if (rating < 1) {
      toast.error("Pick a star rating first");
      return;
    }
    setSaving(true);
    const { error } = await upsertVenueReview({ venue, rating, body });
    setSaving(false);
    if (error) {
      toast.error("Couldn't save your review", { description: error.message });
      return;
    }
    setComposing(false);
    setBody("");
    setRating(0);
    // Refetch rather than splice: the aggregate has to come from the server.
    await load();
    toast.success(mine ? "Review updated" : "Review posted");
  };

  const remove = async () => {
    setSaving(true);
    const { error } = await deleteVenueReview(venue.id);
    setSaving(false);
    if (error) {
      toast.error("Couldn't delete your review", { description: error.message });
      return;
    }
    setComposing(false);
    await load();
  };

  return (
    <section className="mt-4 border-t border-white/10 px-4 pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 py-1 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 rounded-lg"
      >
        <span className="flex min-w-0 items-center gap-2">
          <Star className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
          <span className="text-sm font-medium text-white">Reviews</span>
          {summary.count > 0 ? (
            <span className="flex items-center gap-1.5 text-xs text-slate-400">
              <StarRating value={summary.average} size={11} />
              <span className="tabular-nums">
                {summary.average?.toFixed(1)} · {summary.count}
              </span>
            </span>
          ) : (
            <span className="text-xs text-slate-500">Be the first</span>
          )}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {open ? (
        <div className="pb-1 pt-2">
          {composing ? (
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
              <StarRatingInput value={rating} onChange={setRating} disabled={saving} />
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={2000}
                rows={3}
                placeholder="How are the courts? Lights, surface, how busy it gets…"
                className="mt-2 w-full resize-none rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500/40 focus:outline-none"
              />
              <div className="mt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setComposing(false)}
                  disabled={saving}
                  className="rounded-lg px-3 py-1.5 text-sm text-slate-400 transition-colors hover:text-white cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void submit()}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-500 cursor-pointer disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  {mine ? "Update" : "Post review"}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void startCompose()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-medium text-slate-200 transition-colors hover:border-emerald-500/40 hover:bg-white/[0.06] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
            >
              {mine ? <Pencil className="h-3.5 w-3.5 text-emerald-400" /> : null}
              {mine ? "Edit your review" : "Write a review"}
            </button>
          )}

          {loading ? (
            <div className="mt-3 space-y-2" aria-hidden>
              <div className="h-3 w-2/3 animate-pulse rounded bg-white/5" />
              <div className="h-3 w-full animate-pulse rounded bg-white/5" />
            </div>
          ) : rows.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No reviews yet.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {rows.map((r) => (
                <li key={r.id} className="flex items-start gap-2.5">
                  {r.authorAvatarUrl ? (
                    <img
                      src={r.authorAvatarUrl}
                      alt=""
                      loading="lazy"
                      className="size-7 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <span className="size-7 shrink-0 rounded-full bg-emerald-500/10" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 text-[11px]">
                      <span className="font-bold text-white">
                        {r.is_mine ? "You" : r.authorName?.trim() || "Member"}
                      </span>
                      <StarRating value={r.rating} size={10} />
                      <span className="text-slate-500">{formatRelativeShort(r.created_at)}</span>
                      {r.updated_at !== r.created_at ? (
                        <span className="text-slate-600">edited</span>
                      ) : null}
                    </p>
                    {r.body ? (
                      <p className="mt-0.5 break-words text-sm text-slate-200">{r.body}</p>
                    ) : null}
                  </div>
                  {r.is_mine ? (
                    <button
                      type="button"
                      onClick={() => void remove()}
                      disabled={saving}
                      className="rounded-full p-1.5 text-slate-500 transition-colors hover:bg-white/10 hover:text-rose-300 cursor-pointer disabled:opacity-50"
                      aria-label="Delete your review"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}
