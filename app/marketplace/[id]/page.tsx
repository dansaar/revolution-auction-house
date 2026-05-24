"use client";

import "@/lib/amplifyclient";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";
import { cdnUrl } from "@/lib/cdn";
import { getCurrentUser } from "aws-amplify/auth";

const client = generateClient<Schema>();

export default function MarketplaceListingPage() {
  const params = useParams();
  const id = params.id as string;

  const [listing, setListing] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [images, setImages] = useState<string[]>([]);
  const [selectedImage, setSelectedImage] = useState("");
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    async function loadListing() {
      try {
        const result = await client.models.MarketplaceListing.get(
          { id },
          {
            authMode: "apiKey",
          },
        );

        if (!result.data) {
          setLoading(false);
          return;
        }

        setListing(result.data);

        const rawImages = result.data.mediumImages?.length
          ? result.data.mediumImages
          : result.data.images?.length
            ? result.data.images
            : result.data.image
              ? [result.data.image]
              : [];

        const resolved = rawImages.map((path: string | null | undefined) =>
          cdnUrl(path),
        );

        setImages(resolved);

        if (resolved.length > 0) {
          setSelectedImage(resolved[0]);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    loadListing();
  }, [id]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#050607] p-10 text-white">
        Loading...
      </main>
    );
  }

  if (!listing) {
    return (
      <main className="min-h-screen bg-[#050607] p-10 text-white">
        Listing not found
      </main>
    );
  }

  async function handleBuyNow() {
    try {
      await getCurrentUser();

      const confirmed = confirm("Buy this item now?");
      if (!confirmed) return;

      await client.models.MarketplaceListing.update(
        {
          id,
          sold: true,
          status: "SOLD",
        },
        { authMode: "userPool" } as any,
      );

      alert("Purchase recorded.");
      window.location.href = "/dashboard";
    } catch (err) {
      console.error(err);
      window.location.href = "/signin";
    }
  }

  return (
    <main className="min-h-screen bg-[#050607] px-6 py-12 text-white">
      <div className="mx-auto max-w-7xl">
        <Link
          href="/marketplace"
          className="mb-8 inline-block rounded border border-white/10 px-5 py-3 text-sm uppercase tracking-[0.2em] text-white transition hover:bg-white/[0.04]"
        >
          ← Marketplace
        </Link>

        <div className="grid gap-10 lg:grid-cols-2">
          {/* LEFT */}
          <div>
            <button
              type="button"
              onClick={() => setFullscreen(true)}
              className="group relative block overflow-hidden rounded-2xl border border-white/10 bg-black"
            >
              <img
                loading="eager"
                src={selectedImage || "/logo.png"}
                alt={listing.title}
                className="relative z-10 h-[600px] w-full object-contain"
              />
              <div className="pointer-events-none absolute bottom-3 right-3 rounded bg-black/70 px-3 py-1 text-xs text-[#c0c0c0] opacity-0 transition group-hover:opacity-100">
                Click to fullscreen
              </div>
            </button>

            <div className="mt-4 grid grid-cols-4 gap-3">
              {images.map((src, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSelectedImage(src)}
                  className={`overflow-hidden rounded border ${
                    selectedImage === src
                      ? "border-[#c0c0c0]"
                      : "border-white/10"
                  }`}
                >
                  <img
                    loading="lazy"
                    src={src}
                    alt={`${listing.title} ${i + 1}`}
                    className="h-24 w-full object-cover"
                  />
                </button>
              ))}
            </div>
          </div>

          {/* RIGHT */}
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-gray-500">
              Marketplace Listing
            </div>

            <h1 className="mt-4 font-serif text-5xl">{listing.title}</h1>

            {listing.subtitle && (
              <div className="mt-3 text-xl text-gray-400">
                {listing.subtitle}
              </div>
            )}

            <div className="mt-8 font-serif text-6xl text-[#c0c0c0]">
              {listing.price}
            </div>

            {listing.condition && (
              <div className="mt-6">
                <div className="text-xs uppercase tracking-[0.2em] text-gray-500">
                  Condition
                </div>

                <div className="mt-2 text-lg">{listing.condition}</div>
              </div>
            )}

            {listing.description && (
              <div className="mt-8">
                <div className="text-xs uppercase tracking-[0.2em] text-gray-500">
                  Description
                </div>

                <div className="mt-3 whitespace-pre-line text-gray-300">
                  {listing.description}
                </div>
              </div>
            )}

            <button
              onClick={handleBuyNow}
              disabled={listing.sold || listing.status === "SOLD"}
              className="mt-10 w-full rounded bg-[#c0c0c0] py-4 font-semibold text-black transition hover:bg-white disabled:opacity-50"
            >
              {listing.sold || listing.status === "SOLD" ? "Sold" : "Buy Now"}
            </button>

            <button className="mt-4 w-full rounded border border-white/10 bg-white/[0.03] py-4 font-semibold text-white transition hover:bg-white/[0.06]">
              Make Offer
            </button>
          </div>
        </div>
      </div>

      {fullscreen && (
        <div className="fixed inset-0 z-50 bg-black/95 px-6 py-6">
          <button
            type="button"
            onClick={() => setFullscreen(false)}
            className="absolute right-6 top-6 z-10 rounded bg-white/10 px-4 py-2 text-white hover:bg-white/20"
          >
            Close
          </button>

          <div className="flex h-full flex-col items-center justify-center">
            <img
              loading="eager"
              src={selectedImage || "/logo.png"}
              alt={listing.title}
              className="max-h-[78vh] max-w-[95vw] rounded-lg object-contain transition duration-500 hover:scale-110"
            />

            <div className="mt-5 flex max-w-4xl gap-3 overflow-x-auto">
              {images.map((src, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSelectedImage(src)}
                  className={`h-20 w-20 shrink-0 overflow-hidden rounded border ${
                    selectedImage === src
                      ? "border-[#c0c0c0]"
                      : "border-white/20 opacity-60"
                  }`}
                >
                  <img
                    loading="lazy"
                    src={src}
                    alt={`${listing.title} ${i + 1}`}
                    className="h-full w-full object-contain bg-black"
                  />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
