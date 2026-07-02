import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Account, transaction, and back-office surfaces — no crawl value.
      disallow: [
        "/admin",
        "/admin-cleanup",
        "/api/",
        "/cart",
        "/checkout",
        "/confirm-signup",
        "/dashboard",
        "/forgot-password",
        "/sell",
        "/seller",
        "/signin",
        "/signup",
        "/verify",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
