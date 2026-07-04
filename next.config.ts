import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// Baseline hardening. The CSP is deliberately narrow (clickjacking, plugin
// content, base-tag hijacks) rather than a full script-src policy — Next's
// inline runtime chunks would need nonces for that; revisit post-launch.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
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
