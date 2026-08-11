import { useId } from "react";
import { cn } from "./ui/utils";

type GoogleMapsLinkButtonProps = {
  href: string;
  className?: string;
};

/**
 * The Google Maps pin, drawn inline.
 *
 * This was a raster at `/brand/google-maps-pin.png` — which was actually a WebP with a `.png`
 * extension, so it depended on browser content-sniffing to render at all. Inline SVG has no
 * MIME to get wrong, no request to make, and stays crisp at any DPI.
 *
 * The four Google colours are laid down as diagonal bands and clipped to the pin silhouette,
 * which is what makes the mark legible at 20px: the bands read as colour, not as shapes. The
 * clip path needs a document-unique id because two popups can be mounted at once.
 */
function GoogleMapsPin() {
  const clipId = useId();
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden focusable="false">
      <defs>
        <clipPath id={clipId}>
          <path d="M12 2a7.5 7.5 0 0 0-7.5 7.5c0 5.2 6.6 11.6 6.9 11.9a.9.9 0 0 0 1.2 0c.3-.3 6.9-6.7 6.9-11.9A7.5 7.5 0 0 0 12 2Z" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <path d="M-2-2h28v5L-2 11Z" fill="#4285F4" />
        <path d="M-2 11 26 3v5L-2 16Z" fill="#34A853" />
        <path d="M-2 16 26 8v4L-2 20Z" fill="#FBBC04" />
        <path d="M-2 20 26 12v14H-2Z" fill="#EA4335" />
      </g>
      <circle cx="12" cy="9.5" r="3" fill="#fff" />
    </svg>
  );
}

/** Icon-only deep link that opens Google Maps directions in a new tab. */
export function GoogleMapsLinkButton({ href, className }: GoogleMapsLinkButtonProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Open in Google Maps"
      title="Open in Google Maps"
      className={cn(
        // 40px visual box so it lines up with the sibling action buttons in both popups, with
        // the tap target pushed out to 48px so it still clears the 44px touch minimum.
        "relative inline-flex size-10 shrink-0 items-center justify-center rounded-xl",
        "border border-white/10 bg-white/[0.02] transition-colors hover:bg-white/5",
        "before:absolute before:-inset-1 before:content-['']",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30",
        className,
      )}
    >
      <GoogleMapsPin />
    </a>
  );
}
