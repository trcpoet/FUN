import React, { useCallback, useEffect, useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Label } from "../ui/label";
import { Slider } from "../ui/slider";
import { Switch } from "../ui/switch";
import { Film, ImagePlus, Loader2 } from "lucide-react";
import { cn } from "../ui/utils";
import { uploadProfileFeedMedia } from "../../../lib/api";
import { getCroppedImageFile } from "../../../lib/imageCrop";
import type { ActivityPost, HighlightEntry } from "../../../lib/athleteProfile";

export type AddFeedKind = "post" | "reel";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: AddFeedKind;
  onSave: (
    item:
      | { type: "post"; post: ActivityPost }
      | { type: "reel"; highlight: HighlightEntry }
  ) => Promise<void>;
};

function newId(prefix: string) {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}`;
}

function outputMime(originalType: string): string {
  if (originalType === "image/png" || originalType === "image/webp") return originalType;
  return "image/jpeg";
}

export function AddPostOrReelDialog({ open, onOpenChange, kind, onSave }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [captionOrTitle, setCaptionOrTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [squareCrop, setSquareCrop] = useState(true);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const croppedPixelsRef = useRef<Area | null>(null);

  const resetCropState = useCallback(() => {
    setSquareCrop(true);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    croppedPixelsRef.current = null;
  }, []);

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setCaptionOrTitle("");
    setSaving(false);
    setError(null);
    resetCropState();
  }, [open, kind, resetCropState]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setFile(null);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setCaptionOrTitle("");
      setError(null);
      resetCropState();
    }
    onOpenChange(next);
  };

  const onCropComplete = useCallback((_area: Area, pixels: Area) => {
    croppedPixelsRef.current = pixels;
  }, []);

  const onPickFile = (list: FileList | null) => {
    const f = list?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/") && !f.type.startsWith("video/")) {
      setError("Choose an image or video file.");
      return;
    }
    setError(null);
    resetCropState();
    setFile(f);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(f);
    });
  };

  const submit = async () => {
    if (!file || !previewUrl) {
      setError("Choose a file from your device.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      let uploadFile: File = file;

      if (file.type.startsWith("image/") && squareCrop) {
        if (!croppedPixelsRef.current) {
          setError("Wait a moment for the crop preview to finish loading, or turn off square crop.");
          setSaving(false);
          return;
        }
        uploadFile = await getCroppedImageFile(previewUrl, croppedPixelsRef.current, file.name, {
          maxEdge: 1920,
          mimeType: outputMime(file.type),
        });
      }

      const folder = kind === "post" ? "posts" : "reels";
      const { url, error: upErr } = await uploadProfileFeedMedia(uploadFile, folder);
      if (upErr || !url) throw new Error(upErr?.message ?? "Upload failed");

      const mediaKind = uploadFile.type.startsWith("video/") ? ("video" as const) : ("image" as const);
      const text = captionOrTitle.trim();
      const baseName = file.name.replace(/\.[^.]+$/, "") || (kind === "post" ? "Post" : "Reel");

      if (kind === "post") {
        const post: ActivityPost = {
          id: newId("post"),
          caption: text || baseName,
          mediaUrl: url,
          mediaKind,
        };
        await onSave({ type: "post", post });
      } else {
        const highlight: HighlightEntry = {
          id: newId("reel"),
          kind: "clip",
          title: text || baseName,
          thumbUrl: url,
          mediaKind,
        };
        await onSave({ type: "reel", highlight });
      }

      handleOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const isPost = kind === "post";
  const isImage = Boolean(file?.type?.startsWith("image/"));
  const isVideo = Boolean(file?.type?.startsWith("video/"));

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(
          "bg-[#0c1222] border-white/10 text-slate-100 sm:max-w-lg",
          "max-h-[min(92vh,720px)] overflow-y-auto"
        )}
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle className="text-white pr-8">{isPost ? "New post" : "New reel"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            {isPost
              ? "Upload a photo or video. For photos you can square-crop and we resize long edges to max 1920px before upload."
              : "Upload a cover image or clip. Photos can be square-cropped and resized the same way."}
          </p>

          <label className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 bg-white/[0.03] px-4 py-8 cursor-pointer hover:bg-white/[0.06] transition-colors">
            <ImagePlus className="size-8 text-slate-500" />
            <span className="text-sm text-slate-400">Choose from files</span>
            <input
              type="file"
              accept="image/*,video/*"
              className="sr-only"
              onChange={(e) => {
                onPickFile(e.target.files);
                e.target.value = "";
              }}
            />
          </label>

          {previewUrl && file && (
            <div className="space-y-3">
              {isImage && (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">Square crop &amp; resize</p>
                    <p className="text-[11px] text-slate-500">Off = upload the full image as-is.</p>
                  </div>
                  <Switch
                    checked={squareCrop}
                    onCheckedChange={setSquareCrop}
                    className="data-[state=checked]:bg-emerald-600"
                  />
                </div>
              )}

              {isImage && squareCrop ? (
                <>
                  <div className="relative h-56 w-full overflow-hidden rounded-xl border border-white/10 bg-black">
                    <Cropper
                      image={previewUrl}
                      crop={crop}
                      zoom={zoom}
                      aspect={1}
                      onCropChange={setCrop}
                      onZoomChange={setZoom}
                      onCropComplete={onCropComplete}
                      showGrid={false}
                      objectFit="contain"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-400">Zoom</Label>
                    <Slider
                      min={100}
                      max={300}
                      step={1}
                      value={[Math.round(zoom * 100)]}
                      onValueChange={(v) => setZoom(v[0]! / 100)}
                      className="py-1"
                    />
                  </div>
                </>
              ) : (
                <div className="relative aspect-square w-full max-h-56 mx-auto overflow-hidden rounded-xl bg-slate-900 border border-white/10">
                  {isVideo ? (
                    <>
                      <video src={previewUrl} className="size-full object-cover" muted playsInline loop />
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/25">
                        <Film className="size-8 text-white/90" />
                      </div>
                    </>
                  ) : (
                    <img src={previewUrl} alt="" className="size-full object-contain bg-black" />
                  )}
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-slate-400">{isPost ? "Caption" : "Title"}</Label>
            {isPost ? (
              <Textarea
                value={captionOrTitle}
                onChange={(e) => setCaptionOrTitle(e.target.value)}
                placeholder="Say something about this post…"
                rows={3}
                maxLength={500}
                className="bg-slate-900/80 border-white/10 text-white placeholder:text-slate-600 resize-none"
              />
            ) : (
              <Input
                value={captionOrTitle}
                onChange={(e) => setCaptionOrTitle(e.target.value)}
                placeholder="e.g. Game highlights"
                maxLength={120}
                className="bg-slate-900/80 border-white/10 text-white placeholder:text-slate-600"
              />
            )}
          </div>

          {error && <p className="text-xs text-amber-400">{error}</p>}
        </div>

        <DialogFooter className="gap-2 sm:gap-2 flex-col sm:flex-row">
          <Button type="button" variant="ghost" className="text-slate-400" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={saving || !file}
            className="bg-emerald-600 hover:bg-emerald-500 text-white"
            onClick={() => void submit()}
          >
            {saving ? (
              <>
                <Loader2 className="size-4 animate-spin mr-2" />
                Uploading…
              </>
            ) : isPost ? (
              "Post"
            ) : (
              "Add reel"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
