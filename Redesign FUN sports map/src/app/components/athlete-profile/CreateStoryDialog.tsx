import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { ArrowLeft, Film, ImagePlus, Loader2 } from "lucide-react";
import { cn } from "../ui/utils";
import { uploadProfileStoryMedia } from "../../../lib/api";
import type { StoryEntry, StoryMediaItem } from "../../../lib/athleteProfile";

type LocalPick = { file: File; previewUrl: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (story: StoryEntry) => Promise<void>;
};

export function CreateStoryDialog({ open, onOpenChange, onSave }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [label, setLabel] = useState("");
  const [picks, setPicks] = useState<LocalPick[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearPicks = () => {
    setPicks((prev) => {
      prev.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      return [];
    });
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setStep(1);
      setLabel("");
      clearPicks();
      setSaving(false);
      setError(null);
    }
    onOpenChange(next);
  };

  const addFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const next: LocalPick[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) continue;
      next.push({ file, previewUrl: URL.createObjectURL(file) });
    }
    if (next.length) setPicks((prev) => [...prev, ...next]);
  };

  const removePick = (index: number) => {
    setPicks((prev) => {
      const copy = [...prev];
      const [removed] = copy.splice(index, 1);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return copy;
    });
  };

  const goNext = () => {
    const t = label.trim();
    if (!t) {
      setError("Enter a name for your story.");
      return;
    }
    setError(null);
    setStep(2);
  };

  const submit = async () => {
    if (picks.length === 0) {
      setError("Add at least one photo or video.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const media: StoryMediaItem[] = [];
      let thumbUrl: string | null | undefined;

      for (const { file } of picks) {
        const { url, error: upErr } = await uploadProfileStoryMedia(file);
        if (upErr || !url) throw new Error(upErr?.message ?? "Upload failed");
        const type: "image" | "video" = file.type.startsWith("video/") ? "video" : "image";
        media.push({ url, type });
        if (!thumbUrl && type === "image") thumbUrl = url;
      }

      const story: StoryEntry = {
        id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `story-${Date.now()}`,
        label: label.trim(),
        thumbUrl: thumbUrl ?? null,
        media: media.length ? media : undefined,
      };

      await onSave(story);
      picks.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      setPicks([]);
      setStep(1);
      setLabel("");
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create story");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(
          "bg-[#0c1222] border-white/10 text-slate-100 sm:max-w-md",
          "max-h-[min(90vh,560px)] overflow-y-auto"
        )}
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle className="text-white pr-8">
            {step === 1 ? "Name your story" : "Add photos or videos"}
          </DialogTitle>
        </DialogHeader>

        {step === 1 ? (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              This label appears under your story ring on your profile.
            </p>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Game day, Training, Highlights"
              maxLength={80}
              className="bg-slate-900/80 border-white/10 text-white placeholder:text-slate-600"
            />
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              Story: <span className="text-slate-300 font-medium">{label.trim()}</span>
            </p>
            <label className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 bg-white/[0.03] px-4 py-8 cursor-pointer hover:bg-white/[0.06] transition-colors">
              <ImagePlus className="size-8 text-slate-500" />
              <span className="text-sm text-slate-400">Tap to choose images or videos</span>
              <input
                type="file"
                accept="image/*,video/*"
                multiple
                className="sr-only"
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            {picks.length > 0 && (
              <ul className="grid grid-cols-3 gap-2">
                {picks.map((p, i) => (
                  <li key={`${p.previewUrl}-${i}`} className="relative aspect-square rounded-lg overflow-hidden bg-slate-900 group">
                    {p.file.type.startsWith("video/") ? (
                      <>
                        <video src={p.previewUrl} className="size-full object-cover" muted playsInline />
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/30">
                          <Film className="size-6 text-white/90" />
                        </div>
                      </>
                    ) : (
                      <img src={p.previewUrl} alt="" className="size-full object-cover" />
                    )}
                    <button
                      type="button"
                      onClick={() => removePick(i)}
                      className="absolute top-1 right-1 size-6 rounded-full bg-black/70 text-white text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label="Remove"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {error && <p className="text-xs text-amber-400">{error}</p>}

        <DialogFooter className="gap-2 sm:gap-2 flex-col sm:flex-row">
          {step === 2 ? (
            <Button
              type="button"
              variant="ghost"
              className="text-slate-400 hover:text-white"
              onClick={() => {
                setStep(1);
                setError(null);
              }}
            >
              <ArrowLeft className="size-4 mr-1" />
              Back
            </Button>
          ) : (
            <Button type="button" variant="ghost" className="text-slate-400" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
          )}
          {step === 1 ? (
            <Button type="button" className="bg-emerald-600 hover:bg-emerald-500 text-white" onClick={goNext}>
              Next
            </Button>
          ) : (
            <Button
              type="button"
              disabled={saving || picks.length === 0}
              className="bg-emerald-600 hover:bg-emerald-500 text-white"
              onClick={() => void submit()}
            >
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-2" />
                  Uploading…
                </>
              ) : (
                "Create story"
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
