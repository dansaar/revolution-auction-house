import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
};

export default withSentryConfig(nextConfig, {
  org: "vallatek",
  project: "javascript-nextjs",
  // Quieter build logs (only verbose on CI).
  silent: !process.env.CI,
  // Source map upload only runs when SENTRY_AUTH_TOKEN is present (optional).
  widenClientFileUpload: true,
  // Route Sentry requests through the app to dodge ad-blockers.
  tunnelRoute: "/monitoring",
  disableLogger: true,
});
