"use client";

import { Toaster as Sonner, ToasterProps } from "sonner";

/**
 * Toasts, in the app's only theme.
 *
 * This used to read `useTheme()` from `next-themes` — a dependency that could
 * never have worked: no `ThemeProvider` is mounted anywhere, so the hook fell
 * back to "system", and `main.tsx` mounts this with `theme="dark"`, which the
 * props spread below applies *after* the hook's value. It computed a theme and
 * threw it away on every render. FUN is dark-only (Neon Nocturne), so that is
 * simply the default now, and a caller can still override it.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
