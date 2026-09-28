/**
 * Crash reporting, kept off the critical path.
 *
 * Sentry's SDK is not small and FUN treats first paint as a feature, so it is
 * imported only after the page has loaded, and only when `VITE_SENTRY_DSN` is set:
 * a deployment without one never downloads it. Errors thrown before it arrives are
 * held (up to a cap) and sent once it does.
 *
 * What leaves the browser is the error, its stack and breadcrumbs — never who. The
 * SDK's defaults would attach user fields, cookies, headers, request bodies and URL
 * query strings (which carry the Supabase key on the realtime socket and coordinates
 * on some routes), so every one of those is switched off.
 */

type Context = Record<string, unknown>;
type Capture = (error: unknown, context?: Context) => void;

const MAX_PENDING = 20;

let capture: Capture | null = null;
let pending: { error: unknown; context?: Context }[] = [];

export function reportError(error: unknown, context?: Context): void {
  if (capture) capture(error, context);
  else if (pending.length < MAX_PENDING) pending.push({ error, context });
}

export function startErrorReporting(dsn: string): Promise<void> {
  // Sentry installs its own global handlers on init; until then, these hold the gap.
  const onError = (e: ErrorEvent) => reportError(e.error ?? e.message);
  const onRejection = (e: PromiseRejectionEvent) => reportError(e.reason);
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);

  return new Promise<void>((resolve) => {
    const load = () => {
      import('./sentryClient')
        .then((Sentry) => {
          Sentry.init({
            dsn,
            environment: import.meta.env.MODE,
            dataCollection: {
              userInfo: false,
              cookies: false,
              httpHeaders: false,
              httpBodies: [],
              urlQueryParams: false,
            },
          });
          capture = (error, context) => {
            Sentry.captureException(error, context ? { extra: context } : undefined);
          };
          for (const p of pending) capture(p.error, p.context);
        })
        .catch(() => {
          // Blocked by an ad blocker or offline: the app runs fine without it.
        })
        .finally(() => {
          pending = [];
          window.removeEventListener('error', onError);
          window.removeEventListener('unhandledrejection', onRejection);
          resolve();
        });
    };
    if (document.readyState === 'complete') load();
    else window.addEventListener('load', load, { once: true });
  });
}
