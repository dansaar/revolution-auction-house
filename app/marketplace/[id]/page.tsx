import type { Metadata } from "next";
import outputs from "@/amplify_outputs.json";
import { cdnUrl } from "@/lib/cdn";
import ListingDetailClient from "./ListingDetailClient";

// Server wrapper: social/search metadata for a shared listing link. The page
// itself stays fully client-rendered (ListingDetailClient).
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const { url, api_key: apiKey } = (outputs as any).data;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({
        query: `query GetMarketplaceListing($id: ID!) {
          getMarketplaceListing(id: $id) {
            title subtitle condition price sold paid acceptsOffers
            mediumImages thumbImages images image
          }
        }`,
        variables: { id },
      }),
      next: { revalidate: 60 },
    });
    const listing = (await res.json())?.data?.getMarketplaceListing;
    if (!listing) return {};

    const title = [listing.title, listing.condition].filter(Boolean).join(" · ");
    const soldOut = listing.sold || listing.paid;
    const description = soldOut
      ? `Sold. ${listing.subtitle || "Premium Pokémon collectible"} at Revolution Auction House.`
      : `Buy now for ${listing.price}${listing.acceptsOffers ? " or make an offer" : ""}. ${listing.subtitle || "Premium Pokémon collectible"} at Revolution Auction House.`;
    const image = cdnUrl(
      listing.mediumImages?.[0] ||
        listing.images?.[0] ||
        listing.image ||
        listing.thumbImages?.[0],
    );

    return {
      title,
      description,
      openGraph: { title, description, images: [image] },
      twitter: { card: "summary_large_image", title, description, images: [image] },
    };
  } catch {
    return {};
  }
}

export default function Page() {
  return <ListingDetailClient />;
}
