// Canonical site origin for SEO metadata, sitemaps, and absolute links.
// NEXT_PUBLIC_SITE_URL is set per-environment (see amplify.yml) once the
// custom domain is live; the fallback matches the production domain.
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://www.revolutionauctionhouse.com";
