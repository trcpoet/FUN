import { useMemo, useRef } from "react";
import { X, MapPin, ChevronRight, MessageCircle } from "lucide-react";
import type { MapNoteRow } from "../../lib/supabase";
import { haversineDistanceMeters } from "../lib/gamesAtVenue";
import { noteCreatedLabel, noteVisibilityIcon, noteVisibilityLabel } from "../lib/noteVisibility";
import { useModalA11y } from "../../hooks/useModalA11y";

type ColocatedNotesModalProps = {
  notes: MapNoteRow[];
  viewerCoords?: { lat: number; lng: number } | null;
  onClose: () => void;
  onOpenNote: (note: MapNoteRow) => void;
};

function commonPlaceName(notes: MapNoteRow[]): string | null {
  const names = notes.map((n) => n.place_name?.trim()).filter(Boolean) as string[];
  if (names.length === 0) return null;
  const first = names[0]!;
  return names.every((n) => n === first) ? first : null;
}

/**
 * Chooser for several notes sharing one coordinate — the note counterpart to
 * ColocatedGamesModal. Flat list rather than that modal's sport accordion: notes have no
 * sport to group by, and newest-first is the order people expect from a thread list.
 */
export function ColocatedNotesModal({
  notes,
  viewerCoords,
  onClose,
  onOpenNote,
}: ColocatedNotesModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useModalA11y(panelRef, true, onClose);

  const n0 = notes[0]!;
  const title = commonPlaceName(notes) ?? "Notes at this spot";

  const distanceMi = useMemo(() => {
    if (!viewerCoords) return null;
    return haversineDistanceMeters(viewerCoords.lat, viewerCoords.lng, n0.lat, n0.lng) / 1609.34;
  }, [viewerCoords, n0.lat, n0.lng]);

  const ordered = useMemo(
    () =>
      [...notes].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ),
    [notes]
  );

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/55 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="colocated-notes-title"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="w-full max-w-sm max-h-[min(32rem,85vh)] overflow-hidden rounded-2xl border border-slate-600/80 bg-slate-950/95 shadow-2xl focus:outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-white/10">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="colocated-notes-title" className="text-lg font-semibold text-white truncate">
                {title}
              </h2>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-400">
                <span className="text-cyan-300">
                  {notes.length} note{notes.length === 1 ? "" : "s"}
                </span>
                {distanceMi != null ? (
                  <>
                    <span aria-hidden>·</span>
                    <MapPin className="w-3.5 h-3.5 shrink-0" aria-hidden />
                    {distanceMi.toFixed(1)} mi away
                  </>
                ) : null}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 p-2 rounded-full hover:bg-slate-800 text-slate-300"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto max-h-[min(24rem,70vh)] p-2">
          <ul className="space-y-1">
            {ordered.map((note) => {
              const label = noteVisibilityLabel(note.visibility);
              const Icon = noteVisibilityIcon(note.visibility);
              const comments = note.comment_count ?? 0;
              return (
                <li key={note.id}>
                  <button
                    type="button"
                    onClick={() => onOpenNote(note)}
                    className="flex w-full items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-left transition-colors hover:border-cyan-400/30 hover:bg-cyan-400/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40 cursor-pointer"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm text-slate-100">{note.body}</p>
                      <p className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500">
                        <Icon className="h-3 w-3 shrink-0" aria-hidden />
                        {label}
                        <span aria-hidden>·</span>
                        {noteCreatedLabel(note.created_at)}
                        {comments > 0 ? (
                          <>
                            <span aria-hidden>·</span>
                            <MessageCircle className="h-3 w-3 shrink-0" aria-hidden />
                            {comments}
                          </>
                        ) : null}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
