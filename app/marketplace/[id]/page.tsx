"use client";

import "@/lib/amplifyclient";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";
import { cdnUrl } from "@/lib/cdn";
import { getCurrentUser } from "aws-amplify/auth";
import { updateBuyerPresence } from "@/lib/updateBuyerPresence";

const client = generateClient<Schema>();

export default function MarketplaceListingPage() {
  const params = useParams();
  const id = params.id as string;

  useEffect(() => {
    updateBuyerPresence(`/marketplace/${id}`);
  }, [id]);

  const [listing, setListing] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [offerAmount, setOfferAmount] = useState("");
  const [submittingOffer, setSubmittingOffer] = useState(false);

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

  const sellerPublicId =
    listing.sellerPublicId ||
    (listing.sellerUserId
      ? `RAH-${String(listing.sellerUserId)
          .replace(/[^a-zA-Z0-9]/g, "")
          .slice(0, 10)
          .toUpperCase()}`
      : "");

  async function handleMakeOffer() {
    try {
      const currentUser = await getCurrentUser();

      const buyerEmail =
        currentUser.signInDetails?.loginId || currentUser.username || "";

      if (!buyerEmail) {
        window.location.href = "/signin";
        return;
      }

      if (!offerAmount) {
        alert("Enter an offer amount");
        return;
      }

      setSubmittingOffer(true);

      await client.models.Offer.create(
        {
          listingId: listing.id,

          buyerUserId: currentUser.userId || currentUser.username,
          buyerEmail,
          buyerDisplayName: buyerEmail,

          sellerUserId: listing.sellerEmail || "",
          sellerEmail: listing.sellerEmail || "",

          amount: `$${Number(offerAmount).toLocaleString()}`,

          status: "PENDING",
        },
        {
          authMode: "userPool",
        } as any,
      );

      await client.models.MarketplaceListing.update(
        {
          id: listing.id,
          status: "OFFER_PENDING",
        },
        { authMode: "apiKey" } as any,
      );

      setListing((prev: any) => ({
        ...prev,
        status: "OFFER_PENDING",
      }));

      alert("Offer submitted");
      setOfferAmount("");
    } catch (err) {
      console.error(err);
      alert("Failed to submit offer");
    } finally {
      setSubmittingOffer(false);
    }
  }

  async function handleBuyNow() {
    let buyerEmail = "";

    try {
      const currentUser = await getCurrentUser();

      buyerEmail =
        currentUser.signInDetails?.loginId || currentUser.username || "";
    } catch {
      window.location.href = "/signin";
      return;
    }

    try {
      const confirmed = confirm("Buy this item now?");
      if (!confirmed) return;

      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          listingId: id,
          title: listing.title,
          amount: listing.price,
          buyerEmail,
        }),
      });

      const data = await res.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || "Checkout failed");
      }
    } catch (err) {
      console.error("BUY NOW CHECKOUT ERROR", err);
      alert("Checkout failed. Check console.");
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

        <div className="grid gap-8 lg:grid-cols-2">
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
                className="relative z-10 h-[320px] w-full object-contain md:h-[600px]"
              />
              <div className="pointer-events-none absolute bottom-3 right-3 rounded bg-black/70 px-3 py-1 text-xs text-[#c0c0c0] opacity-0 transition group-hover:opacity-100">
                Click to fullscreen
              </div>
            </button>

            <div className="mt-4 grid grid-cols-4 gap-2 md:gap-3">
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
                    className="h-16 w-full object-cover md:h-24"
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
              disabled={
                listing.sold ||
                listing.status === "SOLD" ||
                listing.status === "OFFER_PENDING" ||
                listing.status === "OFFER_ACCEPTED"
              }
              className="mt-10 w-full rounded bg-[#c0c0c0] py-4 font-semibold text-black transition hover:bg-white disabled:opacity-50"
            >
              {listing.sold || listing.status === "SOLD"
                ? "Sold"
                : listing.status === "OFFER_PENDING"
                  ? "Offer Pending"
                  : listing.status === "OFFER_ACCEPTED"
                    ? "Offer Accepted"
                    : "Buy Now"}
            </button>

            <div className="mt-4 rounded border border-white/10 bg-white/[0.03] p-4">
              <div className="mb-3 text-xs uppercase tracking-[0.18em] text-gray-500">
                Make Offer
              </div>

              <div className="flex gap-3">
                <input
                  value={offerAmount}
                  onChange={(e) => setOfferAmount(e.target.value)}
                  placeholder="Offer Amount"
                  className="flex-1 rounded border border-white/10 bg-black px-4 py-3 text-white"
                />

                <button
                  onClick={handleMakeOffer}
                  disabled={
                    submittingOffer ||
                    listing.sold ||
                    listing.status === "SOLD" ||
                    listing.status === "OFFER_PENDING" ||
                    listing.status === "OFFER_ACCEPTED"
                  }
                  className="rounded border border-white/10 bg-white/[0.05] px-6 py-3 font-semibold text-white transition hover:bg-white/[0.08] disabled:opacity-50"
                >
                  {submittingOffer ? "Sending..." : "Submit"}
                </button>
              </div>
            </div>

            {sellerPublicId && (
              <div className="mt-8 border-t border-white/10 pt-5">
                <div className="text-xs uppercase tracking-[0.25em] text-gray-500">
                  Seller ID
                </div>

                <div className="mt-2 font-serif text-xl text-[#e7c77f]">
                  {sellerPublicId}
                </div>
              </div>
            )}
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
