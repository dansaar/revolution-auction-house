"use client";

import "@/lib/amplifyclient";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";
import { cdnUrl } from "@/lib/cdn";
import { getCurrentUser, fetchAuthSession } from "aws-amplify/auth";
import { updateBuyerPresence } from "@/lib/updateBuyerPresence";
import { moneyToNumber } from "@/lib/money";

const client = generateClient<Schema>();

function formatCurrency(amount: number) {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function calculateMarketplaceTax(
  amount: number,
  chargeTax: boolean,
  taxRate: number,
) {
  if (!chargeTax) return 0;
  return amount * (taxRate / 100);
}

export default function MarketplaceListingPage() {
  const params = useParams();
  const id = params.id as string;

  const [listing, setListing] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [offerAmount, setOfferAmount] = useState("");
  const [submittingOffer, setSubmittingOffer] = useState(false);

  const [images, setImages] = useState<string[]>([]);
  const [selectedImage, setSelectedImage] = useState("");
  const [fullscreen, setFullscreen] = useState(false);

  const [isSeller, setIsSeller] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    updateBuyerPresence(`/marketplace/${id}`);
  }, [id]);

  useEffect(() => {
    async function loadUser() {
      try {
        await getCurrentUser();
        const session = await fetchAuthSession({ forceRefresh: false });
        const groups = (session.tokens?.idToken?.payload?.["cognito:groups"] as string[]) || [];
        setIsSeller(groups.includes("Seller"));
        setIsAdmin(groups.includes("Admin"));
      } catch {
        // not signed in
      }
    }
    loadUser();
  }, []);

  useEffect(() => {
    if (!id) return;

    const listingUpdateSub = client.models.MarketplaceListing.onUpdate({
      authMode: "apiKey",
    }).subscribe({
      next: (updatedListing: any) => {
        if (String(updatedListing.id) !== String(id)) return;

        setListing((prev: any) => ({
          ...(prev || {}),

          ...updatedListing,
        }));
      },

      error: (e) => console.error("Marketplace listing update sub error:", e),
    });

    return () => {
      listingUpdateSub.unsubscribe();
    };
  }, [id]);

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

  const showAcceptedOfferPrice = Boolean(
    listing?.acceptedOfferAmount &&
    (listing.status === "OFFER_ACCEPTED" ||
      listing.status === "SOLD" ||
      listing.paid ||
      listing.sold),
  );

  const displayPrice = showAcceptedOfferPrice
    ? listing.acceptedOfferAmount
    : listing.price;

  const listingPrice = moneyToNumber(displayPrice || 0);
  const taxRate = Number(listing?.taxRate || 6.625);

  const offerAmountNum = offerAmount ? moneyToNumber(offerAmount) : 0;
  const basePrice = offerAmountNum > 0 ? offerAmountNum : listingPrice;

  const taxAmount = calculateMarketplaceTax(
    basePrice,
    Boolean(listing?.chargeTax),
    taxRate,
  );

  const estimatedTotal = basePrice + taxAmount;

  const sellerPublicId =
    listing.sellerPublicId ||
    (listing.sellerUserId
      ? `RAH-${String(listing.sellerUserId)
          .replace(/[^a-zA-Z0-9]/g, "")
          .slice(0, 10)
          .toUpperCase()}`
      : "");

  async function handleMakeOffer() {
    if (isSeller || isAdmin) {
      alert("Sellers and admins cannot make offers on marketplace listings.");
      return;
    }

    let currentUser;
    try {
      currentUser = await getCurrentUser();
    } catch {
      window.location.href = "/signin";
      return;
    }

    const buyerEmail = (
      currentUser.signInDetails?.loginId || currentUser.username || ""
    ).toLowerCase();

    if (!buyerEmail) {
      window.location.href = "/signin";
      return;
    }

    try {
      if (!offerAmount) {
        alert("Enter an offer amount");
        return;
      }

      const parsedAmount = moneyToNumber(offerAmount);
      if (!parsedAmount || parsedAmount <= 0) {
        alert("Enter a valid offer amount");
        return;
      }

      if (!listing.sellerUserId) {
        alert("This listing cannot accept offers at this time. Please contact support.");
        return;
      }

      setSubmittingOffer(true);

      const amountFormatted = `$${parsedAmount.toLocaleString()}`;

      const offerResult = await client.models.Offer.create(
        {
          listingId: listing.id,

          buyerUserId: currentUser.userId || currentUser.username,
          buyerEmail,
          buyerDisplayName: buyerEmail,

          sellerUserId: listing.sellerUserId,
          sellerEmail: listing.sellerEmail || "",

          amount: amountFormatted,

          status: "PENDING",
        },
        {
          authMode: "userPool",
        } as any,
      );

      if (!offerResult.data || (offerResult.errors && offerResult.errors.length > 0)) {
        const msg = offerResult.errors?.[0]?.message || "Failed to submit offer";
        throw new Error(msg);
      }

      // Optimistically update local state so the page reflects OFFER_PENDING immediately
      setListing((prev: any) => ({ ...prev, status: "OFFER_PENDING" }));

      // Notify seller + update listing status in DynamoDB (fire-and-forget via Lambda with IAM)
      client.mutations.notifySellerOfferSms(
        {
          sellerEmail: listing.sellerEmail || "",
          listingId: listing.id,
          listingTitle: listing.title || "your listing",
          offerAmount: amountFormatted,
        },
        { authMode: "userPool" } as any,
      ).catch(() => {});

      alert("Offer submitted successfully!");
      setOfferAmount("");
    } catch (err) {
      console.error(err);
      alert("Failed to submit offer");
    } finally {
      setSubmittingOffer(false);
    }
  }

  async function handleBuyNow() {
    if (isSeller || isAdmin) {
      alert("Sellers and admins cannot purchase marketplace listings.");
      return;
    }

    let token = "";

    try {
      const session = await fetchAuthSession();
      token = session.tokens?.idToken?.toString() || "";
    } catch {
      // fall through
    }

    if (!token) {
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
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          listingId: id,
          title: listing.title,
          amount: formatCurrency(estimatedTotal),
          subtotal: formatCurrency(listingPrice),
          buyerPremium: "$0.00",
          tax: formatCurrency(taxAmount),
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
    <main className="min-h-screen bg-[#050607] px-4 py-8 text-white md:px-6 md:py-12">
      <div className="mx-auto max-w-7xl">
        <Link
          href="/marketplace"
          className="mb-6 inline-block rounded border border-white/10 px-4 py-2 text-sm uppercase tracking-[0.2em] text-white transition hover:bg-white/[0.04] md:mb-8 md:px-5 md:py-3"
        >
          ← Marketplace
        </Link>

        <div className="grid gap-6 lg:grid-cols-2 lg:gap-8">
          {/* LEFT */}
          <div>
            <button
              type="button"
              onClick={() => setFullscreen(true)}
              className="group relative block w-full overflow-hidden rounded-2xl border border-white/10 bg-black"
            >
              <img
                loading="eager"
                src={selectedImage || "/logo.png"}
                alt={listing.title}
                className="relative z-10 h-[280px] w-full object-contain sm:h-[360px] md:h-[500px] lg:h-[600px]"
              />
              <div className="pointer-events-none absolute bottom-3 right-3 rounded bg-black/70 px-3 py-1 text-xs text-[#c0c0c0] opacity-0 transition group-hover:opacity-100">
                Click to fullscreen
              </div>
            </button>

            {images.length > 1 && (
              <div className="mt-3 grid grid-cols-5 gap-2 sm:grid-cols-6 md:mt-4 md:grid-cols-4 md:gap-3">
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
                      className="h-14 w-full object-cover sm:h-16 md:h-20 lg:h-24"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* RIGHT */}
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-gray-500">
              Marketplace Listing
            </div>

            <h1 className="mt-3 font-serif text-3xl sm:text-4xl md:text-5xl">{listing.title}</h1>

            {listing.subtitle && (
              <div className="mt-2 text-base text-gray-400 sm:text-xl">
                {listing.subtitle}
              </div>
            )}

            <div className="mt-6 md:mt-8">
              <div className="text-xs uppercase tracking-[0.22em] text-gray-500">
                {showAcceptedOfferPrice ? "Accepted Offer Price" : "Price"}
              </div>

              <div className="mt-2 font-serif text-4xl text-[#c0c0c0] sm:text-5xl md:text-6xl">
                {displayPrice}
              </div>
            </div>

            {listing.condition && (
              <div className="mt-5 md:mt-6">
                <div className="text-xs uppercase tracking-[0.2em] text-gray-500">
                  Condition
                </div>

                <div className="mt-2 text-base md:text-lg">{listing.condition}</div>
              </div>
            )}

            {listing.description && (
              <div className="mt-6 md:mt-8">
                <div className="text-xs uppercase tracking-[0.2em] text-gray-500">
                  Description
                </div>

                <div className="mt-3 whitespace-pre-line text-sm text-gray-300 md:text-base">
                  {listing.description}
                </div>
              </div>
            )}

            <button
              onClick={handleBuyNow}
              disabled={
                isSeller ||
                isAdmin ||
                listing.sold ||
                listing.status === "SOLD" ||
                listing.status === "OFFER_PENDING" ||
                listing.status === "OFFER_ACCEPTED"
              }
              className="mt-8 w-full rounded bg-[#c0c0c0] py-4 font-semibold text-black transition hover:bg-white disabled:opacity-50 md:mt-10"
            >
              {isSeller || isAdmin
                ? "Not Available"
                : listing.sold || listing.status === "SOLD"
                  ? "Sold"
                  : listing.status === "OFFER_PENDING"
                    ? "Offer Pending"
                    : listing.status === "OFFER_ACCEPTED"
                      ? "Offer Accepted"
                      : "Buy Now"}
            </button>

            <div className="mt-4 rounded-xl border border-[#d6aa55]/20 bg-[#1a1408]/60 p-4">
              <div className="text-xs uppercase tracking-[0.22em] text-[#b89b61]">
                Estimated Checkout Total
              </div>

              <div className="mt-3 space-y-2 text-sm text-gray-400">
                <div className="flex justify-between gap-4">
                  <span>
                    {offerAmountNum > 0 ? "Offer Amount" : showAcceptedOfferPrice ? "Accepted Offer" : "Item Price"}
                  </span>
                  <span className="text-white">
                    {formatCurrency(basePrice)}
                  </span>
                </div>

                {listing?.chargeTax && (
                  <div className="flex justify-between gap-4">
                    <span>NJ Sales Tax ({taxRate}%)</span>
                    <span className="text-white">
                      {formatCurrency(taxAmount)}
                    </span>
                  </div>
                )}

                <div className="border-t border-white/10 pt-2">
                  <div className="flex justify-between gap-4 font-semibold">
                    <span className="text-[#e7c77f]">Estimated Total</span>
                    <span className="text-[#f0d28c]">
                      {formatCurrency(estimatedTotal)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {!listing.sold && listing.status !== "SOLD" && (
              <div className="mt-4 rounded border border-white/10 bg-white/[0.03] p-4">
                <div className="mb-3 text-xs uppercase tracking-[0.18em] text-gray-500">
                  Make Offer
                </div>

                {isSeller || isAdmin ? (
                  <p className="text-sm text-gray-500">Sellers and admins cannot make offers on marketplace listings.</p>
                ) : (
                  <div className="flex flex-col gap-3 sm:flex-row">
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
                        listing.status === "OFFER_PENDING" ||
                        listing.status === "OFFER_ACCEPTED"
                      }
                      className="rounded border border-white/10 bg-white/[0.05] px-6 py-3 font-semibold text-white transition hover:bg-white/[0.08] disabled:opacity-50"
                    >
                      {submittingOffer ? "Sending..." : "Submit"}
                    </button>
                  </div>
                )}
              </div>
            )}

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
