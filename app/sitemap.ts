import type { MetadataRoute } from "next";
import outputs from "@/amplify_outputs.json";
import { SITE_URL } from "@/lib/site";

type GraphQLItems = { id: string; updatedAt?: string | null }[];

async function query(
  name: string,
  filterExpr: string,
): Promise<GraphQLItems> {
  const { url, api_key: apiKey } = (outputs as any).data;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify({
      query: `query { ${name}(limit: 1000${filterExpr}) { items { id updatedAt } } }`,
    }),
    next: { revalidate: 3600 },
  });
  const json = await res.json();
  return json?.data?.[name]?.items || [];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE_URL}/auctions`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${SITE_URL}/marketplace`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/auctions/results`, changeFrequency: "daily", priority: 0.5 },
    { url: `${SITE_URL}/marketplace/results`, changeFrequency: "daily", priority: 0.5 },
    { url: `${SITE_URL}/bidder-agreement`, changeFrequency: "yearly", priority: 0.2 },
  ];

  try {
    const [liveAuctions, endedAuctions, listings] = await Promise.all([
      query("listAuctions", ", filter: { ended: { eq: false } }"),
      query("listAuctions", ", filter: { ended: { eq: true } }"),
      query("listMarketplaceListings", ", filter: { sold: { ne: true } }"),
    ]);

    return [
      ...staticRoutes,
      ...liveAuctions.map((a) => ({
        url: `${SITE_URL}/auctions/${a.id}`,
        lastModified: a.updatedAt ? new Date(a.updatedAt) : undefined,
        changeFrequency: "hourly" as const,
        priority: 0.8,
      })),
      ...endedAuctions.map((a) => ({
        url: `${SITE_URL}/auctions/${a.id}/results`,
        lastModified: a.updatedAt ? new Date(a.updatedAt) : undefined,
        changeFrequency: "monthly" as const,
        priority: 0.3,
      })),
      ...listings.map((l) => ({
        url: `${SITE_URL}/marketplace/${l.id}`,
        lastModified: l.updatedAt ? new Date(l.updatedAt) : undefined,
        changeFrequency: "daily" as const,
        priority: 0.7,
      })),
    ];
  } catch {
    // Data fetch failed — still serve the static routes.
    return staticRoutes;
  }
}
