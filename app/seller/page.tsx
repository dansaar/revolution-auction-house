"use client";

import "@/lib/amplifyclient";

import React, { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, fetchAuthSession } from "aws-amplify/auth";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";
import { cdnUrl } from "@/lib/cdn";
import { moneyToNumber } from "@/lib/money";
import { isAdminUser } from "@/lib/sellers";
import { Gavel, Tag, Archive, BarChart2, Clock, ShieldCheck, TrendingUp } from "lucide-react";
import { toast } from "sonner";

// Print a shipping label robustly. EasyPost labels are usually PNG; print-js
// with the wrong type (or a cross-origin PDF that blocks CORS) fails silently,
// leaving the button in place with no feedback. Detect the type, and if
// auto-print fails, fall back to opening the label in a new tab.
async function printLabel(url?: string | null) {
  if (!url) {
    toast.error("No label file available.");
    return;
  }

  const path = url.toLowerCase().split("?")[0];
  const isPdf = path.endsWith(".pdf");

  const openInTab = () => {
    window.open(url, "_blank", "noopener,noreferrer");
    toast.message("Opened the label in a new tab — use your browser to print.");
  };

  try {
    const pjs = (await import("print-js")).default;
    pjs({
      printable: url,
      type: isPdf ? "pdf" : "image",
      showModal: true,
      onError: openInTab,
    } as any);
    toast.success("Opening print dialog…");
  } catch {
    openInTab();
  }
}

function trackingUrl(carrier: string, trackingNumber: string) {
  const c = carrier.toLowerCase();

  if (c.includes("ups")) {
    return `https://www.ups.com/track?tracknum=${trackingNumber}`;
  }

  if (c.includes("fedex")) {
    return `https://www.fedex.com/fedextrack/?trknbr=${trackingNumber}`;
  }

  if (c.includes("usps")) {
    return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${trackingNumber}`;
  }

  return "";
}

export default function SellerPageWrapper() {
  return (
    <Suspense>
      <SellerPage />
    </Suspense>
  );
}

function SellerPage() {
  const clientRef = React.useRef(generateClient<Schema>());
  const client = clientRef.current;
  const [auctions, setAuctions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sellerEmail, setSellerEmail] = useState("");
  const [sellerUserId, setSellerUserId] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<"auctions" | "marketplace">(
    searchParams?.get("tab") === "marketplace" ? "marketplace" : "auctions",
  );

  const [marketplaceListings, setMarketplaceListings] = useState<any[]>([]);

  const [invoices, setInvoices] = useState<any[]>([]);

  const [offers, setOffers] = useState<any[]>([]);
  const [buyerRequests, setBuyerRequests] = useState<any[]>([]);
  const [buyerProfiles, setBuyerProfiles] = useState<any[]>([]);
  const [savedShipFrom, setSavedShipFrom] = useState<{ name: string; street1: string; street2: string; city: string; state: string; zip: string; phone: string } | null>(null);

  const refreshTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  useEffect(() => {
    async function loadSellerAuctions() {
      // Fetch public data (apiKey) independently so a userPool auth failure
      // can't prevent the main auction/listing content from loading.
      const [listingResult, auctionResult] = await Promise.all([
        client.models.MarketplaceListing.list({ authMode: "apiKey", limit: 1000 } as any).catch(() => ({ data: [] })),
        client.models.Auction.list({ authMode: "apiKey", limit: 1000 } as any).catch(() => ({ data: [] })),
      ]);

      const resolvedListings = (listingResult.data || []).map((listing: any) => ({
        ...listing,
        image: cdnUrl(listing.thumbImages?.[0] || listing.image || listing.images?.[0] || ""),
      }));
      setMarketplaceListings(resolvedListings);

      const sorted = [...(auctionResult.data || [])].sort(
        (a: any, b: any) => new Date(b.endsAt || 0).getTime() - new Date(a.endsAt || 0).getTime(),
      );
      const resolved = sorted.map((auction: any) => ({
        ...auction,
        image: cdnUrl(auction.thumbImages?.[0] || auction.images?.[0] || auction.image || ""),
      }));
      setAuctions(resolved);

      // Fetch user-specific data (userPool) separately — failures here won't
      // blank out the auctions/listings already loaded above.
      try {
        const user = await getCurrentUser();

        const email = user.signInDetails?.loginId || user.username || "";
        const userId = user.userId || user.username || "";

        setSellerEmail(email);
        setSellerUserId(userId);
        setIsAdmin(await isAdminUser());

        // Load saved ship-from address
        try {
          const spResult = await client.models.SellerProfile.get({ email }, { authMode: "userPool" } as any);
          const sp = spResult.data as any;
          if (sp?.shipFromStreet1) {
            setSavedShipFrom({
              name: sp.shipFromName || "",
              street1: sp.shipFromStreet1 || "",
              street2: sp.shipFromStreet2 || "",
              city: sp.shipFromCity || "",
              state: sp.shipFromState || "",
              zip: sp.shipFromZip || "",
              phone: sp.shipFromPhone || "",
            });
          }
        } catch { /* non-fatal */ }

        const session = await fetchAuthSession({ forceRefresh: false });
        const sellerSub = (session.tokens?.idToken?.payload?.sub as string) || userId;

        const [invoiceResult, offerResult, buyerRequestResult, buyerProfileResult] = await Promise.allSettled([
          (client.models.Invoice as any).invoicesBySellerEmail(
            { sellerEmail: email },
            { authMode: "userPool", limit: 500 },
          ),
          client.models.Offer.list({
            filter: { sellerUserId: { eq: sellerSub } },
            authMode: "userPool",
          } as any),
          client.models.BuyerProfile.list({
            filter: { status: { eq: "PENDING_REVIEW" } },
            authMode: "userPool",
          } as any),
          client.models.BuyerProfile.list({
            authMode: "userPool",
            limit: 1000,
          } as any),
        ]);

        if (invoiceResult.status === "fulfilled") {
          if (invoiceResult.value.errors) console.error("Invoice query errors:", invoiceResult.value.errors);
          setInvoices(invoiceResult.value.data || []);
        }
        if (offerResult.status === "fulfilled") setOffers(offerResult.value.data || []);
        if (buyerRequestResult.status === "fulfilled") setBuyerRequests(buyerRequestResult.value.data || []);
        if (buyerProfileResult.status === "fulfilled") setBuyerProfiles(buyerProfileResult.value.data || []);
      } catch (err) {
        console.error("Seller user-specific data error:", err);
      }

      setLoading(false);
    }

    loadSellerAuctions();

    function scheduleSellerRefresh() {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }

      refreshTimerRef.current = setTimeout(() => {
        loadSellerAuctions();
      }, 750);
    }

    const bidSub = client.models.Bid.onCreate({
      authMode: "apiKey",
    }).subscribe({
      next: () => {
        scheduleSellerRefresh();
      },
      error: (error) => console.error("Seller bid subscription error:", error),
    });

    const auctionSub = client.models.Auction.onUpdate({
      authMode: "apiKey",
    }).subscribe({
      next: () => {
        scheduleSellerRefresh();
      },
      error: (error) =>
        console.error("Seller auction subscription error:", error),
    });

    const offerCreateSub = client.models.Offer.onCreate({
      authMode: "userPool",
    }).subscribe({
      next: () => {
        scheduleSellerRefresh();
      },
      error: (error) =>
        console.error("Seller offer create subscription error:", error),
    });

    const offerUpdateSub = client.models.Offer.onUpdate({
      authMode: "userPool",
    }).subscribe({
      next: () => {
        scheduleSellerRefresh();
      },
      error: (error) =>
        console.error("Seller offer update subscription error:", error),
    });

    const listingUpdateSub = client.models.MarketplaceListing.onUpdate({
      authMode: "apiKey",
    }).subscribe({
      next: () => {
        scheduleSellerRefresh();
      },
      error: (error) =>
        console.error("Seller marketplace listing subscription error:", error),
    });

    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }

      bidSub.unsubscribe();
      auctionSub.unsubscribe();
      offerCreateSub.unsubscribe();
      offerUpdateSub.unsubscribe();
      listingUpdateSub.unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#050607] p-10 text-white">
        Loading seller dashboard...
      </main>
    );
  }

  const scheduledAuctions = auctions.filter(
    (a) => a.status === "SCHEDULED" && a.startsAt && new Date(a.startsAt).getTime() > Date.now(),
  );

  const liveAuctions = auctions.filter(
    (a) =>
      (!a.endsAt || new Date(a.endsAt).getTime() > Date.now()) &&
      !(a.status === "SCHEDULED" && a.startsAt && new Date(a.startsAt).getTime() > Date.now()),
  );

  const allEndedAuctions = auctions.filter(
    (a) => a.endsAt && new Date(a.endsAt).getTime() <= Date.now(),
  );

  const endedAuctions = allEndedAuctions.filter(
    (a) =>
      a.winnerUserId &&
      (!a.reservePrice ||
        moneyToNumber(a.price || 0) >= moneyToNumber(a.reservePrice || 0)),
  );

  const endingSoon = liveAuctions.filter((a) => {
    if (!a.endsAt) return false;
    return new Date(a.endsAt).getTime() - Date.now() < 24 * 60 * 60 * 1000;
  });

  const totalBids = auctions.reduce(
    (sum, auction) => sum + Number(auction.bids || 0),
    0,
  );

  const paidAuctions = endedAuctions.filter((a) => a.paid === true);

  const unpaidAuctions = endedAuctions.filter(
    (a) => a.winnerUserId && a.paid !== true,
  );

  const totalRevenue = paidAuctions.reduce(
    (sum, auction) => sum + moneyToNumber(auction.price || 0),
    0,
  );

  const totalBuyers = buyerProfiles.length;

  const basicBuyers = buyerProfiles.filter(
    (buyer: any) => (buyer.verificationTier || "BASIC") === "BASIC",
  ).length;

  const verifiedBuyers = buyerProfiles.filter(
    (buyer: any) => buyer.verificationTier === "VERIFIED",
  ).length;

  const premiumBuyers = buyerProfiles.filter(
    (buyer: any) => buyer.verificationTier === "PREMIUM",
  ).length;

  const privateClients = buyerProfiles.filter(
    (buyer: any) => buyer.verificationTier === "PRIVATE",
  ).length;

  const trophyBidders = buyerProfiles.filter(
    (buyer: any) => buyer.verificationTier === "TROPHY",
  ).length;

  const onlineCutoff = Date.now() - 5 * 60 * 1000;

  const onlineBuyers = buyerProfiles.filter((buyer: any) => {
    if (!buyer.lastSeenAt) return false;
    return new Date(buyer.lastSeenAt).getTime() >= onlineCutoff;
  });

  const usersOnline = onlineBuyers.length;

  const onlineBasicBuyers = onlineBuyers.filter(
    (buyer: any) => (buyer.verificationTier || "BASIC") === "BASIC",
  ).length;

  const onlineVerifiedBuyers = onlineBuyers.filter(
    (buyer: any) => buyer.verificationTier === "VERIFIED",
  ).length;

  const onlinePremiumBuyers = onlineBuyers.filter(
    (buyer: any) => buyer.verificationTier === "PREMIUM",
  ).length;

  const onlinePrivateClients = onlineBuyers.filter(
    (buyer: any) => buyer.verificationTier === "PRIVATE",
  ).length;

  const onlineTrophyBidders = onlineBuyers.filter(
    (buyer: any) => buyer.verificationTier === "TROPHY",
  ).length;

  const reserveMetCount = allEndedAuctions.filter(
    (a) =>
      a.reservePrice &&
      moneyToNumber(a.price || 0) >= moneyToNumber(a.reservePrice || 0),
  ).length;

  const reserveNotMetCount = allEndedAuctions.filter(
    (a) =>
      a.reservePrice &&
      moneyToNumber(a.price || 0) < moneyToNumber(a.reservePrice || 0),
  ).length;

  const unsoldAuctions = allEndedAuctions.filter(
    (a) =>
      !a.winnerUserId ||
      (a.reservePrice &&
        moneyToNumber(a.price || 0) < moneyToNumber(a.reservePrice || 0)),
  );

  const activeListings = marketplaceListings.filter(
    (l) =>
      l.status === "ACTIVE" ||
      l.status === "PAUSED" ||
      l.status === "OFFER_PENDING",
  );

  const pendingPaymentListings = marketplaceListings.filter(
    (l) => l.status === "OFFER_ACCEPTED",
  );

  const soldListings = marketplaceListings.filter(
    (l) => l.status === "SOLD" || l.sold,
  );

  const pendingOfferCount = offers.filter((o: any) => o.status === "PENDING").length;

  function formatInvoiceAmount(value: string | number | null | undefined) {
    const amount = Number(String(value || "0").replace(/[$,]/g, ""));

    if (!Number.isFinite(amount)) return "$0.00";

    return amount.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  async function getInvoicePdf(invoiceId: string) {
    const session = await fetchAuthSession();
    const token = session.tokens?.idToken?.toString();

    if (!token) {
      alert("Please sign in again to view this invoice.");
      return null;
    }

    const res = await fetch(`/api/invoices/${invoiceId}/pdf`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      alert(`Unable to open invoice PDF. Status: ${res.status}`);
      return null;
    }

    return await res.blob();
  }

  async function viewInvoicePdf(invoiceId: string) {
    const blob = await getInvoicePdf(invoiceId);
    if (!blob) return;

    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function downloadInvoicePdf(invoiceId: string) {
    const blob = await getInvoicePdf(invoiceId);
    if (!blob) return;

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = `invoice-${invoiceId}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen bg-[#050607] px-6 py-10 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="text-center">
          <h1 className="font-serif text-5xl text-[#c0c0c0]">
            Seller Dashboard
          </h1>

          <div className="mx-auto mt-3 h-px w-72 bg-gradient-to-r from-transparent via-[#d6aa55]/70 to-transparent" />

          <p className="mt-5 text-gray-400">
            Manage your auctions and listings
          </p>
        </div>

        <div className="mt-10 flex flex-wrap justify-center gap-4">
          <button
            type="button"
            onClick={() => setActiveTab("auctions")}
            className={`w-36 group rounded-2xl border px-4 py-6 text-center transition hover:-translate-y-1 ${
              activeTab === "auctions"
                ? "border-[#d6aa55]/60 bg-[#1a1408]"
                : "border-[#d6aa55]/30 bg-[#1a1408]/60 hover:bg-[#1a1408]"
            }`}
          >
            <Gavel className="mx-auto mb-4 h-9 w-9 text-[#e7c77f]" />
            <div className="text-lg font-bold text-white">Auctions</div>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("marketplace")}
            className={`w-36 group relative rounded-2xl border px-4 py-6 text-center transition hover:-translate-y-1 ${
              activeTab === "marketplace"
                ? "border-[#d6aa55]/60 bg-[#1a1408]"
                : "border-[#d6aa55]/30 bg-[#1a1408]/60 hover:bg-[#1a1408]"
            }`}
          >
            {pendingOfferCount > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-black">
                {pendingOfferCount}
              </span>
            )}
            <Tag className="mx-auto mb-4 h-9 w-9 text-[#e7c77f]" />
            <div className="text-lg font-bold text-white">Marketplace</div>
          </button>

          <Link
            href="/sell/auction"
            className="w-36 group rounded-2xl border border-[#d6aa55]/30 bg-[#1a1408]/60 px-4 py-6 text-center transition hover:-translate-y-1 hover:bg-[#1a1408]"
          >
            <Gavel className="mx-auto mb-4 h-9 w-9 text-[#e7c77f]" />
            <div className="text-lg font-bold text-white">Create Auction</div>
          </Link>

          <Link
            href="/sell/listing"
            className="w-36 group rounded-2xl border border-[#d6aa55]/30 bg-[#1a1408]/60 px-4 py-6 text-center transition hover:-translate-y-1 hover:bg-[#1a1408]"
          >
            <Tag className="mx-auto mb-4 h-9 w-9 text-[#e7c77f]" />
            <div className="text-lg font-bold text-white">Create Listing</div>
          </Link>

          <Link
            href="/auctions/results"
            className="w-36 group rounded-2xl border border-[#d6aa55]/30 bg-[#1a1408]/60 px-4 py-6 text-center transition hover:-translate-y-1 hover:bg-[#1a1408]"
          >
            <Archive className="mx-auto mb-4 h-9 w-9 text-[#e7c77f]" />
            <div className="text-lg font-bold text-white">
              View Results Archive
            </div>
          </Link>

          <Link
            href="/seller/analytics"
            className="w-36 group rounded-2xl border border-[#d6aa55]/30 bg-[#1a1408]/60 px-4 py-6 text-center transition hover:-translate-y-1 hover:bg-[#1a1408]"
          >
            <BarChart2 className="mx-auto mb-4 h-9 w-9 text-[#e7c77f]" />
            <div className="text-lg font-bold text-white">Analytics</div>
          </Link>

          <Link
            href="/seller/revenue"
            className="w-36 group rounded-2xl border border-[#d6aa55]/30 bg-[#1a1408]/60 px-4 py-6 text-center transition hover:-translate-y-1 hover:bg-[#1a1408]"
          >
            <TrendingUp className="mx-auto mb-4 h-9 w-9 text-[#e7c77f]" />
            <div className="text-lg font-bold text-white">Revenue</div>
          </Link>

          <Link
            href="/seller/verifications"
            className="w-36 group rounded-2xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-6 text-center transition hover:-translate-y-1 hover:bg-yellow-500/20"
          >
            <ShieldCheck className="mx-auto mb-4 h-9 w-9 text-yellow-400" />
            <div className="text-lg font-bold text-white">Verifications</div>
          </Link>

          {isAdmin && (
            <Link
              href="/admin"
              className="w-36 group rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-6 text-center transition hover:-translate-y-1 hover:bg-red-500/20"
            >
              <ShieldCheck className="mx-auto mb-4 h-9 w-9 text-red-400" />
              <div className="text-lg font-bold text-red-300">Admin Panel</div>
            </Link>
          )}
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-4">
          <Stat label="Total Auctions" value={String(auctions.length)} />
          <Stat label="Live Auctions" value={String(liveAuctions.length)} />
          <Stat label="Ending Soon" value={String(endingSoon.length)} />

          <Stat label="Paid Auctions" value={String(paidAuctions.length)} />
          <Stat label="Unpaid Wins" value={String(unpaidAuctions.length)} />
          <Stat label="Revenue" value={`$${totalRevenue.toLocaleString()}`} />
          <OnlineBuyerSummary buyerProfiles={buyerProfiles} />
          <BuyerTierSummary buyerProfiles={buyerProfiles} />
        </div>

        {activeTab === "auctions" && (
          <>
            <BuyerRequestsSection
              requests={buyerRequests}
              client={client}
              setBuyerRequests={setBuyerRequests}
            />

            {scheduledAuctions.length > 0 && (
              <ScheduledAuctionsSection auctions={scheduledAuctions} client={client} />
            )}

            <AuctionSection
              title="Live Auctions"
              auctions={liveAuctions}
              client={client}
              sellerEmail={sellerEmail}
              sellerUserId={sellerUserId}
              invoices={invoices}
              onViewInvoice={viewInvoicePdf}
              onDownloadInvoice={downloadInvoicePdf}
              formatInvoiceAmount={formatInvoiceAmount}
              savedShipFrom={savedShipFrom}
            />

            <AuctionSection
              title="Ending Soon"
              auctions={endingSoon}
              client={client}
              sellerEmail={sellerEmail}
              sellerUserId={sellerUserId}
              invoices={invoices}
              onViewInvoice={viewInvoicePdf}
              onDownloadInvoice={downloadInvoicePdf}
              formatInvoiceAmount={formatInvoiceAmount}
              savedShipFrom={savedShipFrom}
            />

            <AuctionSection
              title="Ended Auctions"
              auctions={endedAuctions}
              client={client}
              sellerEmail={sellerEmail}
              sellerUserId={sellerUserId}
              invoices={invoices}
              onViewInvoice={viewInvoicePdf}
              onDownloadInvoice={downloadInvoicePdf}
              formatInvoiceAmount={formatInvoiceAmount}
              savedShipFrom={savedShipFrom}
            />

            <AuctionSection
              title="Unsold Auctions"
              auctions={unsoldAuctions}
              client={client}
              sellerEmail={sellerEmail}
              sellerUserId={sellerUserId}
              invoices={invoices}
              onViewInvoice={viewInvoicePdf}
              onDownloadInvoice={downloadInvoicePdf}
              formatInvoiceAmount={formatInvoiceAmount}
              savedShipFrom={savedShipFrom}
            />
          </>
        )}

        {activeTab === "marketplace" && (
          <>
            <OfferSection
              offers={offers}
              listings={marketplaceListings}
              client={client}
            />

            <MarketplaceSection
              title="Active Listings"
              listings={activeListings}
              client={client}
              setMarketplaceListings={setMarketplaceListings}
              invoices={invoices}
              onViewInvoice={viewInvoicePdf}
              onDownloadInvoice={downloadInvoicePdf}
              formatInvoiceAmount={formatInvoiceAmount}
            />

            <MarketplaceSection
              savedShipFrom={savedShipFrom}
              title="Pending Payment"
              listings={pendingPaymentListings}
              client={client}
              setMarketplaceListings={setMarketplaceListings}
              invoices={invoices}
              onViewInvoice={viewInvoicePdf}
              onDownloadInvoice={downloadInvoicePdf}
              formatInvoiceAmount={formatInvoiceAmount}
            />

            <MarketplaceSection
              savedShipFrom={savedShipFrom}
              title="Sold Listings"
              listings={soldListings}
              client={client}
              setMarketplaceListings={setMarketplaceListings}
              invoices={invoices}
              onViewInvoice={viewInvoicePdf}
              onDownloadInvoice={downloadInvoicePdf}
              formatInvoiceAmount={formatInvoiceAmount}
            />
          </>
        )}
      </div>
    </main>
  );
}
function ScheduledAuctionsSection({ auctions, client }: any) {
  return (
    <section className="mt-12">
      <div className="mb-5 flex items-center gap-3">
        <Clock className="h-6 w-6 text-[#d6aa55]" />
        <h2 className="font-serif text-3xl text-[#c0c0c0]">Scheduled Auctions</h2>
        <span className="rounded-full border border-[#d6aa55]/30 bg-[#1a1408] px-2.5 py-0.5 text-xs text-[#e7c77f]">
          {auctions.length}
        </span>
      </div>

      <div className="grid gap-4">
        {auctions.map((auction: any) => {
          const startsAt = auction.startsAt ? new Date(auction.startsAt) : null;
          return (
            <div
              key={auction.id}
              className="flex items-center gap-4 rounded-xl border border-[#d6aa55]/20 bg-[#1a1408]/40 p-4"
            >
              <img
                src={auction.image || "/logo.png"}
                alt={auction.title}
                onError={(e) => { e.currentTarget.src = "/logo.png"; }}
                className="h-16 w-16 rounded-lg object-contain bg-black shrink-0"
              />
              <div className="min-w-0 flex-1">
                <div className="font-medium text-white truncate">{auction.title}</div>
                <div className="mt-1 text-sm text-gray-400">
                  Starts: {startsAt ? startsAt.toLocaleString() : "—"}
                </div>
                {auction.endsAt && (
                  <div className="text-xs text-gray-600">
                    Ends: {new Date(auction.endsAt).toLocaleString()}
                  </div>
                )}
              </div>
              <div className="shrink-0 flex flex-col items-end gap-2">
                <span className="rounded border border-[#d6aa55]/30 bg-[#1a1408] px-2.5 py-0.5 text-xs text-[#e7c77f] uppercase tracking-wide">
                  Scheduled
                </span>
                <Link
                  href={`/auctions/${auction.id}`}
                  className="text-xs text-gray-500 hover:text-white"
                >
                  View →
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function AuctionSection({
  title,
  auctions,
  client,
  sellerEmail,
  sellerUserId,
  invoices,
  onViewInvoice,
  onDownloadInvoice,
  formatInvoiceAmount,
  savedShipFrom,
}: any) {
  return (
    <section className="mt-12">
      <h2 className="mb-5 font-serif text-3xl text-[#c0c0c0]">{title}</h2>

      {auctions.length === 0 ? (
        <p className="text-gray-500">No auctions in this section.</p>
      ) : (
        <div className="grid gap-6">
          {auctions.map((auction: any) => (
            <SellerAuctionCard
              key={auction.id}
              auction={auction}
              client={client}
              sellerEmail={sellerEmail}
              sellerUserId={sellerUserId}
              savedShipFrom={savedShipFrom ?? null}
              invoice={invoices?.find(
                (invoice: any) =>
                  String(invoice.auctionId) === String(auction.id),
              )}
              onViewInvoice={onViewInvoice}
              onDownloadInvoice={onDownloadInvoice}
              formatInvoiceAmount={formatInvoiceAmount}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function OfferSection({ offers, listings, client }: any) {
  const pendingOffers = offers.filter(
    (offer: any) => offer.status === "PENDING",
  );

  return (
    <section className="mt-12">
      <h2 className="mb-5 font-serif text-3xl text-[#c0c0c0]">
        Pending Offers
      </h2>

      {pendingOffers.length === 0 ? (
        <p className="text-gray-500">No pending offers.</p>
      ) : (
        <div className="grid gap-4">
          {pendingOffers.map((offer: any) => {
            const listing = listings.find(
              (item: any) => String(item.id) === String(offer.listingId),
            );

            const listingImage =
              listing?.imageUrl ||
              cdnUrl(
                listing?.thumbImages?.[0] ||
                  listing?.images?.[0] ||
                  listing?.image ||
                  "",
              ) ||
              "/logo.png";

            return (
              <div
                key={offer.id}
                className="rounded-xl border border-white/10 bg-white/[0.03] p-5"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex flex-1 flex-col gap-5 lg:flex-row lg:items-center">
                    {listing && (
                      <div className="flex items-center gap-4 rounded-xl border border-white/10 bg-black/30 p-3">
                        <img
                          src={listingImage}
                          alt={listing.title || "Listing"}
                          onError={(e) => {
                            e.currentTarget.onerror = null;
                            e.currentTarget.src = "/logo.png";
                          }}
                          className="h-20 w-20 rounded-lg bg-black object-contain"
                        />

                        <div>
                          <div className="text-xs uppercase tracking-[0.2em] text-gray-500">
                            Listing
                          </div>

                          <Link
                            href={`/marketplace/${listing.id}`}
                            className="mt-1 block font-serif text-xl text-white hover:text-[#e7c77f]"
                          >
                            {listing.title}
                          </Link>

                          <div className="mt-1 text-sm text-gray-500">
                            Asking: {listing.price}
                          </div>
                        </div>
                      </div>
                    )}
                    <div>
                      <div className="text-xs uppercase tracking-[0.18em] text-gray-500">
                        Offer Amount
                      </div>

                      <div className="mt-2 font-serif text-3xl text-[#c0c0c0]">
                        {offer.amount}
                      </div>

                      <div className="mt-3 text-sm text-gray-400">
                        Buyer: {offer.buyerDisplayName || offer.buyerEmail}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await client.models.Offer.update(
                            {
                              id: offer.id,
                              status: "ACCEPTED",
                            },
                            { authMode: "userPool" } as any,
                          );

                          await client.models.MarketplaceListing.update(
                            {
                              id: offer.listingId,
                              sold: false,
                              status: "OFFER_ACCEPTED",
                              buyerEmail:
                                offer.buyerEmail ||
                                offer.buyerDisplayName ||
                                "",
                              acceptedOfferAmount: offer.amount,
                            },
                            { authMode: "userPool" } as any,
                          );

                          window.location.reload();
                        } catch (err) {
                          console.error(err);
                          toast.error("Failed to accept offer");
                        }
                      }}
                      className="rounded border border-emerald-500/20 bg-emerald-500/10 px-5 py-3 text-sm text-emerald-300 hover:bg-emerald-500/20"
                    >
                      Accept
                    </button>

                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await client.models.Offer.update(
                            {
                              id: offer.id,
                              status: "DECLINED",
                            },
                            { authMode: "userPool" } as any,
                          );

                          await client.models.MarketplaceListing.update(
                            {
                              id: offer.listingId,
                              status: "ACTIVE",
                            },
                            { authMode: "userPool" } as any,
                          );

                          window.location.reload();
                        } catch (err) {
                          console.error(err);
                          toast.error("Failed to decline offer");
                        }
                      }}
                      className="rounded border border-red-500/20 bg-red-500/10 px-5 py-3 text-sm text-red-300 hover:bg-red-500/20"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function BuyerRequestsSection({ requests, client, setBuyerRequests }: any) {
  const [approvalTiers, setApprovalTiers] = React.useState<Record<string, string>>({});

  const pendingRequests = requests.filter(
    (request: any) => request.status === "PENDING_REVIEW",
  );

  return (
    <section className="mt-12">
      <h2 className="mb-5 font-serif text-3xl text-[#c0c0c0]">
        Buyer Limit Requests
      </h2>

      {pendingRequests.length === 0 ? (
        <p className="text-gray-500">No pending buyer limit requests.</p>
      ) : (
        <div className="grid gap-4">
          {pendingRequests.map((request: any) => {
            const selectedTier = approvalTiers[request.userId] || request.requestedTier || "VERIFIED";

            return (
              <div
                key={request.userId}
                className="rounded-xl border border-white/10 bg-white/[0.03] p-5"
              >
                <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] text-gray-500">
                      Buyer Request
                    </div>

                    <div className="mt-2 font-serif text-2xl text-[#c0c0c0]">
                      {request.email}
                    </div>

                    <div className="mt-3 grid gap-2 text-sm text-gray-400 sm:grid-cols-2">
                      <div>
                        Current Tier:{" "}
                        <span className="text-white">
                          {request.verificationTier || "BASIC"}
                        </span>
                      </div>

                      <div>
                        Current Limit:{" "}
                        <span className="text-white">
                          ${Number(request.bidLimit || 1000).toLocaleString()}
                        </span>
                      </div>

                      <div>
                        Requested Tier:{" "}
                        <span className="text-[#e7c77f]">
                          {request.requestedTier || "—"}
                        </span>
                      </div>
                    </div>

                    {request.verificationNotes && (
                      <div className="mt-4 rounded border border-white/10 bg-black/30 p-3 text-sm text-gray-300">
                        {request.verificationNotes}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] uppercase tracking-[0.15em] text-gray-500">
                        Approve as
                      </label>
                      <select
                        value={selectedTier}
                        onChange={(e) =>
                          setApprovalTiers((prev) => ({
                            ...prev,
                            [request.userId]: e.target.value,
                          }))
                        }
                        className="rounded border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none"
                      >
                        {["VERIFIED", "PREMIUM", "PRIVATE", "TROPHY"].map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>

                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const result = await client.mutations.reviewBuyerVerification(
                            { userId: request.userId, approved: true, tier: selectedTier },
                            { authMode: "userPool" } as any,
                          );

                          if (!result.data?.success) {
                            throw new Error(result.data?.message || "Failed");
                          }

                          setBuyerRequests((prev: any[]) =>
                            prev.filter(
                              (item: any) => item.userId !== request.userId,
                            ),
                          );

                          toast.success("Buyer limit approved");
                        } catch (err) {
                          console.error(err);
                          toast.error("Failed to approve buyer");
                        }
                      }}
                      className="rounded border border-emerald-500/20 bg-emerald-500/10 px-5 py-3 text-sm text-emerald-300 hover:bg-emerald-500/20"
                    >
                      Approve
                    </button>

                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const result = await client.mutations.reviewBuyerVerification(
                            { userId: request.userId, approved: false },
                            { authMode: "userPool" } as any,
                          );

                          if (!result.data?.success) {
                            throw new Error(result.data?.message || "Failed");
                          }

                          setBuyerRequests((prev: any[]) =>
                            prev.filter(
                              (item: any) => item.userId !== request.userId,
                            ),
                          );

                          toast.success("Buyer request declined");
                        } catch (err) {
                          console.error(err);
                          toast.error("Failed to decline buyer");
                        }
                      }}
                      className="rounded border border-red-500/20 bg-red-500/10 px-5 py-3 text-sm text-red-300 hover:bg-red-500/20"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#c8a96b]/20 bg-[#c8a96b]/10 p-5">
      <div className="text-xs uppercase tracking-widest text-gray-500">
        {label}
      </div>

      <div className="mt-2 font-serif text-3xl text-[#e7c98a]">{value}</div>
    </div>
  );
}

function OnlineBuyerSummary({ buyerProfiles }: { buyerProfiles: any[] }) {
  const onlineCutoff = Date.now() - 5 * 60 * 1000;

  const onlineBuyers = buyerProfiles.filter((buyer: any) => {
    if (!buyer.lastSeenAt) return false;
    return new Date(buyer.lastSeenAt).getTime() >= onlineCutoff;
  });

  const tiers = [
    { label: "Basic", code: "BASIC" },
    { label: "Verified", code: "VERIFIED" },
    { label: "Premium", code: "PREMIUM" },
    { label: "Private", code: "PRIVATE" },
    { label: "Trophy", code: "TROPHY" },
  ];

  return (
    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-5 md:col-span-2">
      <div>
        <div className="text-xs uppercase tracking-widest text-gray-500">
          Users Online
        </div>

        <div className="mt-2 flex items-end gap-4">
          <div className="font-serif text-4xl text-emerald-300">
            {onlineBuyers.length}
          </div>

          <div className="pb-1 text-xs text-gray-400">
            Active in the last 5 minutes
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {tiers.map((tier) => {
          const count = onlineBuyers.filter(
            (buyer: any) => (buyer.verificationTier || "BASIC") === tier.code,
          ).length;

          return (
            <div
              key={tier.code}
              className="rounded-lg border border-emerald-500/15 bg-black/25 p-3 text-center"
            >
              <div className="font-serif text-2xl text-emerald-300">
                {count}
              </div>

              <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-gray-500">
                {tier.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BuyerTierSummary({ buyerProfiles }: { buyerProfiles: any[] }) {
  const tiers = [
    { label: "Basic", code: "BASIC" },
    { label: "Verified", code: "VERIFIED" },
    { label: "Premium", code: "PREMIUM" },
    { label: "Private", code: "PRIVATE" },
    { label: "Trophy", code: "TROPHY" },
  ];

  return (
    <div className="rounded-xl border border-[#c8a96b]/20 bg-[#c8a96b]/10 p-5 md:col-span-2">
      <div>
        <div className="text-xs uppercase tracking-widest text-gray-500">
          Total Buyers
        </div>

        <div className="mt-2 flex items-end gap-4">
          <div className="font-serif text-4xl text-[#e7c98a]">
            {buyerProfiles.length}
          </div>

          <div className="pb-1 text-xs text-gray-400">Total Buyers</div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {tiers.map((tier) => {
          const count = buyerProfiles.filter(
            (buyer: any) => (buyer.verificationTier || "BASIC") === tier.code,
          ).length;

          return (
            <div
              key={tier.code}
              className="rounded-lg border border-white/10 bg-black/25 p-3 text-center"
            >
              <div className="font-serif text-2xl text-[#e7c98a]">{count}</div>

              <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-gray-500">
                {tier.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SellerAuctionCard({
  auction,
  client,
  sellerEmail,
  sellerUserId,
  savedShipFrom,
  invoice,
  onViewInvoice,
  onDownloadInvoice,
  formatInvoiceAmount,
}: any) {
  const ended =
    auction.endsAt && new Date(auction.endsAt).getTime() < Date.now();
  const isOwner =
    auction.sellerEmail === sellerEmail ||
    auction.sellerUserId === sellerUserId;

  const hasBids = Number(auction.bids || 0) > 0;

  const sellerPublicId =
    auction.sellerPublicId ||
    (auction.sellerUserId
      ? `RAH-${String(auction.sellerUserId)
          .replace(/[^a-zA-Z0-9]/g, "")
          .slice(0, 10)
          .toUpperCase()}`
      : "");

  const [timeLeft, setTimeLeft] = useState("");

  const [showShippingModal, setShowShippingModal] = useState(false);
  const [shippingCarrier, setShippingCarrier] = useState("");
  const [shippingTracking, setShippingTracking] = useState("");
  const [savingShipping, setSavingShipping] = useState(false);

  // EasyPost label flow
  const [showRatesModal, setShowRatesModal] = useState(false);
  const [ratesStep, setRatesStep] = useState<"form" | "rates" | "purchasing">("form");
  const [ratesWeight, setRatesWeight] = useState("");
  const [ratesLength, setRatesLength] = useState("");
  const [ratesWidth, setRatesWidth] = useState("");
  const [ratesHeight, setRatesHeight] = useState("");
  const [ratesFromName, setRatesFromName] = useState("");
  const [ratesFromStreet, setRatesFromStreet] = useState("");
  const [ratesFromStreet2, setRatesFromStreet2] = useState("");
  const [ratesFromCity, setRatesFromCity] = useState("");
  const [ratesFromState, setRatesFromState] = useState("");
  const [ratesFromZip, setRatesFromZip] = useState("");
  const [ratesFromPhone, setRatesFromPhone] = useState("");
  const [fetchingRates, setFetchingRates] = useState(false);
  const [shipmentId, setShipmentId] = useState("");
  const [rates, setRates] = useState<any[]>([]);
  const [ratesError, setRatesError] = useState("");
  const [purchasedLabel, setPurchasedLabel] = useState<{ trackingNumber: string; carrier: string; labelUrl: string } | null>(null);

  const [showEndAuctionModal, setShowEndAuctionModal] = useState(false);
  const [endingAuction, setEndingAuction] = useState(false);

  useEffect(() => {
    if (!auction?.endsAt) return;

    function updateTimer() {
      const diff = new Date(auction.endsAt).getTime() - Date.now();

      if (diff <= 0) {
        setTimeLeft("Ended");
        return;
      }

      const days = Math.floor(diff / 86400000);
      const hours = Math.floor((diff % 86400000) / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);

      setTimeLeft(
        `${days}days ${hours}hr ${minutes}min ${seconds
          .toString()
          .padStart(2, "0")}sec`,
      );
    }

    updateTimer();

    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [auction?.endsAt]);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex flex-col gap-6 lg:flex-row">
        <img
          loading="lazy"
          src={
            auction.image &&
            auction.image !== "undefined" &&
            auction.image.trim() !== ""
              ? auction.image
              : "/logo.png"
          }
          alt={auction.title}
          onError={(e) => {
            e.currentTarget.onerror = null;
            e.currentTarget.src = "/logo.png";
          }}
          className="h-52 w-full rounded-xl object-contain bg-black sm:h-64 lg:w-72"
        />

        <div className="flex flex-1 flex-col justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-3xl font-serif">{auction.title}</h2>

              {ended ? (
                <span className="rounded bg-red-500/20 px-3 py-1 text-xs text-red-300">
                  Ended
                </span>
              ) : (
                <span className="rounded bg-green-500/20 px-3 py-1 text-xs text-green-300">
                  Live
                </span>
              )}

              {auction.reservePrice &&
                (moneyToNumber(auction.price || 0) >=
                moneyToNumber(auction.reservePrice || 0) ? (
                  <span className="rounded bg-emerald-500/20 px-3 py-1 text-xs text-emerald-300">
                    Reserve Met
                  </span>
                ) : (
                  <span className="rounded bg-yellow-500/20 px-3 py-1 text-xs text-yellow-300">
                    Reserve Not Met
                  </span>
                ))}
            </div>

            <div className="mt-4 grid gap-6 xl:grid-cols-[1fr_320px]">
              <div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-gray-500">
                      {invoice ? "Paid Total" : "Current Price"}
                    </div>

                    <div className="mt-1 font-serif text-2xl text-[#c0c0c0]">
                      {invoice
                        ? formatInvoiceAmount(invoice.amount)
                        : auction.price}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs uppercase text-gray-500">
                      Leading Bidder
                    </div>
                    <div className="mt-1 text-sm text-[#c0c0c0]">
                      {auction.winnerDisplayName ||
                        auction.winnerUserId ||
                        "No bids"}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs uppercase text-gray-500">
                      Total Bids
                    </div>
                    <div className="mt-1 text-xl">{auction.bids || 0}</div>
                  </div>

                  <div>
                    <div className="text-xs uppercase text-gray-500">
                      Reserve
                    </div>
                    <div className="mt-1 text-sm">
                      {auction.reservePrice || "No Reserve"}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs uppercase text-gray-500">Ends</div>
                    <div className="mt-1 text-sm">
                      <span
                        className={ended ? "text-red-400" : "text-yellow-300"}
                      >
                        {timeLeft}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <Link
                    href={`/auctions/${auction.id}`}
                    className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-center text-sm font-medium tracking-wide text-white backdrop-blur-sm transition hover:border-white/20 hover:bg-white/10"
                  >
                    View Auction
                  </Link>

                  {isOwner && !hasBids && !ended && (
                    <Link
                      href={`/sell/auction/${auction.id}/edit`}
                      className="rounded-lg border border-[#d6aa55]/30 bg-white/5 px-4 py-3 text-center text-sm font-medium tracking-wide text-[#e7c77f] backdrop-blur-sm transition hover:border-[#d6aa55]/50 hover:bg-white/10"
                    >
                      Edit Auction
                    </Link>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(
                        `${window.location.origin}/auctions/${auction.id}`,
                      );
                      toast.success("Auction link copied");
                    }}
                    className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-center text-sm font-medium tracking-wide text-white backdrop-blur-sm transition hover:border-white/20 hover:bg-white/10"
                  >
                    Copy Link
                  </button>

                  {!ended && (
                    <button
                      type="button"
                      disabled={endingAuction}
                      onClick={() => setShowEndAuctionModal(true)}
                      className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-center text-sm font-medium tracking-wide text-red-300 backdrop-blur-sm transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {endingAuction ? "Ending..." : "End Auction"}
                    </button>
                  )}

                  {ended && (
                    <Link
                      href={`/auctions/${auction.id}/results`}
                      className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-center text-sm font-medium tracking-wide text-white backdrop-blur-sm transition hover:border-white/20 hover:bg-white/10"
                    >
                      View Results
                    </Link>
                  )}
                </div>

                {invoice && (
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => onViewInvoice(invoice.id)}
                      className="flex-1 rounded border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white hover:bg-white/[0.08]"
                    >
                      View Invoice
                    </button>

                    <button
                      type="button"
                      onClick={() => onDownloadInvoice(invoice.id)}
                      className="flex-1 rounded border border-[#d6aa55]/30 bg-[#1a1408] px-4 py-2 text-sm font-semibold text-[#e7c77f] hover:bg-[#221909]"
                    >
                      Download Invoice
                    </button>
                  </div>
                )}
              </div>

              {ended && auction.paid && (
                <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-gray-500">
                    Shipping
                  </div>

                  {invoice?.shippingLine1 && (
                    <div className="mt-3 rounded-lg border border-[#d6aa55]/20 bg-[#d6aa55]/[0.03] p-3">
                      <div className="mb-1 text-xs uppercase tracking-widest text-[#d6aa55]/70">Ship To</div>
                      <div className="text-sm text-[#d7d7d7]">{invoice.shippingName}</div>
                      <div className="text-sm text-gray-400">{invoice.shippingLine1}</div>
                      {invoice.shippingLine2 && <div className="text-sm text-gray-400">{invoice.shippingLine2}</div>}
                      <div className="text-sm text-gray-400">{invoice.shippingCity}, {invoice.shippingState} {invoice.shippingZip}</div>
                    </div>
                  )}

                  <div className="mt-2 flex items-center gap-3 text-sm text-gray-300">
                    <span>Status: {auction.shippingStatus || "PAID"}</span>

                    {trackingUrl(
                      auction.carrier || "",
                      auction.trackingNumber || "",
                    ) && (
                      <a
                        href={trackingUrl(
                          auction.carrier || "",
                          auction.trackingNumber || "",
                        )}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-semibold text-[#e7c77f] hover:text-white"
                      >
                        Track Package →
                      </a>
                    )}
                  </div>

                  {auction.trackingNumber && (
                    <div className="mt-3 text-xs text-gray-500">
                      Tracking: {auction.carrier} {auction.trackingNumber}
                    </div>
                  )}

                  {!auction.shippingLabelUrl && !auction.trackingNumber && (
                    <button
                      type="button"
                      onClick={() => {
                        setRatesStep("form");
                        setRates([]);
                        setRatesError("");
                        setPurchasedLabel(null);
                        setShipmentId("");
                        if (savedShipFrom) {
                          setRatesFromName(savedShipFrom.name);
                          setRatesFromStreet(savedShipFrom.street1);
                          setRatesFromStreet2(savedShipFrom.street2);
                          setRatesFromCity(savedShipFrom.city);
                          setRatesFromState(savedShipFrom.state);
                          setRatesFromZip(savedShipFrom.zip);
                          setRatesFromPhone(savedShipFrom.phone);
                        }
                        setShowRatesModal(true);
                      }}
                      className="mt-4 w-full rounded-lg border border-[#d6aa55]/50 bg-[#1a1408] px-4 py-2 text-sm font-semibold text-[#e7c77f] hover:bg-[#221909]"
                    >
                      Get Rates & Print Label
                    </button>
                  )}

                  {auction.shippingLabelUrl && (
                    <button
                      type="button"
                      onClick={() => printLabel(auction.shippingLabelUrl)}
                      className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/20"
                    >
                      Print Label
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setShippingCarrier(auction.carrier || "");
                      setShippingTracking(auction.trackingNumber || "");
                      setShowShippingModal(true);
                    }}
                    className="mt-2 w-full rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-semibold text-gray-400 hover:text-white"
                  >
                    {auction.trackingNumber
                      ? "Update Tracking Manually"
                      : "Enter Tracking Manually"}
                  </button>

                  {auction.shippingStatus === "SHIPPED" && (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await client.models.Auction.update(
                            {
                              id: auction.id,
                              shippingStatus: "DELIVERED",
                              deliveredAt: new Date().toISOString(),
                            },
                            { authMode: "userPool" } as any,
                          );
                          toast.success("Marked as delivered");
                          window.location.reload();
                        } catch (err) {
                          console.error(err);
                          toast.error("Failed to update");
                        }
                      }}
                      className="mt-2 w-full rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/20"
                    >
                      Mark as Delivered
                    </button>
                  )}
                </div>
              )}
            </div>

            {ended &&
              (!auction.winnerUserId ||
                (auction.reservePrice &&
                  moneyToNumber(auction.price || 0) <
                    moneyToNumber(auction.reservePrice || 0))) && (
                <div className="mt-5">
                  <Link
                    href={`/sell/auction?relist=${auction.id}`}
                    className="inline-flex rounded-lg border border-[#d6aa55]/30 bg-[#1a1408] px-5 py-3 text-sm font-semibold text-[#e7c77f] transition hover:bg-[#221909]"
                  >
                    Re-List Auction
                  </Link>
                </div>
              )}
          </div>

          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-[10px] uppercase tracking-[0.16em] text-gray-600">
            {auction.createdAt && (
              <span>Listed {new Date(auction.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
            )}
            {auction.paidAt && (
              <span className="text-emerald-700">Sold {new Date(auction.paidAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
            )}
            {auction.endsAt && !auction.paidAt && (
              <span>Ended {new Date(auction.endsAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
            )}
          </div>

          {(auction.sellerPublicId || auction.sellerUserId) && (
            <div className="mt-5 border-t border-white/10 pt-4 text-xs uppercase tracking-[0.22em] text-gray-500">
              Seller ID{" "}
              <span className="text-[#e7c77f]">
                {auction.sellerPublicId ||
                  `RAH-${String(auction.sellerUserId)
                    .replace(/[^a-zA-Z0-9]/g, "")
                    .slice(0, 10)
                    .toUpperCase()}`}
              </span>
            </div>
          )}
        </div>
      </div>

      {showShippingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md rounded-2xl border border-[#d6aa55]/30 bg-[#0b0c0e] p-6 shadow-[0_30px_100px_rgba(0,0,0,0.65)]">
            <h3 className="font-serif text-2xl text-[#c0c0c0]">
              Update Shipping
            </h3>

            <p className="mt-2 text-sm text-gray-400">
              Add carrier and tracking details for this auction.
            </p>

            <div className="mt-5 space-y-4">
              <input
                value={shippingCarrier}
                onChange={(e) => setShippingCarrier(e.target.value)}
                placeholder="Carrier — USPS, UPS, FedEx"
                className="w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-white outline-none placeholder:text-gray-600 focus:border-[#d6aa55]/50"
              />

              <input
                value={shippingTracking}
                onChange={(e) => setShippingTracking(e.target.value)}
                placeholder="Tracking number"
                className="w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-white outline-none placeholder:text-gray-600 focus:border-[#d6aa55]/50"
              />
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setShowShippingModal(false)}
                className="flex-1 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-semibold text-white hover:bg-white/[0.06]"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={savingShipping}
                onClick={async () => {
                  if (!shippingCarrier.trim()) {
                    toast.error("Enter a carrier");
                    return;
                  }

                  if (!shippingTracking.trim()) {
                    toast.error("Enter a tracking number");
                    return;
                  }

                  try {
                    setSavingShipping(true);

                    await client.models.Auction.update(
                      {
                        id: auction.id,
                        shippingStatus: "SHIPPED",
                        carrier: shippingCarrier.trim(),
                        trackingNumber: shippingTracking.trim(),
                        shippedAt: new Date().toISOString(),
                      },
                      { authMode: "userPool" } as any,
                    );

                    toast.success("Shipping info updated");
                    setShowShippingModal(false);
                    window.location.reload();
                  } catch (err) {
                    console.error(err);
                    toast.error("Failed to update shipping");
                  } finally {
                    setSavingShipping(false);
                  }
                }}
                className="flex-1 rounded-xl border border-[#d6aa55]/30 bg-[#1a1408] px-4 py-3 text-sm font-semibold text-[#e7c77f] hover:bg-[#221909] disabled:opacity-50"
              >
                {savingShipping ? "Saving..." : "Save Shipping"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showRatesModal && (
        <EasyPostModal
          itemId={auction.id}
          itemType="AUCTION"
          client={client}
          step={ratesStep}
          setStep={setRatesStep}
          weight={ratesWeight} setWeight={setRatesWeight}
          length={ratesLength} setLength={setRatesLength}
          width={ratesWidth} setWidth={setRatesWidth}
          height={ratesHeight} setHeight={setRatesHeight}
          fromName={ratesFromName} setFromName={setRatesFromName}
          fromStreet={ratesFromStreet} setFromStreet={setRatesFromStreet}
          fromStreet2={ratesFromStreet2} setFromStreet2={setRatesFromStreet2}
          fromCity={ratesFromCity} setFromCity={setRatesFromCity}
          fromState={ratesFromState} setFromState={setRatesFromState}
          fromZip={ratesFromZip} setFromZip={setRatesFromZip}
          fromPhone={ratesFromPhone} setFromPhone={setRatesFromPhone}
          fetchingRates={fetchingRates} setFetchingRates={setFetchingRates}
          shipmentId={shipmentId} setShipmentId={setShipmentId}
          rates={rates} setRates={setRates}
          ratesError={ratesError} setRatesError={setRatesError}
          purchasedLabel={purchasedLabel} setPurchasedLabel={setPurchasedLabel}
          onClose={() => setShowRatesModal(false)}
          onSuccess={() => { setShowRatesModal(false); window.location.reload(); }}
        />
      )}
      {showEndAuctionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md rounded-2xl border border-red-500/30 bg-[#0b0c0e] p-6 shadow-[0_30px_100px_rgba(0,0,0,0.65)]">
            <h3 className="font-serif text-2xl text-red-300">End Auction?</h3>

            <p className="mt-3 text-sm leading-6 text-gray-300">
              This will immediately end the auction and move it to results. This
              action should only be used when you are sure.
            </p>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setShowEndAuctionModal(false)}
                className="flex-1 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-semibold text-white hover:bg-white/[0.06]"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={endingAuction}
                onClick={async () => {
                  setEndingAuction(true);

                  try {
                    await client.models.Auction.update(
                      {
                        id: auction.id,
                        ended: true,
                        status: "ENDED",
                        endsAt: new Date().toISOString(),
                      },
                      { authMode: "userPool" } as any,
                    );

                    toast.success("Auction ended");
                    setShowEndAuctionModal(false);
                    window.location.reload();
                  } catch (err) {
                    console.error(err);
                    toast.error("Failed to end auction");
                  } finally {
                    setEndingAuction(false);
                  }
                }}
                className="flex-1 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-300 hover:bg-red-500/20 disabled:opacity-50"
              >
                {endingAuction ? "Ending..." : "End Auction"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MarketplaceSection({
  title,
  listings,
  client,
  setMarketplaceListings,
  invoices,
  onViewInvoice,
  onDownloadInvoice,
  formatInvoiceAmount,
  savedShipFrom,
}: any) {
  const [showShippingModal, setShowShippingModal] = useState(false);
  const [selectedListing, setSelectedListing] = useState<any>(null);
  const [shippingCarrier, setShippingCarrier] = useState("");
  const [shippingTracking, setShippingTracking] = useState("");
  const [savingShipping, setSavingShipping] = useState(false);

  // EasyPost label flow
  const [showRatesModal, setShowRatesModal] = useState(false);
  const [ratesListingId, setRatesListingId] = useState("");
  const [ratesStep, setRatesStep] = useState<"form" | "rates" | "purchasing">("form");
  const [ratesWeight, setRatesWeight] = useState("");
  const [ratesLength, setRatesLength] = useState("");
  const [ratesWidth, setRatesWidth] = useState("");
  const [ratesHeight, setRatesHeight] = useState("");
  const [ratesFromName, setRatesFromName] = useState("");
  const [ratesFromStreet, setRatesFromStreet] = useState("");
  const [ratesFromStreet2, setRatesFromStreet2] = useState("");
  const [ratesFromCity, setRatesFromCity] = useState("");
  const [ratesFromState, setRatesFromState] = useState("");
  const [ratesFromZip, setRatesFromZip] = useState("");
  const [ratesFromPhone, setRatesFromPhone] = useState("");
  const [fetchingRates, setFetchingRates] = useState(false);
  const [shipmentId, setShipmentId] = useState("");
  const [rates, setRates] = useState<any[]>([]);
  const [ratesError, setRatesError] = useState("");
  const [purchasedLabel, setPurchasedLabel] = useState<{ trackingNumber: string; carrier: string; labelUrl: string } | null>(null);

  return (
    <section className="mt-14">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="font-serif text-3xl text-[#c0c0c0]">{title}</h2>

        <Link
          href="/sell/listing"
          className="rounded border border-[#d6aa55]/30 bg-[#1a1408] px-5 py-3 text-sm font-semibold text-[#e7c77f] hover:bg-[#221909]"
        >
          Create Listing
        </Link>
      </div>

      {listings.length === 0 ? (
        <p className="text-gray-500">No marketplace listings.</p>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {listings.map((listing: any) => {
            const invoice = invoices?.find(
              (invoice: any) =>
                String(invoice.listingId) === String(listing.id),
            );

            return (
              <div
                key={listing.id}
                className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] transition hover:border-[#c0c0c0]/40"
              >
                <div className="h-56 bg-black sm:h-72">
                  <img
                    loading="lazy"
                    src={
                      listing.image && listing.image !== "undefined"
                        ? listing.image
                        : "/logo.png"
                    }
                    className="h-full w-full object-contain bg-black"
                  />
                </div>

                <div className="p-5">
                  <div className="flex items-center justify-between">
                    <div className="text-xs uppercase tracking-[0.2em] text-gray-500">
                      Marketplace
                    </div>

                    {listing.status === "SOLD" ? (
                      <span className="rounded bg-red-500/20 px-2 py-1 text-[10px] uppercase text-red-300">
                        Sold
                      </span>
                    ) : listing.status === "OFFER_PENDING" ? (
                      <span className="rounded bg-yellow-500/20 px-2 py-1 text-[10px] uppercase text-yellow-300">
                        Offer Pending
                      </span>
                    ) : listing.status === "OFFER_ACCEPTED" ? (
                      <span className="rounded bg-blue-500/20 px-2 py-1 text-[10px] uppercase text-blue-300">
                        Pending Payment
                      </span>
                    ) : (
                      <span className="rounded bg-emerald-500/20 px-2 py-1 text-[10px] uppercase text-emerald-300">
                        Active
                      </span>
                    )}
                  </div>

                  <h3 className="mt-2 font-serif text-2xl">{listing.title}</h3>

                  <div className="mt-3">
                    <div className="text-xs uppercase tracking-[0.2em] text-gray-500">
                      {invoice ? "Paid Total" : "Price"}
                    </div>

                    <div className="mt-1 font-serif text-3xl text-[#c0c0c0]">
                      {invoice
                        ? formatInvoiceAmount(invoice.amount)
                        : listing.acceptedOfferAmount || listing.price}
                    </div>
                  </div>

                  {listing.paid && (
                    <div className="mt-3 rounded border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-300">
                      Paid
                      {listing.buyerEmail && (
                        <div className="mt-1 text-xs text-gray-300">
                          Buyer: {listing.buyerEmail}
                        </div>
                      )}
                    </div>
                  )}

                  {listing.paid && (
                    <div className="mt-3 rounded-xl border border-white/10 bg-black/30 p-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-gray-500">
                        Shipping
                      </div>

                      {invoice?.shippingLine1 && (
                        <div className="mt-3 rounded-lg border border-[#d6aa55]/20 bg-[#d6aa55]/[0.03] p-3">
                          <div className="mb-1 text-xs uppercase tracking-widest text-[#d6aa55]/70">Ship To</div>
                          <div className="text-sm text-[#d7d7d7]">{invoice.shippingName}</div>
                          <div className="text-sm text-gray-400">{invoice.shippingLine1}</div>
                          {invoice.shippingLine2 && <div className="text-sm text-gray-400">{invoice.shippingLine2}</div>}
                          <div className="text-sm text-gray-400">{invoice.shippingCity}, {invoice.shippingState} {invoice.shippingZip}</div>
                        </div>
                      )}

                      <div className="mt-2 flex items-center gap-3 text-sm text-gray-300">
                        <span>Status: {listing.shippingStatus || "PAID"}</span>

                        {trackingUrl(
                          listing.carrier || "",
                          listing.trackingNumber || "",
                        ) && (
                          <a
                            href={trackingUrl(
                              listing.carrier || "",
                              listing.trackingNumber || "",
                            )}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-semibold text-[#e7c77f] hover:text-white"
                          >
                            Track Package →
                          </a>
                        )}
                      </div>

                      {listing.trackingNumber && (
                        <div className="mt-3 text-xs text-gray-500">
                          Tracking: {listing.carrier} {listing.trackingNumber}
                        </div>
                      )}

                      {!listing.shippingLabelUrl && !listing.trackingNumber && (
                        <button
                          type="button"
                          onClick={() => {
                            setRatesListingId(listing.id);
                            setRatesStep("form");
                            setRates([]);
                            setRatesError("");
                            setPurchasedLabel(null);
                            setShipmentId("");
                            if (savedShipFrom) {
                              setRatesFromName(savedShipFrom.name);
                              setRatesFromStreet(savedShipFrom.street1);
                              setRatesFromCity(savedShipFrom.city);
                              setRatesFromState(savedShipFrom.state);
                              setRatesFromZip(savedShipFrom.zip);
                              setRatesFromPhone(savedShipFrom.phone);
                            }
                            setShowRatesModal(true);
                          }}
                          className="mt-4 w-full rounded border border-[#d6aa55]/50 bg-[#1a1408] px-4 py-2 text-sm font-semibold text-[#e7c77f] hover:bg-[#221909]"
                        >
                          Get Rates & Print Label
                        </button>
                      )}

                      {listing.shippingLabelUrl && (
                        <button
                          type="button"
                          onClick={() => printLabel(listing.shippingLabelUrl)}
                          className="mt-4 flex w-full items-center justify-center gap-2 rounded border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/20"
                        >
                          Print Label
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setSelectedListing(listing);
                          setShippingCarrier(listing.carrier || "");
                          setShippingTracking(listing.trackingNumber || "");
                          setShowShippingModal(true);
                        }}
                        className="mt-2 w-full rounded border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-semibold text-gray-400 hover:text-white"
                      >
                        {listing.trackingNumber
                          ? "Update Tracking Manually"
                          : "Enter Tracking Manually"}
                      </button>

                      {listing.shippingStatus === "SHIPPED" && (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await client.models.MarketplaceListing.update(
                                {
                                  id: listing.id,
                                  shippingStatus: "DELIVERED",
                                  deliveredAt: new Date().toISOString(),
                                },
                                { authMode: "userPool" } as any,
                              );
                              toast.success("Marked as delivered");
                              setMarketplaceListings((prev: any[]) =>
                                prev.map((item: any) =>
                                  item.id === listing.id
                                    ? { ...item, shippingStatus: "DELIVERED" }
                                    : item,
                                ),
                              );
                            } catch (err) {
                              console.error(err);
                              toast.error("Failed to update");
                            }
                          }}
                          className="mt-2 w-full rounded border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/20"
                        >
                          Mark as Delivered
                        </button>
                      )}
                    </div>
                  )}
                  <Link
                    href={`/marketplace/${listing.id}`}
                    className="mt-4 block rounded border border-white/10 px-4 py-2 text-center text-sm text-white transition hover:bg-white/[0.05]"
                  >
                    View Listing
                  </Link>

                  {invoice && (
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <button
                        type="button"
                        onClick={() => onViewInvoice(invoice.id)}
                        className="flex-1 rounded border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white hover:bg-white/[0.08]"
                      >
                        View Invoice
                      </button>

                      <button
                        type="button"
                        onClick={() => onDownloadInvoice(invoice.id)}
                        className="flex-1 rounded border border-[#d6aa55]/30 bg-[#1a1408] px-4 py-2 text-sm font-semibold text-[#e7c77f] hover:bg-[#221909]"
                      >
                        Download Invoice
                      </button>
                    </div>
                  )}

                  {!listing.paid && listing.status !== "SOLD" && (
                    <Link
                      href={`/sell/listing/${listing.id}/edit`}
                      className="mt-3 block rounded border border-[#d6aa55]/20 bg-[#1a1408] px-4 py-2 text-center text-sm text-[#e7c77f] transition hover:bg-[#221909]"
                    >
                      Edit Listing
                    </Link>
                  )}

                  <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-[10px] uppercase tracking-[0.16em] text-gray-600">
                    {listing.createdAt && (
                      <span>Listed {new Date(listing.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                    )}
                    {listing.paidAt && (
                      <span className="text-emerald-700">Sold {new Date(listing.paidAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                    )}
                  </div>

                  {(listing.sellerPublicId || listing.sellerUserId) && (
                    <div className="mt-5 border-t border-white/10 pt-4 text-xs uppercase tracking-[0.22em] text-gray-500">
                      Seller ID{" "}
                      <span className="text-[#e7c77f]">
                        {listing.sellerPublicId ||
                          `RAH-${String(listing.sellerUserId)
                            .replace(/[^a-zA-Z0-9]/g, "")
                            .slice(0, 10)
                            .toUpperCase()}`}
                      </span>
                    </div>
                  )}

                  <div className="mt-3 flex gap-2">
                    {listing.status === "ACTIVE" && (
                      <>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await client.models.MarketplaceListing.update(
                                {
                                  id: listing.id,
                                  status: "PAUSED",
                                },
                                { authMode: "userPool" } as any,
                              );

                              toast.success("Listing paused");

                              setMarketplaceListings((prev: any[]) =>
                                prev.map((item: any) =>
                                  item.id === listing.id
                                    ? { ...item, status: "PAUSED" }
                                    : item,
                                ),
                              );
                            } catch (err) {
                              console.error(err);
                              toast.error("Failed to pause listing");
                            }
                          }}
                          className="flex-1 rounded border border-yellow-500/20 bg-yellow-500/10 px-4 py-2 text-sm text-yellow-300 hover:bg-yellow-500/20"
                        >
                          Pause
                        </button>

                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await client.models.MarketplaceListing.update(
                                {
                                  id: listing.id,
                                  status: "SOLD",
                                  sold: true,
                                },
                                { authMode: "userPool" } as any,
                              );

                              toast.success("Listing marked sold");

                              setMarketplaceListings((prev: any[]) =>
                                prev.map((item: any) =>
                                  item.id === listing.id
                                    ? { ...item, status: "SOLD", sold: true }
                                    : item,
                                ),
                              );
                            } catch (err) {
                              console.error(err);
                              toast.error("Failed to mark sold");
                            }
                          }}
                          className="flex-1 rounded border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300 hover:bg-emerald-500/20"
                        >
                          Mark Sold
                        </button>
                      </>
                    )}

                    {listing.status === "PAUSED" && (
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await client.models.MarketplaceListing.update(
                              {
                                id: listing.id,
                                status: "ACTIVE",
                              },
                              { authMode: "userPool" } as any,
                            );

                            toast.success("Listing activated");

                            setMarketplaceListings((prev: any[]) =>
                              prev.map((item: any) =>
                                item.id === listing.id
                                  ? { ...item, status: "ACTIVE" }
                                  : item,
                              ),
                            );
                          } catch (err) {
                            console.error(err);
                            toast.error("Failed to activate listing");
                          }
                        }}
                        className="w-full rounded border border-[#d6aa55]/20 bg-[#1a1408] px-4 py-2 text-sm text-[#e7c77f] hover:bg-[#221909]"
                      >
                        Activate
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await client.models.MarketplaceListing.update(
                            { id: listing.id, featured: !listing.featured },
                            { authMode: "userPool" } as any,
                          );
                          toast.success(listing.featured ? "Removed from featured" : "Marked as featured");
                          setMarketplaceListings((prev: any[]) =>
                            prev.map((item: any) =>
                              item.id === listing.id
                                ? { ...item, featured: !item.featured }
                                : item,
                            ),
                          );
                        } catch (err) {
                          console.error(err);
                          toast.error("Failed to update");
                        }
                      }}
                      className={`w-full rounded border px-4 py-2 text-sm transition ${
                        listing.featured
                          ? "border-[#d6aa55]/40 bg-[#d6aa55]/10 text-[#e7c77f] hover:bg-[#d6aa55]/20"
                          : "border-white/10 bg-white/[0.03] text-gray-400 hover:border-[#d6aa55]/30 hover:text-[#e7c77f]"
                      }`}
                    >
                      {listing.featured ? "★ Featured" : "★ Feature"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {showShippingModal && selectedListing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md rounded-2xl border border-[#d6aa55]/30 bg-[#0b0c0e] p-6 shadow-[0_30px_100px_rgba(0,0,0,0.65)]">
            <h3 className="font-serif text-2xl text-[#c0c0c0]">
              Update Shipping
            </h3>

            <p className="mt-2 text-sm text-gray-400">
              Add carrier and tracking details for this marketplace sale.
            </p>

            <div className="mt-5 space-y-4">
              <input
                value={shippingCarrier}
                onChange={(e) => setShippingCarrier(e.target.value)}
                placeholder="Carrier — USPS, UPS, FedEx"
                className="w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-white outline-none placeholder:text-gray-600 focus:border-[#d6aa55]/50"
              />

              <input
                value={shippingTracking}
                onChange={(e) => setShippingTracking(e.target.value)}
                placeholder="Tracking number"
                className="w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-white outline-none placeholder:text-gray-600 focus:border-[#d6aa55]/50"
              />
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowShippingModal(false);
                  setSelectedListing(null);
                }}
                className="flex-1 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-semibold text-white hover:bg-white/[0.06]"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={savingShipping}
                onClick={async () => {
                  if (!shippingCarrier.trim()) {
                    toast.error("Enter a carrier");
                    return;
                  }

                  if (!shippingTracking.trim()) {
                    toast.error("Enter a tracking number");
                    return;
                  }

                  try {
                    setSavingShipping(true);

                    await client.models.MarketplaceListing.update(
                      {
                        id: selectedListing.id,
                        shippingStatus: "SHIPPED",
                        carrier: shippingCarrier.trim(),
                        trackingNumber: shippingTracking.trim(),
                        shippedAt: new Date().toISOString(),
                      },
                      { authMode: "userPool" } as any,
                    );

                    toast.success("Shipping info updated");
                    setShowShippingModal(false);
                    setSelectedListing(null);
                    window.location.reload();
                  } catch (err) {
                    console.error(err);
                    toast.error("Failed to update shipping");
                  } finally {
                    setSavingShipping(false);
                  }
                }}
                className="flex-1 rounded-xl border border-[#d6aa55]/30 bg-[#1a1408] px-4 py-3 text-sm font-semibold text-[#e7c77f] hover:bg-[#221909] disabled:opacity-50"
              >
                {savingShipping ? "Saving..." : "Save Shipping"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showRatesModal && (
        <EasyPostModal
          itemId={ratesListingId}
          itemType="LISTING"
          client={client}
          step={ratesStep}
          setStep={setRatesStep}
          weight={ratesWeight} setWeight={setRatesWeight}
          length={ratesLength} setLength={setRatesLength}
          width={ratesWidth} setWidth={setRatesWidth}
          height={ratesHeight} setHeight={setRatesHeight}
          fromName={ratesFromName} setFromName={setRatesFromName}
          fromStreet={ratesFromStreet} setFromStreet={setRatesFromStreet}
          fromStreet2={ratesFromStreet2} setFromStreet2={setRatesFromStreet2}
          fromCity={ratesFromCity} setFromCity={setRatesFromCity}
          fromState={ratesFromState} setFromState={setRatesFromState}
          fromZip={ratesFromZip} setFromZip={setRatesFromZip}
          fromPhone={ratesFromPhone} setFromPhone={setRatesFromPhone}
          fetchingRates={fetchingRates} setFetchingRates={setFetchingRates}
          shipmentId={shipmentId} setShipmentId={setShipmentId}
          rates={rates} setRates={setRates}
          ratesError={ratesError} setRatesError={setRatesError}
          purchasedLabel={purchasedLabel} setPurchasedLabel={setPurchasedLabel}
          onClose={() => setShowRatesModal(false)}
          onSuccess={() => { setShowRatesModal(false); window.location.reload(); }}
        />
      )}
    </section>
  );
}

function EasyPostModal({
  itemId, itemType, client,
  step, setStep,
  weight, setWeight,
  length, setLength,
  width, setWidth,
  height, setHeight,
  fromName, setFromName,
  fromStreet, setFromStreet,
  fromStreet2, setFromStreet2,
  fromCity, setFromCity,
  fromState, setFromState,
  fromZip, setFromZip,
  fromPhone, setFromPhone,
  fetchingRates, setFetchingRates,
  shipmentId, setShipmentId,
  rates, setRates,
  ratesError, setRatesError,
  purchasedLabel, setPurchasedLabel,
  onClose, onSuccess,
}: any) {
  const [purchasing, setPurchasing] = useState(false);
  const [saveAsDefault, setSaveAsDefault] = useState(false);

  async function handleGetRates() {
    if (!weight) { toast.error("Enter package weight"); return; }
    if (!fromName || !fromStreet || !fromCity || !fromState || !fromZip) {
      toast.error("Fill in all ship-from address fields");
      return;
    }
    setFetchingRates(true);
    setRatesError("");
    try {
      if (saveAsDefault) {
        client.mutations.saveSellerPrefs(
          { shipFromName: fromName, shipFromStreet1: fromStreet, shipFromStreet2: fromStreet2 || null, shipFromCity: fromCity, shipFromState: fromState, shipFromZip: fromZip, shipFromPhone: fromPhone || null },
          { authMode: "userPool" } as any,
        ).catch(() => { /* non-fatal */ });
      }
      const result = await client.mutations.getShippingRates(
        {
          itemId,
          itemType,
          weight: parseFloat(weight),
          ...(length ? { length: parseFloat(length) } : {}),
          ...(width ? { width: parseFloat(width) } : {}),
          ...(height ? { height: parseFloat(height) } : {}),
          fromName,
          fromStreet1: fromStreet,
          ...(fromStreet2 ? { fromStreet2 } : {}),
          fromCity,
          fromState,
          fromZip,
          ...(fromPhone ? { fromPhone } : {}),
        },
        { authMode: "userPool" } as any,
      );
      const data = (result as any).data;
      if (data?.error) { setRatesError(data.error); return; }
      const parsed = JSON.parse(data?.ratesJson || "[]");
      setShipmentId(data?.shipmentId || "");
      setRates(parsed);
      setStep("rates");
    } catch (err: any) {
      setRatesError(err?.message || "Failed to get rates");
    } finally {
      setFetchingRates(false);
    }
  }

  async function handlePurchase(rate: any) {
    setPurchasing(true);
    try {
      const result = await client.mutations.purchaseShippingLabel(
        { itemId, itemType, shipmentId, rateId: rate.id },
        { authMode: "userPool" } as any,
      );
      const data = (result as any).data;
      if (!data?.success) {
        toast.error(data?.error || "Purchase failed");
        return;
      }
      setPurchasedLabel({ trackingNumber: data.trackingNumber, carrier: data.carrier, labelUrl: data.labelUrl });
      setStep("purchasing");
    } catch (err: any) {
      toast.error(err?.message || "Purchase failed");
    } finally {
      setPurchasing(false);
    }
  }

  const inputCls = "w-full rounded-lg border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none placeholder:text-gray-600 focus:border-[#d6aa55]/50";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 px-4 py-8">
      <div className="w-full max-w-lg rounded-2xl border border-[#d6aa55]/30 bg-[#0b0c0e] p-6 shadow-[0_30px_100px_rgba(0,0,0,0.65)]">
        <div className="flex items-center justify-between">
          <h3 className="font-serif text-2xl text-[#c0c0c0]">Shipping Label</h3>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-white text-xl">✕</button>
        </div>

        {step === "form" && (
          <>
            <p className="mt-2 text-sm text-gray-400">Enter package details and your ship-from address to compare carrier rates.</p>

            <div className="mt-5 space-y-4">
              <div>
                <div className="mb-2 text-[10px] uppercase tracking-[0.15em] text-gray-500">Package</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-[10px] text-gray-500">Weight (oz)*</label>
                    <input value={weight} onChange={(e: any) => setWeight(e.target.value)} type="number" placeholder="e.g. 4" className={inputCls} />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] text-gray-500">Length (in)</label>
                    <input value={length} onChange={(e: any) => setLength(e.target.value)} type="number" placeholder="Optional" className={inputCls} />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] text-gray-500">Width (in)</label>
                    <input value={width} onChange={(e: any) => setWidth(e.target.value)} type="number" placeholder="Optional" className={inputCls} />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] text-gray-500">Height (in)</label>
                    <input value={height} onChange={(e: any) => setHeight(e.target.value)} type="number" placeholder="Optional" className={inputCls} />
                  </div>
                </div>
              </div>

              <div>
                <div className="mb-2 text-[10px] uppercase tracking-[0.15em] text-gray-500">Ship From</div>
                <div className="space-y-2">
                  <input value={fromName} onChange={(e: any) => setFromName(e.target.value)} placeholder="Full name or company*" className={inputCls} />
                  <input value={fromStreet} onChange={(e: any) => setFromStreet(e.target.value)} placeholder="Street address*" className={inputCls} />
                  <input value={fromStreet2} onChange={(e: any) => setFromStreet2(e.target.value)} placeholder="Apt, Suite, Unit (optional)" className={inputCls} />
                  <div className="grid grid-cols-3 gap-2">
                    <input value={fromCity} onChange={(e: any) => setFromCity(e.target.value)} placeholder="City*" className={inputCls} />
                    <input value={fromState} onChange={(e: any) => setFromState(e.target.value)} placeholder="State*" maxLength={2} className={inputCls} />
                    <input value={fromZip} onChange={(e: any) => setFromZip(e.target.value)} placeholder="ZIP*" className={inputCls} />
                  </div>
                  <input value={fromPhone} onChange={(e: any) => setFromPhone(e.target.value)} placeholder="Phone number (required by UPS/FedEx)" type="tel" className={inputCls} />
                </div>
              </div>
            </div>

            {ratesError && <p className="mt-3 text-sm text-red-400">{ratesError}</p>}

            <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-gray-400 hover:text-white">
              <input
                type="checkbox"
                checked={saveAsDefault}
                onChange={(e: any) => setSaveAsDefault(e.target.checked)}
                className="h-4 w-4 accent-[#d6aa55]"
              />
              Save as my default ship-from address
            </label>

            <div className="mt-4 flex gap-3">
              <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-semibold text-white hover:bg-white/[0.06]">Cancel</button>
              <button type="button" disabled={fetchingRates} onClick={handleGetRates} className="flex-1 rounded-xl border border-[#d6aa55]/30 bg-[#1a1408] px-4 py-3 text-sm font-semibold text-[#e7c77f] hover:bg-[#221909] disabled:opacity-50">
                {fetchingRates ? "Getting rates…" : "Get Rates →"}
              </button>
            </div>
          </>
        )}

        {step === "rates" && (
          <>
            <p className="mt-2 text-sm text-gray-400">Select a shipping option. Label will be purchased immediately.</p>

            {rates.length === 0 && <p className="mt-4 text-sm text-gray-500">No rates available for these dimensions.</p>}

            <div className="mt-4 space-y-2 max-h-96 overflow-y-auto pr-1">
              {rates.map((rate: any) => (
                <div key={rate.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                  <div>
                    <div className="font-semibold text-white">{rate.carrier} — {rate.service}</div>
                    <div className="mt-0.5 text-xs text-gray-500">
                      {rate.delivery_days ? `Est. ${rate.delivery_days} day${rate.delivery_days > 1 ? "s" : ""}` : "Estimated delivery varies"}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="font-semibold text-[#e7c77f]">${parseFloat(rate.rate).toFixed(2)}</div>
                      <div className="text-[10px] text-gray-600">{rate.currency}</div>
                    </div>
                    <button
                      type="button"
                      disabled={purchasing}
                      onClick={() => handlePurchase(rate)}
                      className="rounded-lg border border-[#d6aa55]/40 bg-[#1a1408] px-3 py-1.5 text-xs font-semibold text-[#e7c77f] hover:bg-[#221909] disabled:opacity-50"
                    >
                      {purchasing ? "…" : "Buy"}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button type="button" onClick={() => setStep("form")} className="mt-4 text-xs text-gray-500 hover:text-white">← Back</button>
          </>
        )}

        {step === "purchasing" && purchasedLabel && (
          <>
            <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.07] p-5">
              <div className="text-sm font-semibold text-emerald-300">Label purchased successfully</div>
              <div className="mt-3 space-y-1 text-sm text-gray-300">
                <div>Carrier: <span className="text-white">{purchasedLabel.carrier}</span></div>
                <div>Tracking: <span className="font-mono text-white">{purchasedLabel.trackingNumber}</span></div>
              </div>
              {purchasedLabel.labelUrl && (
                <button
                  type="button"
                  onClick={() => printLabel(purchasedLabel.labelUrl)}
                  className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/20"
                >
                  Print Label
                </button>
              )}
            </div>
            <button type="button" onClick={onSuccess} className="mt-4 w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-semibold text-white hover:bg-white/[0.06]">Done</button>
          </>
        )}
      </div>
    </div>
  );
}
