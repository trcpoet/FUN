import { cn } from "../components/ui/utils";

const MESSENGER_GLASS_BG =
  "bg-[radial-gradient(900px_circle_at_10%_0%,rgba(34,211,238,0.12),transparent_42%),radial-gradient(900px_circle_at_90%_20%,rgba(124,58,237,0.10),transparent_46%),linear-gradient(to_bottom,rgba(8,14,28,0.38),rgba(6,10,18,0.22)),linear-gradient(to_bottom,rgba(255,255,255,0.10),rgba(255,255,255,0.04))]";

const MESSENGER_GLASS_SHADOW =
  "shadow-[0_0_0_1px_rgba(34,211,238,0.10),0_24px_70px_rgba(0,0,0,0.65)]";

export function glassMessengerPanel(className?: string) {
  return cn(
    "text-popover-foreground backdrop-blur-2xl",
    "border border-white/10",
    MESSENGER_GLASS_BG,
    MESSENGER_GLASS_SHADOW,
    className,
  );
}

/** A lighter wash for full-page shells (Feed/Explore). */
export function glassMessengerPage(className?: string) {
  return cn(
    "bg-[radial-gradient(900px_circle_at_12%_0%,rgba(34,211,238,0.10),transparent_44%),radial-gradient(900px_circle_at_88%_18%,rgba(124,58,237,0.08),transparent_50%),linear-gradient(to_bottom,rgba(8,14,28,0.18),rgba(6,10,18,0.10))]",
    className,
  );
}

