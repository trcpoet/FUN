"use client";

import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";

import { cn } from "./utils";

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  variant = "default",
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root> & {
  variant?: "default" | "game";
}) {
  const _values = React.useMemo(
    () =>
      Array.isArray(value)
        ? value
        : Array.isArray(defaultValue)
          ? defaultValue
          : [min, max],
    [value, defaultValue, min, max],
  );

  const isGame = variant === "game";

  return (
    <SliderPrimitive.Root
      data-slot="slider"
      data-variant={variant}
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      className={cn(
        "relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50 data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col",
        isGame && "py-2.5",
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className={cn(
          "relative grow overflow-hidden rounded-full data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1.5",
          isGame
            ? "bg-white/15 ring-1 ring-inset ring-white/10 data-[orientation=horizontal]:h-2.5"
            : "bg-muted data-[orientation=horizontal]:h-4",
        )}
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className={cn(
            "absolute data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full motion-safe:transition-[width] motion-safe:duration-200",
            isGame
              ? "rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400 shadow-[0_0_12px_rgba(16,185,129,0.35)]"
              : "bg-primary",
          )}
        />
      </SliderPrimitive.Track>
      {Array.from({ length: _values.length }, (_, index) => (
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          key={index}
          className={cn(
            "block shrink-0 rounded-full border shadow-sm focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none",
            isGame
              ? "size-5 border-2 border-white bg-[#0f172a] shadow-lg shadow-black/40 ring-2 ring-emerald-500/40 transition-[box-shadow,transform] hover:ring-emerald-400/60 focus-visible:ring-4 focus-visible:ring-emerald-400/50 active:scale-95"
              : "border-primary bg-background ring-ring/50 size-4 transition-[color,box-shadow] hover:ring-4 focus-visible:ring-4",
          )}
        />
      ))}
    </SliderPrimitive.Root>
  );
}

export { Slider };
