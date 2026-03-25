import * as React from "react";

import { cn } from "./utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "resize-none placeholder:text-muted-foreground flex field-sizing-content min-h-24 w-full rounded-lg border border-border/80 bg-input-background px-3 py-2 text-sm text-foreground",
        "transition-[color,box-shadow,border-color] duration-[var(--dur-hover)] ease-[var(--ease-out)] outline-none",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "aria-invalid:ring-destructive/25 aria-invalid:border-destructive",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
