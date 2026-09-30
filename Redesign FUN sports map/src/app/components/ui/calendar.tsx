"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";

import { cn } from "./utils";
import { buttonVariants } from "./button";

/**
 * The date picker, on react-day-picker v9.
 *
 * v9 renamed most of its class-name keys and replaced the two icon components
 * with one. The mapping, for anyone comparing against the old file:
 *
 *   caption        -> month_caption      table     -> month_grid
 *   nav_button_*   -> button_previous /  head_row  -> weekdays
 *                     button_next        head_cell -> weekday
 *   cell           -> day                row       -> week
 *   day            -> day_button
 *   day_selected   -> selected           day_today    -> today
 *   day_outside    -> outside            day_disabled -> disabled
 *   day_hidden     -> hidden             day_range_*  -> range_*
 *   IconLeft/Right -> Chevron (one component, switched on `orientation`)
 *
 * The visual result is unchanged; only the keys moved. Note that `day` now means
 * the grid cell and `day_button` the control inside it — the opposite of the
 * intuition v8 gave you, and the easiest thing to get wrong here.
 */
function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        // v9 renders `nav` as a SIBLING of the month, not inside the caption as
        // v8 did, and positions nothing. Absolutely-positioned nav buttons
        // therefore escaped to the viewport. Anchor them to a positioned root
        // and let one flex row put them at either end of the caption.
        root: "relative",
        months: "flex flex-col sm:flex-row gap-2",
        month: "flex flex-col gap-4",
        month_caption: "flex justify-center pt-1 items-center w-full",
        caption_label: "text-sm font-medium",
        nav: "absolute inset-x-3 top-3 z-10 flex items-center justify-between",
        button_previous: cn(
          buttonVariants({ variant: "outline" }),
          "size-7 bg-transparent p-0 opacity-50 hover:opacity-100",
        ),
        button_next: cn(
          buttonVariants({ variant: "outline" }),
          "size-7 bg-transparent p-0 opacity-50 hover:opacity-100",
        ),
        month_grid: "w-full border-collapse space-x-1",
        weekdays: "flex",
        weekday: "text-muted-foreground rounded-md w-8 font-normal text-[0.8rem]",
        week: "flex w-full mt-2",
        day: cn(
          "relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-accent [&:has([aria-selected].day-range-end)]:rounded-r-md",
          props.mode === "range"
            ? "[&:has(>.day-range-end)]:rounded-r-md [&:has(>.day-range-start)]:rounded-l-md first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md"
            : "[&:has([aria-selected])]:rounded-md",
        ),
        day_button: cn(
          buttonVariants({ variant: "ghost" }),
          "size-8 p-0 font-normal aria-selected:opacity-100",
        ),
        range_start:
          "day-range-start aria-selected:bg-primary aria-selected:text-primary-foreground",
        range_end:
          "day-range-end aria-selected:bg-primary aria-selected:text-primary-foreground",
        selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        today: "bg-accent text-accent-foreground",
        outside:
          "day-outside text-muted-foreground aria-selected:text-muted-foreground",
        disabled: "text-muted-foreground opacity-50",
        range_middle:
          "aria-selected:bg-accent aria-selected:text-accent-foreground",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ className, orientation, ...rest }) =>
          orientation === "left" ? (
            <ChevronLeft className={cn("size-4", className)} {...rest} />
          ) : (
            <ChevronRight className={cn("size-4", className)} {...rest} />
          ),
      }}
      {...props}
    />
  );
}

export { Calendar };
