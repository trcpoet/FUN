import { MAP_LONG_PRESS_RING_SIZE_PX } from "../map/mapConfig";

type MapLongPressIndicatorProps = {
  /** Contact point in map-overlay pixels (canvas-relative). */
  x: number;
  y: number;
  /** Fill progress, 0 → 1. */
  progress: number;
};

/**
 * Circular progress ring shown at the finger/cursor while pressing-and-holding
 * an empty spot on the map to open Create Game. Purely presentational — the map
 * overlay positions it and drives `progress`.
 */
export function MapLongPressIndicator({ x, y, progress }: MapLongPressIndicatorProps) {
  const size = MAP_LONG_PRESS_RING_SIZE_PX;
  const stroke = 4;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, progress));

  return (
    <div
      className="pointer-events-none absolute z-40 text-primary"
      style={{ left: x, top: y, width: size, height: size, transform: "translate(-50%, -50%)" }}
      aria-hidden
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="block drop-shadow-[0_2px_8px_rgba(0,0,0,0.45)]">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="rgba(10,15,28,0.55)"
          stroke="rgba(255,255,255,0.18)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
    </div>
  );
}
