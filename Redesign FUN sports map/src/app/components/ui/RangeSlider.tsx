import { useId } from "react";
import { cn } from "./utils";

/**
 * One range input for the whole app, in black and grey.
 *
 * Create Game had two raw `<input type="range">` with `accent-violet-500/80` —
 * a colour in no palette the app has, and a control whose look was whatever the
 * browser felt like. Native accent-color also cannot express "filled to here":
 * Chrome fills the track, Safari does not, Firefox does something else again.
 *
 * So the fill is drawn: a linear-gradient hard stop at the value, repainted
 * from the same number the thumb is at. Track is near-black, fill is grey, and
 * the thumb is the only light thing on it — the value is legible without a
 * colour doing the talking. Teal appears on focus and nowhere else, which keeps
 * the brand colour meaning "this is where you act".
 */

/**
 * Darker than every surface token, so the empty half of the track is visibly
 * empty wherever the slider is placed — on the void (#0A0F1C) or on any of the
 * three surface tiers. #0B0F18 was too close to the background to read at all:
 * a slider at its minimum looked like a thumb floating on nothing.
 */
const TRACK = "#05070c";
const FILL = "#6b7688";
const THUMB = "#d5dbe6";

export type RangeSliderProps = {
  value: number;
  min: number;
  max: number;
  step?: number;
  onValueChange: (next: number) => void;
  /** Required: this control never ships with a visible <label> wrapping it. */
  "aria-label": string;
  /** Spoken value, when the number alone would not mean anything ("90 minutes"). */
  "aria-valuetext"?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
};

/**
 * How far along the track the fill stops, 0-100.
 *
 * Exported because it is the only arithmetic here and the only place this can go
 * wrong: a value outside the range, or a range of zero width.
 */
export function rangeFillPercent(value: number, min: number, max: number): number {
  const span = max - min;
  if (!(span > 0)) return 100; // a single-valued range is, trivially, full
  const clamped = Math.min(Math.max(value, min), max);
  return ((clamped - min) / span) * 100;
}

export function RangeSlider({
  value,
  min,
  max,
  step = 1,
  onValueChange,
  disabled,
  className,
  id,
  ...aria
}: RangeSliderProps) {
  const autoId = useId();
  const pct = rangeFillPercent(value, min, max);

  return (
    <input
      id={id ?? autoId}
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      onChange={(e) => onValueChange(Number(e.target.value))}
      className={cn("fun-range", className)}
      style={{
        // Read by the pseudo-element rules in index.css. Kept as a custom
        // property rather than a background so the two vendor track selectors
        // (::-webkit-slider-runnable-track, ::-moz-range-track) can share it.
        ["--fun-range-pct" as string]: `${pct}%`,
        ["--fun-range-track" as string]: TRACK,
        ["--fun-range-fill" as string]: FILL,
        ["--fun-range-thumb" as string]: THUMB,
      }}
      {...aria}
    />
  );
}
