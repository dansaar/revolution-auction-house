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

  if (!rawImage || rawImage === "undefined") {
    return "/logo.png";
  }

  if (rawImage.startsWith("http") || rawImage.startsWith("/")) {
    return rawImage;
  }

  return cdnUrl(rawImage);
}

export default function MarketplacePage() {
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadListings() {
      try {
        const result = await client.models.MarketplaceListing.list({
          filter: {
            status: { eq: "ACTIVE" },
          },
          authMode: "apiKey",
        } as any);

        const withImages = (result.data || []).map((listing: any) => ({
          ...listing,
          imageUrl: resolveImage(listing),
        }));

        console.log("MARKETPLACE LISTINGS", withImages);

        setListings(withImages);
      } catch (err) {
        console.error("MARKETPLACE LOAD ERROR", err);
      } finally {
        setLoading(false);
      }
    }

    loadListings();
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#050607] px-6 py-12 text-white">
        <div className="mx-auto max-w-7xl">
          <div className="mb-10 h-16 w-80 animate-pulse rounded bg-white/[0.06]" />

          <div className="grid gap-6 md:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((item) => (
              <div
                key={item}
                className="h-[420px] animate-pulse rounded-2xl border border-white/10 bg-white/[0.04]"
              />
            ))}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050607] px-6 py-12 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mb-10 flex items-center justify-between border-b border-white/10 pb-8">
          <div className="flex items-center gap-6">
            <img
              src="/logo.png"
              alt="Revolution"
              className="h-40 w-auto object-contain"
            />

            <h1 className="font-serif text-5xl">Marketplace</h1>
          </div>
        </div>

        {listings.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-10 text-gray-400">
            No listings found.
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-3">
            {listings.map((listing) => (
              <Link
                key={listing.id}
                href={`/marketplace/${listing.id}`}
                className="group overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] transition hover:border-[#c0c0c0]/50"
              >
                <div className="relative h-72 bg-black">
                  <div className="absolute inset-0 animate-pulse bg-white/[0.04]" />

                  <img
                    loading="lazy"
                    src={listing.imageUrl || "/logo.png"}
                    alt={listing.title}
                    className="relative z-10 h-full w-full object-contain transition duration-500 group-hover:scale-105"
                  />
                </div>

                <div className="p-5">
                  <div className="text-xs uppercase tracking-[0.2em] text-gray-500">
                    {listing.condition || "Marketplace"}
                  </div>

                  <h2 className="mt-2 font-serif text-2xl">{listing.title}</h2>

                  {listing.subtitle && (
                    <p className="mt-1 text-sm text-gray-400">
                      {listing.subtitle}
                    </p>
                  )}

                  <div className="mt-4 font-serif text-3xl text-[#c0c0c0]">
                    {listing.price}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
