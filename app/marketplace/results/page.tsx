"use client";

import "@/lib/amplifyclient";

import { useEffect, useState } from "react";
import Link from "next/link";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";
import { cdnUrl } from "@/lib/cdn";

const client = generateClient<Schema>();

function resolveImage(listing: any) {
  const rawImage =
    listing.thumbImages?.[0] || listing.image || listing.images?.[0] || "";
  if (!rawImage || rawImage === "undefined") return "/logo.png";
  if (rawImage.startsWith("http") || rawImage.startsWith("/")) return rawImage;
  return cdnUrl(rawImage);
}

export default function MarketplaceResultsPage() {
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const result = await client.models.MarketplaceListing.list({
          authMode: "apiKey",
          limit: 1000,
        } as any);

        const sold = (result.data || [])
          .filter((l: any) => l.sold === true || l.paid === true)
          .sort(
            (a: any, b: any) =>
              new Date(b.paidAt || b.updatedAt || b.createdAt || 0).getTime() -
              new Date(a.paidAt || a.updatedAt || a.createdAt || 0).getTime(),
          )
          .map((l: any) => ({ ...l, imageUrl: resolveImage(l) }));

        setListings(sold);
      } catch (err) {
        console.error("MARKETPLACE RESULTS ERROR", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#050607] p-10 text-white">
        Loading results...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050607] px-6 py-12 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-serif text-5xl text-[#c0c0c0]">
              Marketplace Results
            </h1>
            <p className="mt-3 text-gray-400">
              Sold listings and completed private sales.
            </p>
          </div>

          <Link
            href="/marketplace"
            className="text-sm text-gray-500 hover:text-white"
          >
            ← Active Listings
          </Link>
        </div>

        {listings.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-10 text-gray-500">
            No completed sales yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
            {listings.map((listing: any) => {
              const finalPrice =
                listing.acceptedOfferAmount || listing.price || "—";
              const soldDate = listing.paidAt || listing.updatedAt;

              return (
                <Link
                  key={listing.id}
                  href={`/marketplace/${listing.id}`}
                  className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] transition hover:border-[#c0c0c0]/40 hover:shadow-[0_0_40px_rgba(192,192,192,0.10)]"
                >
                  <div className="relative h-56 bg-black sm:h-72">
                    <img
                      loading="lazy"
                      src={listing.imageUrl}
                      alt={listing.title}
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = "/logo.png";
                      }}
                      className="h-full w-full bg-black object-contain grayscale"
                    />
                    <div className="absolute left-3 top-3 rounded bg-black/80 px-3 py-1 text-xs uppercase tracking-[0.18em] text-[#c0c0c0]">
                      Sold
                    </div>
                  </div>

                  <div className="p-5">
                    <h2 className="font-serif text-xl sm:text-2xl">
                      {listing.title}
                    </h2>

                    {listing.subtitle && (
                      <p className="mt-2 text-sm text-gray-400">
                        {listing.subtitle}
                      </p>
                    )}

                    <div className="mt-5">
                      <div className="text-xs uppercase tracking-[0.18em] text-gray-500">
                        Sale Price
                      </div>
                      <div className="mt-1 font-serif text-3xl text-[#c0c0c0]">
                        {finalPrice}
                      </div>
                    </div>

                    {soldDate && (
                      <div className="mt-4 border-t border-white/10 pt-4 text-xs text-gray-500">
                        Sold {new Date(soldDate).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
