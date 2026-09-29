import * as Sentry from "@sentry/nextjs";

/**
 * Capture an exception to Sentry with optional extra context.
 * Safe to call even when Sentry is not configured (no-op).
 */
export function captureException(
  error: unknown,
  context?: Record<string, unknown>
): void {
  if (context) {
    Sentry.withScope((scope) => {
      for (const [key, value] of Object.entries(context)) {
        scope.setExtra(key, value);
      }
      Sentry.captureException(error);
    });
  } else {
    Sentry.captureException(error);
  }
}
