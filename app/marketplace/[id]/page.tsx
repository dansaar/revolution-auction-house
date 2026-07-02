"use client";

import "@/lib/amplifyclient";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";
import { cdnUrl } from "@/lib/cdn";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getCurrentUser, fetchAuthSession } from "aws-amplify/auth";
import { updateBuyerPresence } from "@/lib/updateBuyerPresence";
import { moneyToNumber } from "@/lib/money";
import { addToCart, isInCart } from "@/lib/cart";
import { toast } from "sonner";
import { confirmDialog } from "@/lib/confirm";
import { MARKETPLACE_PUBLIC_FIELDS } from "@/lib/marketplaceSelection";

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
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [listing, setListing] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [offerAmount, setOfferAmount] = useState("");
  const [submittingOffer, setSubmittingOffer] = useState(false);
  const [inCart, setInCart] = useState(false);

  const [images, setImages] = useState<string[]>([]);
  const [selectedImage, setSelectedImage] = useState("");
  const [fullscreen, setFullscreen] = useState(false);

  function goNext() {
    const i = images.indexOf(selectedImage);
    if (i < images.length - 1) setSelectedImage(images[i + 1]);
  }
  function goPrev() {
    const i = images.indexOf(selectedImage);
    if (i > 0) setSelectedImage(images[i - 1]);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") goNext();
      else if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "Escape" && fullscreen) setFullscreen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedImage, images, fullscreen]);

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
            selectionSet: MARKETPLACE_PUBLIC_FIELDS,
          } as any,
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

  // Reflect whether this listing is already in the local cart. Must stay above
  // the early returns below so hook order is stable (React error #310).
  useEffect(() => {
    if (id) setInCart(isInCart(String(id)));
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
      toast.error("Sellers and admins cannot make offers on marketplace listings.");
      return;
    }

    let currentUser;
    try {
      currentUser = await getCurrentUser();
    } catch {
      router.push("/signin");
      return;
    }

    const buyerEmail = (
      currentUser.signInDetails?.loginId || currentUser.username || ""
    ).toLowerCase();

    if (!buyerEmail) {
      router.push("/signin");
      return;
    }

    try {
      if (!offerAmount) {
        toast.error("Enter an offer amount");
        return;
      }

      const parsedAmount = moneyToNumber(offerAmount);
      if (!parsedAmount || parsedAmount <= 0) {
        toast.error("Enter a valid offer amount");
        return;
      }

      if (!listing.sellerUserId) {
        toast.error("This listing cannot accept offers at this time. Please contact support.");
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

      toast.success("Offer submitted! The seller will review your offer and respond.");
      setOfferAmount("");
    } catch (err) {
      console.error(err);
      toast.error("Failed to submit offer");
    } finally {
      setSubmittingOffer(false);
    }
  }

  function handleAddToCart() {
    if (isSeller || isAdmin) {
      toast.error("Sellers and admins cannot purchase marketplace listings.");
      return;
    }
    const rawImage =
      listing.thumbImages?.[0] || listing.images?.[0] || listing.image || "";
    const added = addToCart({
      id: String(id),
      type: "MARKETPLACE",
      title: listing.title || "Marketplace Listing",
      amount: listing.price || "$0",
      image: cdnUrl(rawImage),
      chargeTax: Boolean(listing.chargeTax),
      taxRate: Number(listing.taxRate || 6.625),
    });
    setInCart(true);
    toast[added ? "success" : "message"](
      added ? "Added to cart" : "Already in your cart",
      { action: { label: "View cart", onClick: () => { router.push("/cart"); } } },
    );
  }

  async function handleBuyNow() {
    if (isSeller || isAdmin) {
      toast.error("Sellers and admins cannot purchase marketplace listings.");
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
      router.push("/signin");
      return;
    }

    try {
      const confirmed = await confirmDialog({ message: "Buy this item now?", confirmText: "Buy Now" });
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
        toast.error(data.error || "Checkout failed");
      }
    } catch (err) {
      console.error("BUY NOW CHECKOUT ERROR", err);
      toast.error("Checkout failed. Check console.");
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
            <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#181818]">
              <button
                type="button"
                onClick={() => setFullscreen(true)}
                className="block w-full p-4"
              >
                <img
                  loading="eager"
                  src={selectedImage || "/logo.png"}
                  alt={listing.title}
                  onError={(e) => { e.currentTarget.src = "/logo.png"; }}
                  className="h-[280px] w-full object-contain sm:h-[360px] md:h-[500px] lg:h-[600px]"
                />
              </button>

              {images.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={goPrev}
                    disabled={images.indexOf(selectedImage) === 0}
                    className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full border border-white/20 bg-black/60 p-2 opacity-0 transition hover:bg-black/80 group-hover:opacity-100 disabled:opacity-0"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <button
                    type="button"
                    onClick={goNext}
                    disabled={images.indexOf(selectedImage) === images.length - 1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-white/20 bg-black/60 p-2 opacity-0 transition hover:bg-black/80 group-hover:opacity-100 disabled:opacity-0"
                  >
                    <ChevronRight size={20} />
                  </button>
                </>
              )}

              <div className="pointer-events-none absolute bottom-3 right-3 rounded bg-black/70 px-3 py-1 text-xs text-[#c0c0c0] opacity-0 transition group-hover:opacity-100">
                {images.length > 1
                  ? `${images.indexOf(selectedImage) + 1} / ${images.length} · Click to fullscreen`
                  : "Click to fullscreen"}
              </div>
            </div>

            {images.length > 1 && (
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1 md:mt-4">
                {images.map((src, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSelectedImage(src)}
                    className={`shrink-0 overflow-hidden rounded border ${
                      selectedImage === src
                        ? "border-[#c0c0c0]"
                        : "border-white/10 opacity-60 hover:opacity-100"
                    }`}
                  >
                    <img
                      loading="lazy"
                      src={src}
                      alt={`${listing.title} ${i + 1}`}
                      onError={(e) => { e.currentTarget.src = "/logo.png"; }}
                      className="h-16 w-16 object-contain bg-[#181818] md:h-20 md:w-20"
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
                listing.status === "OFFER_ACCEPTED" ||
                listing.status === "PENDING_PAYMENT"
              }
              className="mt-8 w-full rounded bg-[#c0c0c0] py-4 font-semibold text-black transition hover:bg-white disabled:opacity-50 md:mt-10"
            >
              {isSeller || isAdmin
                ? "Not Available"
                : listing.sold || listing.status === "SOLD"
                  ? "Sold"
                  : listing.status === "PENDING_PAYMENT"
                    ? "Pending Sale"
                    : listing.status === "OFFER_PENDING"
                      ? "Offer Pending"
                      : listing.status === "OFFER_ACCEPTED"
                        ? "Offer Accepted"
                        : "Buy Now"}
            </button>

            {!isSeller &&
              !isAdmin &&
              !listing.sold &&
              listing.status !== "SOLD" &&
              listing.status !== "OFFER_PENDING" &&
              listing.status !== "OFFER_ACCEPTED" &&
              listing.status !== "PENDING_PAYMENT" && (
                <button
                  onClick={handleAddToCart}
                  className="mt-3 w-full rounded border border-[#c0c0c0]/40 bg-transparent py-4 font-semibold text-[#c0c0c0] transition hover:bg-[#c0c0c0]/10"
                >
                  {inCart ? "✓ In Cart" : "Add to Cart"}
                </button>
              )}

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

                <div className="flex justify-between gap-4">
                  <span>Sales tax</span>
                  <span className="text-gray-500">Calculated at checkout</span>
                </div>

                <div className="border-t border-white/10 pt-2">
                  <div className="flex justify-between gap-4 font-semibold">
                    <span className="text-[#e7c77f]">Subtotal</span>
                    <span className="text-[#f0d28c]">
                      {formatCurrency(basePrice)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Sales tax and shipping are calculated at checkout.
                  </p>
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
                      id="offer-amount"
                      name="offer-amount"
                      value={offerAmount}
                      onChange={(e) => setOfferAmount(e.target.value)}
                      onKeyDown={(e) => {
                        if (
                          e.key === "Enter" &&
                          !submittingOffer &&
                          listing.status !== "OFFER_PENDING" &&
                          listing.status !== "OFFER_ACCEPTED"
                        ) {
                          e.preventDefault();
                          handleMakeOffer();
                        }
                      }}
                      inputMode="decimal"
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
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/95 px-6 py-6"
          onClick={() => setFullscreen(false)}
        >
          <button
            type="button"
            onClick={() => setFullscreen(false)}
            className="absolute right-6 top-6 z-10 rounded bg-white/10 px-4 py-2 text-white hover:bg-white/20"
          >
            Close
          </button>

          {images.length > 1 && (
            <div className="absolute bottom-32 right-6 text-xs text-gray-500">
              {images.indexOf(selectedImage) + 1} / {images.length}
            </div>
          )}

          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); goPrev(); }}
                disabled={images.indexOf(selectedImage) === 0}
                className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full border border-white/20 bg-black/60 p-3 hover:bg-black/80 disabled:opacity-20"
              >
                <ChevronLeft size={24} />
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); goNext(); }}
                disabled={images.indexOf(selectedImage) === images.length - 1}
                className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full border border-white/20 bg-black/60 p-3 hover:bg-black/80 disabled:opacity-20"
              >
                <ChevronRight size={24} />
              </button>
            </>
          )}

          <img
            loading="eager"
            src={selectedImage || "/logo.png"}
            alt={listing.title}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[78vh] max-w-[95vw] rounded-lg object-contain"
          />

          {images.length > 1 && (
            <div
              className="mt-5 flex max-w-4xl gap-3 overflow-x-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {images.map((src, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSelectedImage(src)}
                  className={`h-20 w-20 shrink-0 overflow-hidden rounded border ${
                    selectedImage === src
                      ? "border-[#c0c0c0]"
                      : "border-white/20 opacity-60 hover:opacity-100"
                  }`}
                >
                  <img
                    loading="lazy"
                    src={src}
                    alt={`${listing.title} ${i + 1}`}
                    className="h-full w-full object-contain bg-[#181818]"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </main>
  );
}
