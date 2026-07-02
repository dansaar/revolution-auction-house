import type { Metadata } from "next";
import outputs from "@/amplify_outputs.json";
import { cdnUrl } from "@/lib/cdn";
import AuctionDetailClient from "./AuctionDetailClient";

// Server wrapper: social/search metadata for a shared auction link. The page
// itself stays fully client-rendered (AuctionDetailClient).
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
        query: `query GetAuction($id: ID!) {
          getAuction(id: $id) {
            title subtitle grade price bids ended
            mediumImages thumbImages images image
          }
        }`,
        variables: { id },
      }),
      next: { revalidate: 60 },
    });
    const auction = (await res.json())?.data?.getAuction;
    if (!auction) return {};

    const title = [auction.title, auction.grade].filter(Boolean).join(" · ");
    const description = auction.ended
      ? `Sold at auction${auction.price ? ` for ${auction.price}` : ""}. ${auction.subtitle || "Premium Pokémon collectible"} at Revolution Auction House.`
      : `Live auction — current bid ${auction.price || "$0"} (${auction.bids || 0} bids). ${auction.subtitle || "Premium Pokémon collectible"}. Bid now at Revolution Auction House.`;
    const image = cdnUrl(
      auction.mediumImages?.[0] ||
        auction.images?.[0] ||
        auction.image ||
        auction.thumbImages?.[0],
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
  return <AuctionDetailClient />;
}
