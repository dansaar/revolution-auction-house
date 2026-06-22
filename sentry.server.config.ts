// Server-side Sentry init. Loaded from instrumentation.ts register() on the
// Node runtime. DSNs are public by design; override via NEXT_PUBLIC_SENTRY_DSN.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn:
    process.env.NEXT_PUBLIC_SENTRY_DSN ||
    "https://027ff5af35ee8f031b51f85c2758781c@o4511606624157696.ingest.us.sentry.io/4511606651486208",
  // Only send from real deploys so local dev doesn't burn the free quota.
  enabled: process.env.NODE_ENV === "production",
  tracesSampleRate: 0.1,
  // Keep noise low; full breadcrumbs/spans aren't needed for a small site.
  sendDefaultPii: false,
});
