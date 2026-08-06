import { cn } from "./ui/utils";

type GoogleMapsLinkButtonProps = {
  href: string;
  className?: string;
};

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
        "inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.02] transition-colors hover:bg-white/5",
        className,
      )}
    >
      <img
        src="/brand/google-maps-pin.png"
        alt=""
        width={20}
        height={20}
        className="size-5"
      />
    </a>
  );
}
