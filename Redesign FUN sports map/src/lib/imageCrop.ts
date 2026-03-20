import type { Area } from "react-easy-crop";

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", (e) => reject(e));
    image.src = url;
  });
}

/**
 * Renders the cropped region to a canvas, optionally downscaling so the longest edge ≤ maxEdge.
 */
export async function getCroppedImageFile(
  imageSrc: string,
  pixelCrop: Area,
  outputName: string,
  opts?: { maxEdge?: number; mimeType?: string; quality?: number }
): Promise<File> {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement("canvas");
  let width = Math.round(pixelCrop.width);
  let height = Math.round(pixelCrop.height);

  const maxEdge = opts?.maxEdge ?? 1920;
  if (width > maxEdge || height > maxEdge) {
    const scale = maxEdge / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get canvas context");

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    width,
    height
  );

  const mime =
    opts?.mimeType && (opts.mimeType === "image/png" || opts.mimeType === "image/webp")
      ? opts.mimeType
      : "image/jpeg";
  const quality = opts?.quality ?? (mime === "image/jpeg" ? 0.9 : undefined);

  const blob = await new Promise<Blob | null>((resolve) => {
    if (mime === "image/jpeg" || mime === "image/webp") {
      canvas.toBlob((b) => resolve(b), mime, quality);
    } else {
      canvas.toBlob((b) => resolve(b), mime);
    }
  });
  if (!blob) throw new Error("Failed to create image");

  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  const base = outputName.replace(/\.[^.]+$/, "") || "image";
  return new File([blob], `${base}.${ext}`, { type: mime });
}
