// Edge-runtime Sentry init (middleware, edge routes). Loaded from
// instrumentation.ts register() when NEXT_RUNTIME === "edge".
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn:
    process.env.NEXT_PUBLIC_SENTRY_DSN ||
    "https://027ff5af35ee8f031b51f85c2758781c@o4511606624157696.ingest.us.sentry.io/4511606651486208",
  enabled: process.env.NODE_ENV === "production",
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
});
