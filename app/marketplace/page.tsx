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

  async function loadListings() {
    try {
      const result = await client.models.MarketplaceListing.list({
        authMode: "apiKey",
        limit: 1000,
      } as any);

      const activeListings = (result.data || []).filter((listing: any) => {
        return (
          listing.sold !== true &&
          listing.paid !== true &&
          (listing.status === "ACTIVE" ||
            listing.status === "OFFER_PENDING" ||
            !listing.status)
        );
      });

      const withImages = activeListings.map((listing: any) => ({
        ...listing,
        imageUrl: resolveImage(listing),
      }));

      console.log("MARKETPLACE ACTIVE LISTINGS", withImages);

      setListings(withImages);
    } catch (err) {
      console.error("MARKETPLACE LOAD ERROR", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadListings();

    const listingUpdateSub = client.models.MarketplaceListing.onUpdate({
      authMode: "apiKey",
    }).subscribe({
      next: () => loadListings(),
      error: (e) => console.error("Marketplace listing update sub error:", e),
    });

    const listingCreateSub = client.models.MarketplaceListing.onCreate({
      authMode: "apiKey",
    }).subscribe({
      next: () => loadListings(),
      error: (e) => console.error("Marketplace listing create sub error:", e),
    });

    return () => {
      listingUpdateSub.unsubscribe();
      listingCreateSub.unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#050607] px-4 py-8 text-white md:px-6 md:py-12">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8 h-16 w-64 animate-pulse rounded bg-white/[0.06] md:w-80" />

          <div className="grid gap-4 sm:grid-cols-2 md:gap-6 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((item) => (
              <div
                key={item}
                className="h-[360px] animate-pulse rounded-2xl border border-white/10 bg-white/[0.04] md:h-[420px]"
              />
            ))}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050607] px-4 py-8 text-white md:px-6 md:py-12">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col items-start gap-3 border-b border-white/10 pb-6 sm:flex-row sm:items-center sm:gap-6 md:mb-10 md:pb-8">
          <img
            src="/logo.png"
            alt="Revolution"
            className="h-20 w-auto object-contain sm:h-28 md:h-40"
          />
          <div className="flex flex-1 items-center justify-between">
            <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl">Marketplace</h1>
            <Link
              href="/marketplace/results"
              className="text-sm text-gray-500 hover:text-white"
            >
              Sold Results →
            </Link>
          </div>
        </div>

        {listings.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-8 text-gray-400 md:p-10">
            No listings found.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 md:gap-6 lg:grid-cols-3">
            {listings.map((listing) => (
              <Link
                key={listing.id}
                href={`/marketplace/${listing.id}`}
                className="group overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] transition hover:border-[#c0c0c0]/50"
              >
                <div className="relative h-56 bg-black sm:h-64 md:h-72">
                  <div className="absolute inset-0 animate-pulse bg-white/[0.04]" />

                  <img
                    loading="lazy"
                    src={listing.imageUrl || "/logo.png"}
                    alt={listing.title}
                    onError={(e) => {
                      e.currentTarget.src = "/logo.png";
                    }}
                    className="relative z-10 h-full w-full object-contain transition duration-500 group-hover:scale-105"
                  />
                </div>

                <div className="p-4 md:p-5">
                  <div className="text-xs uppercase tracking-[0.2em] text-gray-500">
                    {listing.condition || "Marketplace"}
                  </div>

                  {listing.status === "OFFER_PENDING" && (
                    <div className="mt-2 inline-flex rounded bg-yellow-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-yellow-300">
                      Offer Pending
                    </div>
                  )}

                  <h2 className="mt-2 font-serif text-xl md:text-2xl">{listing.title}</h2>

                  {listing.subtitle && (
                    <p className="mt-1 text-sm text-gray-400">
                      {listing.subtitle}
                    </p>
                  )}

                  <div className="mt-3 font-serif text-2xl text-[#c0c0c0] md:mt-4 md:text-3xl">
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
