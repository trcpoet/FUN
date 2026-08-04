import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { uploadVenuePhoto, type VenuePhotoRow } from "../../../lib/venueSocial";
import type { VenueSelection } from "../mapboxMapTypes";

type Props = {
  venue: VenueSelection;
  onUploaded: (photo: VenuePhotoRow) => void;
  onClose: () => void;
};

/** Mirrors the server-side cap in add_venue_photo. */
const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Inline "add a photo" panel.
 *
 * Rendered inside the venue modal rather than as a nested dialog — a second
 * focus trap on top of the modal's own is a reliable way to strand keyboard
 * users, and this flow is two fields.
 *
 * The client checks are a courtesy, not a control: type, size and per-venue
 * quota are all re-enforced by add_venue_photo and by storage RLS, because
 * anything checked only here can be skipped entirely.
 */
export function VenuePhotoUploadPanel({ venue, onUploaded, onClose }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);

  // Object URLs leak until revoked, and this panel can be opened repeatedly.
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const pick = (next: File | null) => {
    if (!next) return;
    if (!next.type.startsWith("image/")) {
      toast.error("That's not an image file");
      return;
    }
    if (next.size > MAX_BYTES) {
      toast.error("That photo is over 8 MB", { description: "Try a smaller one." });
      return;
    }
    setFile(next);
  };

  const submit = async () => {
    if (!file || busy) return;
    setBusy(true);
    const { data, error } = await uploadVenuePhoto({ venue, file, caption });
    setBusy(false);
    if (error) {
      toast.error("Couldn't add that photo", { description: error.message });
      return;
    }
    if (data) onUploaded(data);
    toast.success("Photo added");
    onClose();
  };

  return (
    <div className="mx-4 mt-2 rounded-xl border border-white/10 bg-white/[0.04] p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-white">Add a photo</p>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
          aria-label="Cancel adding a photo"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => pick(e.target.files?.[0] ?? null)}
      />

      {previewUrl ? (
        <div className="mt-2 aspect-[16/9] overflow-hidden rounded-lg bg-black/30">
          <img src={previewUrl} alt="Photo preview" className="h-full w-full object-cover" />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-2 flex aspect-[16/9] w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-white/15 bg-black/20 text-slate-400 transition-colors hover:border-emerald-500/40 hover:text-slate-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
        >
          <ImagePlus className="h-6 w-6" aria-hidden />
          <span className="text-sm">Choose a photo</span>
          <span className="text-[11px] text-slate-500">JPG or PNG, up to 8 MB</span>
        </button>
      )}

      <input
        type="text"
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        maxLength={200}
        placeholder="Caption (optional)"
        className="mt-2 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500/40 focus:outline-none"
      />

      <p className="mt-2 text-[10px] leading-snug text-slate-500">
        Only post photos you took. Photos can be reported and hidden.
      </p>

      <div className="mt-2 flex items-center justify-end gap-2">
        {file ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="rounded-lg px-3 py-1.5 text-sm text-slate-400 transition-colors hover:text-white cursor-pointer disabled:opacity-50"
          >
            Change
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!file || busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-500 cursor-pointer disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Upload
        </button>
      </div>
    </div>
  );
}
