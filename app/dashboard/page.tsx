"use client";

import "@/lib/amplifyclient";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getCurrentUser, fetchAuthSession } from "aws-amplify/auth";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";
import {
  BadgeCheck,
  Gavel,
  Heart,
  Trophy,
  Tag,
  Archive,
  ShoppingCart,
  Bell,
  ClipboardList,
} from "lucide-react";
import { moneyToNumber } from "@/lib/money";
import { cdnUrl } from "@/lib/cdn";
import { updateBuyerPresence } from "@/lib/updateBuyerPresence";
import { isAdminUser } from "@/lib/sellers";
import { getTier } from "@/lib/tiers";
import { DashboardFilterBar, matchesSearch } from "@/app/components/DashboardFilters";

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

function makeBidderDisplayName(value: string) {
  if (!value) return "";

  if (value.startsWith("Bidder ")) {
    return value;
  }

  return `Bidder ${value.slice(0, 4).toUpperCase()}`;
}

function resolveAuctionImage(auction: any) {
  const rawImage =
    auction?.thumbImages?.[0] || auction?.images?.[0] || auction?.image || "";

  return cdnUrl(rawImage);
}

function formatCurrency(amount: number) {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function calculateAcceptedOfferTotal(listing: any) {
  const subtotal = moneyToNumber(
    listing.acceptedOfferAmount || listing.offerAmount || listing.price || 0,
  );

  const taxRate = Number(listing.taxRate || 6.625);
  const tax = listing.chargeTax ? subtotal * (taxRate / 100) : 0;

  return {
    subtotal,
    tax,
    total: subtotal + tax,
  };
}

export default function DashboardPage() {
  const clientRef = React.useRef(generateClient<Schema>());
  const client = clientRef.current;

  const [bids, setBids] = useState<any[]>([]);
  const [auctions, setAuctions] = useState<any[]>([]);
  const [marketplacePurchases, setMarketplacePurchases] = useState<any[]>([]);
  const [acceptedOffers, setAcceptedOffers] = useState<any[]>([]);
  const [buyerOffers, setBuyerOffers] = useState<any[]>([]);
  const [offerListings, setOfferListings] = useState<any[]>([]);
  const [watchlist, setWatchlist] = useState<any[]>([]);
  const [loadingUser, setLoadingUser] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [buyerProfile, setBuyerProfile] = useState<any>(null);
  const [now, setNow] = useState(Date.now());
  const [invoices, setInvoices] = useState<any[]>([]);
  const [userIsAdmin, setUserIsAdmin] = useState(false);

  const dashboardRefreshTimerRef = React.useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  function scheduleDashboardRefresh(loadDashboard: () => void) {
    if (dashboardRefreshTimerRef.current) {
      clearTimeout(dashboardRefreshTimerRef.current);
    }

    dashboardRefreshTimerRef.current = setTimeout(() => {
      loadDashboard();
    }, 500);
  }

  const [activeTab, setActiveTab] = useState<"auctions" | "marketplace">(
    "auctions",
  );
  const [buyerSearch, setBuyerSearch] = useState("");
  // Resolve an auction's title by id (bids don't carry the title directly).
  const auctionTitleById = (id: any) =>
    auctions.find((a: any) => String(a.id) === String(id))?.title || "";
  const bidMatches = (bid: any) => matchesSearch(auctionTitleById(bid.auctionId), buyerSearch);

  const userKey = user?.signInDetails?.loginId || user?.username || "";
  const userKeyLower = userKey.toLowerCase();
  const userId = user?.userId || user?.username || "";

  useEffect(() => {
    async function loadUser() {
      try {
        const currentUser = await getCurrentUser();
        setUser(currentUser);
        setUserIsAdmin(await isAdminUser());
        updateBuyerPresence("/dashboard");
      } catch {
        setUser(null);
      } finally {
        setLoadingUser(false);
      }
    }

    loadUser();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!userKey || !userId) return;

    async function loadDashboard() {
      try {
        const bidResult = await client.models.Bid.bidsByBidder(
          { bidderUserId: userId },
          {
            authMode: "apiKey",
            limit: 1000,
          } as any,
        );

        const emailBidResult = await client.models.Bid.bidsByBidderEmail(
          { bidderEmail: userKey },
          {
            authMode: "apiKey",
            limit: 1000,
          } as any,
        );

        const auctionResult = await client.models.Auction.list({
          authMode: "apiKey",
        } as any);

        const stateResult = await client.models.AuctionState.list({
          authMode: "apiKey",
        } as any);

        let profile = null;

        if (client.models.BuyerProfile) {
          const profileResult = await client.models.BuyerProfile.get(
            { userId },
            {
              authMode: "userPool",
            } as any,
          );

          profile = profileResult.data || null;

          if (!profile && userKey) {
            const profileByEmailResult =
              await client.models.BuyerProfile.buyerProfileByEmail(
                { email: userKey },
                { authMode: "userPool" } as any,
              );

            profile = profileByEmailResult.data?.[0] || null;
          }
        } else {
          console.warn(
            "BuyerProfile model is missing from amplify_outputs.json",
          );
        }

        setBuyerProfile(profile);

        const auctionsWithLiveState = auctionResult.data.map((auction: any) => {
          const state = stateResult.data.find(
            (s: any) => s.auctionId === auction.id,
          );

          const leaderUserId =
            state?.leaderUserId ||
            auction.winnerUserId ||
            auction.winnerEmail ||
            "";

          return {
            ...auction,
            price: state?.currentPrice || auction.price,
            winnerUserId: leaderUserId,
            winnerDisplayName: makeBidderDisplayName(leaderUserId),
            winnerEmail: leaderUserId,
            bids: state?.bidCount ?? auction.bids,
            imageUrl: resolveAuctionImage(auction),
          };
        });
        const marketplaceResult = await client.models.MarketplaceListing.list({
          filter: {
            buyerEmail: { eq: userKeyLower },
          },
          authMode: "apiKey",
        } as any);

        const resolvedMarketplacePurchases = (marketplaceResult.data || []).map(
          (listing: any) => {
            const rawImage =
              listing.thumbImages?.[0] ||
              listing.image ||
              listing.images?.[0] ||
              "";

            return {
              ...listing,
              imageUrl: cdnUrl(rawImage),
            };
          },
        );

        const buyerOfferResult = await client.models.Offer.list({
          filter: {
            buyerEmail: { eq: userKeyLower },
          },
          authMode: "userPool",
        } as any);

        setBuyerOffers(buyerOfferResult.data || []);

        const offerListingIds = Array.from(
          new Set(
            (buyerOfferResult.data || [])
              .map((offer: any) => offer.listingId)
              .filter(Boolean),
          ),
        );

        const offerListingResults = await Promise.all(
          offerListingIds.map((listingId: any) =>
            client.models.MarketplaceListing.get({ id: listingId }, {
              authMode: "apiKey",
            } as any).catch(() => null),
          ),
        );

        const resolvedOfferListings = offerListingResults
          .map((result: any) => result?.data)
          .filter(Boolean)
          .map((listing: any) => {
            const rawImage =
              listing.thumbImages?.[0] ||
              listing.images?.[0] ||
              listing.image ||
              "";

            return {
              ...listing,
              imageUrl: cdnUrl(rawImage),
            };
          });

        setOfferListings(resolvedOfferListings);

        setMarketplacePurchases(resolvedMarketplacePurchases);

        const invoiceResult = await client.models.Invoice.list({
          authMode: "userPool",
        } as any);

        setInvoices(invoiceResult.data || []);

        const acceptedMarketplaceResult =
          await client.models.MarketplaceListing.list({
            filter: {
              buyerEmail: { eq: userKeyLower },
              status: { eq: "OFFER_ACCEPTED" },
            },
            authMode: "apiKey",
          } as any);

        const resolvedAcceptedOffers = (
          acceptedMarketplaceResult.data || []
        ).map((listing: any) => {
          const rawImage =
            listing.thumbImages?.[0] ||
            listing.image ||
            listing.images?.[0] ||
            "";

          return {
            ...listing,
            imageUrl: cdnUrl(rawImage),
          };
        });

        setAcceptedOffers(resolvedAcceptedOffers);
        const combinedBids = [
          ...(bidResult.data || []),
          ...(emailBidResult.data || []),
        ];

        const uniqueBids = Array.from(
          new Map(combinedBids.map((bid: any) => [bid.id, bid])).values(),
        );

        const meValues = [
          userId,
          userKey,
          makeBidderDisplayName(userId),
          makeBidderDisplayName(userKey),
        ];

        const syntheticWinningBids = auctionsWithLiveState
          .filter(
            (auction: any) =>
              meValues.includes(String(auction.winnerUserId || "")) ||
              meValues.includes(String(auction.winnerEmail || "")) ||
              meValues.includes(String(auction.winnerDisplayName || "")),
          )
          .map((auction: any) => ({
            id: `synthetic-${auction.id}`,
            auctionId: auction.id,
            bidderUserId: userId,
            bidderEmail: userKey,
            bidderName: makeBidderDisplayName(userId),
            amount: auction.price,
            maxBid: auction.price,
          }));

        const finalBids = Array.from(
          new Map(
            [...uniqueBids, ...syntheticWinningBids].map((bid: any) => [
              bid.id,
              bid,
            ]),
          ).values(),
        );

        setBids(finalBids);
        setAuctions(auctionsWithLiveState);
      } catch (err) {
        console.error("DASHBOARD LOAD ERROR", err);
      }
    }

    loadDashboard();

    window.addEventListener("focus", loadDashboard);
    window.addEventListener("pageshow", loadDashboard);
    window.addEventListener("bid-updated", loadDashboard);

    const bidCreateSub = client.models.Bid.onCreate({
      authMode: "apiKey",
    }).subscribe({
      next: () => scheduleDashboardRefresh(loadDashboard),
    });

    const bidUpdateSub = client.models.Bid.onUpdate({
      authMode: "apiKey",
    }).subscribe({
      next: () => scheduleDashboardRefresh(loadDashboard),
    });

    const auctionUpdateSub = client.models.Auction.onUpdate({
      authMode: "apiKey",
    }).subscribe({
      next: () => scheduleDashboardRefresh(loadDashboard),
    });

    const stateUpdateSub = client.models.AuctionState.onUpdate({
      authMode: "apiKey",
    }).subscribe({
      next: () => scheduleDashboardRefresh(loadDashboard),
    });

    const offerCreateSub = client.models.Offer.onCreate({
      authMode: "userPool",
    }).subscribe({
      next: () => scheduleDashboardRefresh(loadDashboard),
      error: (e) => console.error("Offer create sub error:", e),
    });

    const offerUpdateSub = client.models.Offer.onUpdate({
      authMode: "userPool",
    }).subscribe({
      next: () => scheduleDashboardRefresh(loadDashboard),
      error: (e) => console.error("Offer update sub error:", e),
    });

    const listingUpdateSub = client.models.MarketplaceListing.onUpdate({
      authMode: "apiKey",
    }).subscribe({
      next: () => scheduleDashboardRefresh(loadDashboard),
      error: (e) => console.error("Marketplace listing update sub error:", e),
    });

    return () => {
      bidCreateSub.unsubscribe();
      bidUpdateSub.unsubscribe();
      auctionUpdateSub.unsubscribe();
      stateUpdateSub.unsubscribe();

      offerCreateSub.unsubscribe();
      offerUpdateSub.unsubscribe();
      listingUpdateSub.unsubscribe();

      window.removeEventListener("focus", loadDashboard);
      window.removeEventListener("pageshow", loadDashboard);
      window.removeEventListener("bid-updated", loadDashboard);
    };
  }, [userKey, userId]);

  useEffect(() => {
    if (!userKey) return;

    async function loadWatchlist() {
      const result = await client.models.WatchlistItem.list({
        authMode: "userPool",
      });

      setWatchlist(result.data || []);
    }

    loadWatchlist();

    window.addEventListener("focus", loadWatchlist);
    window.addEventListener("pageshow", loadWatchlist);
    window.addEventListener("watchlist-updated", loadWatchlist);
    window.addEventListener("storage", loadWatchlist);

    return () => {
      window.removeEventListener("focus", loadWatchlist);
      window.removeEventListener("pageshow", loadWatchlist);
      window.removeEventListener("watchlist-updated", loadWatchlist);
      window.removeEventListener("storage", loadWatchlist);
    };
  }, [userKey]);

  const {
    myWinningBids,
    outbidLive,
    myWins,
    unpaidWins,
    paidWins,
    reserveNotMet,
    lostAuctions,
  } = useMemo(() => {
    const isAuctionOver = (a: any) =>
      a.ended === true ||
      a.status === "SOLD" ||
      a.status === "CANCELLED" ||
      a.status === "PAID" ||
      (a.endsAt && new Date(a.endsAt).getTime() <= now);

    const ended = auctions.filter((a: any) => isAuctionOver(a));

    const live = auctions.filter((a: any) => !isAuctionOver(a));

    const isMeWinning = (auction: any) => {
      const winners = [
        auction.winnerUserId,
        auction.winnerEmail,
        auction.winnerDisplayName,
      ].map((v) => String(v || ""));

      const me = [
        user?.userId,
        user?.username,
        userKey,
        makeBidderDisplayName(user?.userId || ""),
        makeBidderDisplayName(user?.username || ""),
        makeBidderDisplayName(userKey || ""),
      ].map((v) => String(v || ""));

      return winners.some((winner) => me.includes(winner));
    };

    const highestMyBidByAuction = new Map<string, any>();

    for (const bid of bids) {
      const existing = highestMyBidByAuction.get(bid.auctionId);
      if (
        !existing ||
        moneyToNumber(bid.maxBid || bid.amount) >
          moneyToNumber(existing.maxBid || existing.amount)
      ) {
        highestMyBidByAuction.set(bid.auctionId, bid);
      }
    }

    const highestMyBids = Array.from(highestMyBidByAuction.values());

    const winningLive = highestMyBids.filter((bid: any) => {
      const auction = live.find((a: any) => a.id === bid.auctionId);

      if (!auction) return false;

      return isMeWinning(auction);
    });

    const outbid = highestMyBids.filter((bid: any) => {
      const auction = live.find((a: any) => a.id === bid.auctionId);

      if (!auction) return false;

      return !isMeWinning(auction);
    });

    const wins = ended
      .map((auction: any) => {
        const myBid = highestMyBidByAuction.get(auction.id);
        if (!myBid) return null;

        // Must actually be the winning bidder — not merely an underbidder whose
        // highest bid happened to reach the final price (proxy bidding can do
        // that). Otherwise the auction shows as a "win" for losing bidders too.
        if (!isMeWinning(auction)) return null;

        const finalPrice = moneyToNumber(auction.price);
        const reservePrice = moneyToNumber(auction.reservePrice);
        const reserveMet = !auction.reservePrice || finalPrice >= reservePrice;

        if (!reserveMet) return null;

        return {
          ...myBid,
          auctionId: auction.id,
          amount: auction.price,
        };
      })
      .filter(Boolean);

    const unpaid = wins.filter((bid: any) => {
      const auction = auctions.find((a: any) => a.id === bid.auctionId);
      return auction && auction.paid !== true;
    });

    const paid = wins.filter((bid: any) => {
      const auction = auctions.find((a: any) => a.id === bid.auctionId);
      return auction && auction.paid === true;
    });

    const reserveMisses = ended.filter((auction: any) => {
      const myBid = highestMyBidByAuction.get(auction.id);

      if (!myBid) return false;

      const reservePrice = moneyToNumber(auction.reservePrice || 0);

      const finalPrice = moneyToNumber(auction.price || 0);

      const userWon = isMeWinning(auction);

      return userWon && reservePrice > 0 && finalPrice < reservePrice;
    });

    const lost = ended.filter((auction: any) => {
      const myBid = highestMyBidByAuction.get(auction.id);
      if (!myBid) return false;

      return moneyToNumber(myBid.amount) < moneyToNumber(auction.price);
    });

    return {
      myWinningBids: winningLive,
      outbidLive: outbid,
      myWins: wins,
      unpaidWins: unpaid,
      paidWins: paid,
      reserveNotMet: reserveMisses,
      lostAuctions: lost,
    };
  }, [bids, auctions, user, userKey, now]);

  const buyerTierCode = buyerProfile?.verificationTier || "BASIC";
  const buyerTier = getTier(buyerTierCode);
  const buyerBidLimit = Number(buyerProfile?.bidLimit || buyerTier.limit);

  const activeWatchlist = watchlist.filter((item: any) => {
    if (!item.auctionId) return false;

    const auction = auctions.find(
      (a: any) => String(a.id) === String(item.auctionId),
    );

    if (!auction) return false;

    const isEnded = auction.endsAt && new Date(auction.endsAt).getTime() <= now;

    return !isEnded;
  });

  async function removeFromWatchlist(itemId: string) {
    await client.models.WatchlistItem.delete(
      { id: itemId },
      { authMode: "userPool" },
    );

    setWatchlist((prev) => prev.filter((item: any) => item.id !== itemId));
    localStorage.setItem("watchlist-updated-at", String(Date.now()));
    window.dispatchEvent(new Event("watchlist-updated"));
  }

  async function dismissOfferNotification(offerId: string) {
    await client.models.Offer.update(
      {
        id: offerId,
        read: true,
      },
      {
        authMode: "userPool",
      } as any,
    );

    setBuyerOffers((prev: any[]) =>
      prev.map((offer: any) =>
        offer.id === offerId ? { ...offer, read: true } : offer,
      ),
    );
  }

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

  if (loadingUser) {
    return (
      <div className="min-h-screen bg-[#050607] p-10 text-white">
        Loading...
      </div>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050607] px-6 text-white">
        <div className="max-w-md rounded-xl border border-white/10 bg-white/[0.03] p-8 text-center">
          <h1 className="font-serif text-3xl text-[#c0c0c0]">
            Buyer Sign In Required
          </h1>

          <p className="mt-3 text-gray-400">
            Please sign in to view your dashboard, bids, watchlist, and auction
            results.
          </p>

          <Link
            href="/signin"
            className="mt-6 inline-block rounded bg-[#c0c0c0] px-5 py-3 font-semibold text-black"
          >
            Sign In
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050607] px-6 py-12 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="text-center">
          <h1 className="font-serif text-5xl text-[#c0c0c0]">
            Buyer Dashboard
          </h1>

          <div className="mx-auto mt-3 h-px w-72 bg-gradient-to-r from-transparent via-[#d6aa55]/70 to-transparent" />

          <p className="mt-5 text-gray-400">
            Track your bids, watchlist and purchases all in one place
          </p>

          <Link
            href="/bidder-agreement"
            className="mt-5 inline-block text-sm font-semibold text-[#e7c77f] underline hover:text-white"
          >
            View Buyer & Bidder Agreement
          </Link>
        </div>

        <div className="mt-10 grid grid-cols-2 gap-4 sm:mx-auto sm:max-w-lg">
          <button
            type="button"
            onClick={() => setActiveTab("auctions")}
            className={`group flex min-h-36 flex-col items-center justify-center rounded-2xl border px-4 py-5 text-center transition hover:-translate-y-1 ${
              activeTab === "auctions"
                ? "border-[#d6aa55]/60 bg-[#1a1408]"
                : "border-[#d6aa55]/30 bg-[#1a1408]/60 hover:bg-[#1a1408]"
            }`}
          >
            <Gavel className="mb-4 h-8 w-8 text-[#e7c77f]" />
            <div className="text-base font-bold text-white">Auctions</div>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("marketplace")}
            className={`group flex min-h-36 flex-col items-center justify-center rounded-2xl border px-4 py-5 text-center transition hover:-translate-y-1 ${
              activeTab === "marketplace"
                ? "border-[#d6aa55]/60 bg-[#1a1408]"
                : "border-[#d6aa55]/30 bg-[#1a1408]/60 hover:bg-[#1a1408]"
            }`}
          >
            <Tag className="mb-4 h-8 w-8 text-[#e7c77f]" />
            <div className="text-base font-bold text-white">Marketplace</div>
          </button>
        </div>

        {/* Divider between in-page tabs (above) and navigation/actions (below) */}
        <div className="mx-auto mt-6 h-px max-w-3xl bg-white/10" />

        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
          <Link
            href="/auctions"
            className="group flex min-h-36 flex-col items-center justify-center rounded-2xl border border-[#d6aa55]/30 bg-[#1a1408]/60 px-4 py-5 text-center transition hover:-translate-y-1 hover:bg-[#1a1408]"
          >
            <Gavel className="mb-4 h-8 w-8 text-[#e7c77f]" />
            <div className="text-base font-bold text-white">
              Browse Auctions
            </div>
          </Link>

          <Link
            href="/marketplace"
            className="group flex min-h-36 flex-col items-center justify-center rounded-2xl border border-[#d6aa55]/30 bg-[#1a1408]/60 px-4 py-5 text-center transition hover:-translate-y-1 hover:bg-[#1a1408]"
          >
            <Tag className="mb-4 h-8 w-8 text-[#e7c77f]" />
            <div className="text-base font-bold text-white">
              Shop Marketplace
            </div>
          </Link>

          <Link
            href="/cart"
            className="group flex min-h-36 flex-col items-center justify-center rounded-2xl border border-[#d6aa55]/30 bg-[#1a1408]/60 px-4 py-5 text-center transition hover:-translate-y-1 hover:bg-[#1a1408]"
          >
            <ShoppingCart className="mb-4 h-8 w-8 text-[#e7c77f]" />
            <div className="text-base font-bold text-white">Payment Center</div>
          </Link>

          <Link
            href="/auctions/results"
            className="group flex min-h-36 flex-col items-center justify-center rounded-2xl border border-[#d6aa55]/30 bg-[#1a1408]/60 px-4 py-5 text-center transition hover:-translate-y-1 hover:bg-[#1a1408]"
          >
            <Archive className="mb-4 h-8 w-8 text-[#e7c77f]" />
            <div className="text-base font-bold text-white">
              Results Archive
            </div>
          </Link>

          <Link
            href="/dashboard/bids"
            className="group flex min-h-36 flex-col items-center justify-center rounded-2xl border border-[#d6aa55]/30 bg-[#1a1408]/60 px-4 py-5 text-center transition hover:-translate-y-1 hover:bg-[#1a1408]"
          >
            <ClipboardList className="mb-4 h-8 w-8 text-[#e7c77f]" />
            <div className="text-base font-bold text-white">My Bids</div>
          </Link>

          <Link
            href="/dashboard/notifications"
            className="group flex min-h-36 flex-col items-center justify-center rounded-2xl border border-[#d6aa55]/30 bg-[#1a1408]/60 px-4 py-5 text-center transition hover:-translate-y-1 hover:bg-[#1a1408]"
          >
            <Bell className="mb-4 h-8 w-8 text-[#e7c77f]" />
            <div className="text-base font-bold text-white">
              Notifications
            </div>
          </Link>

          {userIsAdmin && (
            <Link
              href="/admin"
              className="group flex min-h-36 flex-col items-center justify-center rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-5 text-center transition hover:-translate-y-1 hover:bg-red-500/20"
            >
              <BadgeCheck className="mb-4 h-8 w-8 text-red-300" />
              <div className="text-base font-bold text-white">
                Admin Dashboard
              </div>
            </Link>
          )}
        </div>

        <section className="mt-10 grid gap-5 md:grid-cols-4">
          <Stat icon={Gavel} label="My Bids" value={String(bids.length)} />
          <Stat
            icon={Heart}
            label="Active Watchlist"
            value={String(activeWatchlist.length)}
          />
          <Stat
            icon={Trophy}
            label="Unpaid Wins"
            value={String(unpaidWins.length)}
          />
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
            <BadgeCheck className="text-[#c0c0c0]" size={22} />
            <div className="mt-4 text-xs uppercase tracking-widest text-gray-500">
              Bid Limit
            </div>
            <div className="mt-1 font-serif text-3xl text-[#c0c0c0]">
              ${buyerBidLimit.toLocaleString()}
            </div>
            <div className="mt-1 text-xs uppercase tracking-[0.14em] text-gray-500">
              {buyerTier.name} Tier
            </div>
            {buyerTierCode === "BASIC" && (
              <Link
                href="/verify"
                className="mt-3 inline-block text-xs font-semibold text-[#e7c77f] hover:text-white"
              >
                Request upgrade →
              </Link>
            )}
          </div>
        </section>

        <section className="mt-12 grid gap-8 lg:grid-cols-2">
          {activeTab === "auctions" && (
            <>
              <div className="lg:col-span-2">
                <DashboardFilterBar
                  search={buyerSearch}
                  setSearch={setBuyerSearch}
                  placeholder="Search your auctions…"
                />
              </div>

              <Panel title="My Active / Winning Bids">
                {myWinningBids.filter(bidMatches).length === 0 ? (
                  <Empty text="No leading bids yet." />
                ) : (
                  myWinningBids.filter(bidMatches).map((bid: any) => (
                    <BidRow key={bid.auctionId} bid={bid} auctions={auctions} />
                  ))
                )}
              </Panel>

              <Panel title="Outbid (Live)">
                {outbidLive.filter(bidMatches).length === 0 ? (
                  <Empty text="No live outbid auctions." />
                ) : (
                  outbidLive.filter(bidMatches).map((bid: any) => (
                    <BidRow
                      key={bid.auctionId}
                      bid={bid}
                      auctions={auctions}
                      danger
                    />
                  ))
                )}
              </Panel>

              <Panel title="Watchlist">
                {activeWatchlist.filter((item: any) => matchesSearch(auctionTitleById(item.auctionId), buyerSearch)).length === 0 ? (
                  <Empty text="No live watched auctions." />
                ) : (
                  activeWatchlist
                    .filter((item: any) => matchesSearch(auctionTitleById(item.auctionId), buyerSearch))
                    .map((item: any) => {
                    const auction = auctions.find(
                      (a: any) => String(a.id) === String(item.auctionId),
                    );

                    if (!auction) return null;

                    const isEnded =
                      auction.endsAt &&
                      new Date(auction.endsAt).getTime() <= now;

                    const isPaid = auction?.paid === true;
                    const isLive = !isEnded;

                    const imageSrc =
                      auction.imageUrl ||
                      cdnUrl(
                        auction.thumbImages?.[0] ||
                          auction.images?.[0] ||
                          auction.image ||
                          item.image ||
                          "",
                      ) ||
                      "/logo.png";

                    return (
                      <div
                        key={item.id}
                        className="mb-3 flex items-center justify-between gap-4 rounded border border-white/10 bg-black/30 p-3"
                      >
                        <Link
                          href={
                            isEnded
                              ? `/auctions/${item.auctionId}/results`
                              : `/auctions/${item.auctionId}`
                          }
                          className="flex min-w-0 flex-1 items-center gap-4"
                        >
                          <img
                            loading="lazy"
                            src={imageSrc}
                            alt={auction.title || item.title || "Auction"}
                            onError={(e) => {
                              e.currentTarget.onerror = null;
                              e.currentTarget.src = "/logo.png";
                            }}
                            className="h-16 w-16 shrink-0 rounded object-cover"
                          />

                          <div className="min-w-0">
                            <div className="break-words font-semibold">
                              {auction.title || item.title}
                            </div>

                            <div className="mt-1 flex gap-2 text-xs">
                              {isLive && (
                                <span className="rounded bg-blue-400/10 px-2 py-0.5 text-blue-300">
                                  Live
                                </span>
                              )}

                              {isPaid && (
                                <span className="rounded bg-green-500/10 px-2 py-0.5 text-green-400">
                                  Paid
                                </span>
                              )}
                            </div>
                          </div>
                        </Link>

                        <button
                          type="button"
                          onClick={() => removeFromWatchlist(item.id)}
                          className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-400 transition hover:bg-red-500/20 active:scale-95"
                        >
                          Remove
                        </button>
                      </div>
                    );
                  })
                )}
              </Panel>

              <Panel title="Unpaid Wins">
                {unpaidWins.filter(bidMatches).length === 0 ? (
                  <Empty text="No unpaid wins." />
                ) : (
                  unpaidWins.filter(bidMatches).map((bid: any) => (
                    <BidRow
                      key={bid.auctionId}
                      bid={bid}
                      auctions={auctions}
                      trophy
                      showPayButton
                    />
                  ))
                )}
              </Panel>

              <Panel title="Paid Wins">
                {paidWins.filter(bidMatches).length === 0 ? (
                  <Empty text="No paid wins yet." />
                ) : (
                  paidWins.filter(bidMatches).map((bid: any) => (
                    <BidRow
                      key={bid.auctionId}
                      bid={bid}
                      auctions={auctions}
                      trophy
                      invoice={invoices.find(
                        (invoice: any) =>
                          String(invoice.auctionId) === String(bid.auctionId),
                      )}
                      onViewInvoice={viewInvoicePdf}
                      onDownloadInvoice={downloadInvoicePdf}
                      formatInvoiceAmount={formatInvoiceAmount}
                    />
                  ))
                )}
              </Panel>

              <Panel title="Reserve Not Met">
                {reserveNotMet.filter((a: any) => matchesSearch(a.title, buyerSearch)).length === 0 ? (
                  <Empty text="None — every auction you led cleared its reserve." />
                ) : (
                  reserveNotMet
                    .filter((a: any) => matchesSearch(a.title, buyerSearch))
                    .map((auction: any) => (
                      <ReserveNotMetRow key={auction.id} auction={auction} />
                    ))
                )}
              </Panel>

              <Panel title="Lost Auctions">
                {lostAuctions.filter((a: any) => matchesSearch(a.title, buyerSearch)).length === 0 ? (
                  <Empty text="No lost auctions." />
                ) : (
                  lostAuctions
                    .filter((a: any) => matchesSearch(a.title, buyerSearch))
                    .map((auction: any) => (
                    <LostAuctionRow key={auction.id} auction={auction} />
                  ))
                )}
              </Panel>
            </>
          )}

          {activeTab === "marketplace" && (
            <>
              <div className="lg:col-span-2">
                <DashboardFilterBar
                  search={buyerSearch}
                  setSearch={setBuyerSearch}
                  placeholder="Search your purchases & offers…"
                />
              </div>

              <Panel title="Marketplace Purchases">
                {marketplacePurchases.filter((l: any) => matchesSearch(l.title, buyerSearch)).length === 0 ? (
                  <Empty text="No marketplace purchases yet." />
                ) : (
                  marketplacePurchases
                    .filter((l: any) => matchesSearch(l.title, buyerSearch))
                    .map((listing: any) => (
                    <MarketplacePurchaseRow
                      key={listing.id}
                      listing={listing}
                      invoice={invoices.find(
                        (invoice: any) =>
                          String(invoice.listingId) === String(listing.id),
                      )}
                      onViewInvoice={viewInvoicePdf}
                      onDownloadInvoice={downloadInvoicePdf}
                      formatInvoiceAmount={formatInvoiceAmount}
                    />
                  ))
                )}
              </Panel>

              <Panel title="Accepted Marketplace Offers">
                {acceptedOffers.filter((l: any) => matchesSearch(l.title, buyerSearch)).length === 0 ? (
                  <Empty text="No accepted marketplace offers." />
                ) : (
                  acceptedOffers
                    .filter((l: any) => matchesSearch(l.title, buyerSearch))
                    .map((listing: any) => (
                    <AcceptedMarketplaceRow
                      key={listing.id}
                      listing={listing}
                    />
                  ))
                )}
              </Panel>

              <Panel title="Offer Notifications">
                {buyerOffers.length === 0 ? (
                  <Empty text="No offer updates yet." />
                ) : (
                  buyerOffers
                    .filter((offer: any) => offer.read !== true)
                    .map((offer: any) => (
                      <OfferNotificationRow
                        key={offer.id}
                        offer={offer}
                        listing={
                          offerListings.find(
                            (listing: any) =>
                              String(listing.id) === String(offer.listingId),
                          ) ||
                          marketplacePurchases.find(
                            (listing: any) =>
                              String(listing.id) === String(offer.listingId),
                          ) ||
                          acceptedOffers.find(
                            (listing: any) =>
                              String(listing.id) === String(offer.listingId),
                          )
                        }
                        onDismiss={dismissOfferNotification}
                      />
                    ))
                )}
              </Panel>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function Stat({ icon: Icon, label, value }: any) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
      <Icon className="text-[#c0c0c0]" size={22} />
      <div className="mt-4 text-xs uppercase tracking-widest text-gray-500">
        {label}
      </div>
      <div className="mt-1 font-serif text-3xl text-[#c0c0c0]">{value}</div>
    </div>
  );
}

function Panel({ title, children }: any) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
      <h2 className="mb-5 font-serif text-2xl">{title}</h2>
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-gray-500">{text}</p>;
}

//BID ROW

function BidRow({
  bid,
  auctions,
  danger,
  showPayButton,
  onCheckout,
  invoice,
  onViewInvoice,
  onDownloadInvoice,
  formatInvoiceAmount,
}: any) {
  const auction = auctions.find((a: any) => a.id === bid.auctionId);

  const isEnded =
    auction?.endsAt && new Date(auction.endsAt).getTime() <= Date.now();

  const isPaid = auction?.paid === true;

  const reservePrice = moneyToNumber(auction?.reservePrice || 0);
  const currentPrice = moneyToNumber(auction?.price || 0);
  const reserveNotMet = reservePrice > 0 && currentPrice < reservePrice;

  const isWinning =
    String(auction?.winnerUserId || "") === String(bid?.bidderUserId || "") ||
    String(auction?.winnerEmail || "") === String(bid?.bidderUserId || "") ||
    String(auction?.winnerEmail || "") === String(bid?.bidderEmail || "") ||
    String(auction?.winnerDisplayName || "") === String(bid?.bidderName || "");

  const isWinningLive = isWinning && !isEnded && !danger;
  const isWonEnded = isWinning && isEnded;

  const rowStyle = danger
    ? "border-red-500/30 bg-red-500/10"
    : isWonEnded
      ? "border-green-500/40 bg-green-500/10"
      : isWinningLive
        ? "border-blue-400/30 bg-blue-400/10"
        : "border-white/10 bg-black/30";

  const auctionHref = isEnded
    ? `/auctions/${bid.auctionId}/results`
    : `/auctions/${bid.auctionId}`;

  return (
    <div className={`mb-3 rounded border p-4 ${rowStyle}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Link href={auctionHref} className="flex min-w-0 items-center gap-4">
          <img
            loading="lazy"
            src={
              auction?.imageUrl ||
              cdnUrl(
                auction?.thumbImages?.[0] ||
                  auction?.images?.[0] ||
                  auction?.image ||
                  "",
              ) ||
              "/logo.png"
            }
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = "/logo.png";
            }}
            className="h-20 w-20 shrink-0 rounded object-cover sm:h-16 sm:w-16"
          />

          <div className="min-w-0 flex-1">
            <div className="break-words text-lg font-semibold leading-tight sm:text-base">
              {isWonEnded ? "🏆 " : ""}
              {auction?.title || "Auction"}
            </div>

            <div className="mt-2 flex flex-wrap gap-2">
              {isWinningLive && (
                <span className="rounded bg-blue-400/10 px-2 py-0.5 text-xs text-blue-300">
                  {reserveNotMet ? "Leading · Reserve Not Met" : "Leading"}
                </span>
              )}

              {danger && (
                <span className="rounded bg-red-500/10 px-2 py-0.5 text-xs text-red-300">
                  Outbid
                </span>
              )}

              {isWonEnded && !isPaid && (
                <span className="rounded bg-yellow-400/10 px-2 py-0.5 text-xs text-yellow-300">
                  Won · Payment Due
                </span>
              )}

              {isPaid && (
                <span className="rounded bg-green-500/10 px-2 py-0.5 text-xs text-green-400">
                  Paid
                </span>
              )}
            </div>
          </div>
        </Link>

        <div className="shrink-0 font-serif text-3xl text-[#c0c0c0] sm:text-right sm:text-xl">
          {invoice
            ? formatInvoiceAmount(invoice.amount)
            : auction?.price || bid.amount}
        </div>
      </div>

      {auction?.shippingStatus && (
        <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-3">
          <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500">
            Shipping
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-[#d7d7d7]">
            <span>{auction.shippingStatus}</span>

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

          {auction?.trackingNumber && (
            <div className="mt-3 break-all text-xs text-gray-500">
              {auction.carrier} · {auction.trackingNumber}
            </div>
          )}
        </div>
      )}

      {showPayButton && auction && !auction.paid && (
        <Link
          href="/cart"
          className="mt-5 block w-full rounded bg-[#c0c0c0] px-4 py-4 text-center text-lg font-semibold text-black hover:bg-white sm:py-3 sm:text-base"
        >
          Go to Payment Center
        </Link>
      )}

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
    </div>
  );
}

function LostAuctionRow({ auction }: any) {
  return (
    <Link
      href={`/auctions/${auction.id}/results`}
      className="mb-3 block rounded border border-red-500/30 bg-red-500/10 p-4"
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold">{auction.title}</div>
          <span className="mt-2 inline-block rounded bg-red-500/10 px-2 py-0.5 text-xs text-red-300">
            Lost
          </span>
        </div>

        <div className="font-serif text-xl text-[#c0c0c0]">{auction.price}</div>
      </div>
    </Link>
  );
}

function OfferNotificationRow({ offer, listing, onDismiss }: any) {
  const listingImage =
    listing?.imageUrl ||
    cdnUrl(
      listing?.thumbImages?.[0] || listing?.images?.[0] || listing?.image || "",
    ) ||
    "/logo.png";
  return (
    <div
      className="
    mb-4 rounded-2xl
    border border-white/10
    bg-gradient-to-br from-white/[0.05] to-white/[0.02]
    p-5
    shadow-[0_10px_40px_rgba(0,0,0,0.35)]
    backdrop-blur-sm
  "
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          {listing && (
            <img
              src={listingImage}
              alt={listing.title || "Listing"}
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = "/logo.png";
              }}
              className="h-16 w-16 shrink-0 rounded-lg bg-black object-contain"
            />
          )}

          <div className="min-w-0">
            <div className="font-serif text-lg text-[#d7d7d7]">
              {listing?.title || "Marketplace Offer"}
            </div>

            <div className="mt-2 text-sm text-gray-400">
              Offer amount: {offer.amount}
            </div>

            {listing && (
              <Link
                href={`/marketplace/${listing.id}`}
                className="mt-2 inline-block text-xs font-semibold text-[#e7c77f] hover:text-white"
              >
                View Listing
              </Link>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {offer.status === "ACCEPTED" ? (
            <span className="rounded bg-green-500/10 px-2 py-1 text-xs text-green-400">
              Accepted
            </span>
          ) : offer.status === "DECLINED" ? (
            <span className="rounded bg-red-500/10 px-2 py-1 text-xs text-red-300">
              Declined
            </span>
          ) : (
            <span className="rounded bg-yellow-400/10 px-2 py-1 text-xs text-yellow-300">
              Pending
            </span>
          )}

          <button
            type="button"
            onClick={() => onDismiss(offer.id)}
            className="
    group relative overflow-hidden rounded-xl
    border border-white/10
    bg-gradient-to-b from-white/[0.08] to-white/[0.03]
    px-4 py-2
    text-xs font-semibold uppercase tracking-[0.18em]
    text-[#d7d7d7]
    transition-all duration-300
    hover:border-[#c0c0c0]/40
    hover:bg-white/[0.08]
    hover:text-white
    hover:shadow-[0_0_30px_rgba(192,192,192,0.12)]
    active:scale-[0.97]
  "
          >
            <span className="relative z-10">Dismiss</span>

            <div
              className="
      absolute inset-0 opacity-0 transition-opacity duration-300
      group-hover:opacity-100
      bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.18),transparent_65%)]
    "
            />
          </button>
        </div>
      </div>
    </div>
  );
}

function MarketplacePurchaseRow({
  listing,
  invoice,
  onViewInvoice,
  onDownloadInvoice,
  formatInvoiceAmount,
}: any) {
  return (
    <div className="mb-3 rounded border border-emerald-500/30 bg-emerald-500/10 p-4">
      <div className="flex items-center justify-between gap-4">
        <Link
          href={`/marketplace/${listing.id}`}
          className="flex items-center gap-4"
        >
          <img
            loading="lazy"
            src={
              listing.imageUrl ||
              cdnUrl(
                listing.thumbImages?.[0] ||
                  listing.images?.[0] ||
                  listing.image ||
                  "",
              ) ||
              "/logo.png"
            }
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = "/logo.png";
            }}
            className="h-16 w-16 rounded object-cover"
          />

          <div>
            <div className="font-semibold">{listing.title}</div>

            <div className="mt-2 flex flex-wrap gap-2">
              {listing.paid ? (
                <span className="rounded bg-green-500/10 px-2 py-0.5 text-xs text-green-400">
                  Paid
                </span>
              ) : (
                <span className="rounded bg-yellow-400/10 px-2 py-0.5 text-xs text-yellow-300">
                  Payment Pending
                </span>
              )}

              <span className="rounded bg-white/10 px-2 py-0.5 text-xs text-gray-300">
                Marketplace
              </span>
            </div>
          </div>
        </Link>

        <div className="font-serif text-xl text-[#c0c0c0]">
          {invoice
            ? formatInvoiceAmount(invoice.amount)
            : listing.acceptedOfferAmount ||
              listing.offerAmount ||
              listing.price}
        </div>
      </div>

      {listing.shippingStatus && (
        <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-3">
          <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500">
            Shipping
          </div>

          <div className="mt-2 flex items-center gap-3 text-sm text-[#d7d7d7]">
            <span>{listing.shippingStatus}</span>

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
              {listing.carrier} · {listing.trackingNumber}
            </div>
          )}
        </div>
      )}

      <Link
        href={`/marketplace/${listing.id}`}
        className="mt-4 inline-flex rounded border border-white/10 px-4 py-2 text-sm text-white transition hover:bg-white/[0.05]"
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
    </div>
  );
}
function AcceptedMarketplaceRow({ listing }: any) {
  return (
    <div className="mb-3 rounded border border-yellow-400/30 bg-yellow-400/10 p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <img
            loading="lazy"
            src={
              listing.imageUrl ||
              cdnUrl(
                listing.thumbImages?.[0] ||
                  listing.images?.[0] ||
                  listing.image ||
                  "",
              ) ||
              "/logo.png"
            }
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = "/logo.png";
            }}
            className="h-16 w-16 rounded object-cover"
          />

          <div>
            <div className="font-semibold">{listing.title}</div>

            <div className="mt-2 flex gap-2">
              <span className="rounded bg-yellow-400/10 px-2 py-0.5 text-xs text-yellow-300">
                Offer Accepted
              </span>
            </div>
          </div>
        </div>

        {(() => {
          const totals = calculateAcceptedOfferTotal(listing);

          return (
            <div className="text-right">
              <div className="font-serif text-xl text-[#c0c0c0]">
                {formatCurrency(totals.total)}
              </div>

              <div className="mt-1 space-y-1 text-xs text-gray-500">
                <div>Offer: {formatCurrency(totals.subtotal)}</div>

                {totals.tax > 0 && <div>Tax: {formatCurrency(totals.tax)}</div>}
              </div>
            </div>
          );
        })()}
      </div>

      <Link
        href="/cart"
        className="mt-4 block w-full rounded bg-[#c0c0c0] px-4 py-3 text-center font-semibold text-black hover:bg-white"
      >
        Go to Payment Center
      </Link>
    </div>
  );
}

function ReserveNotMetRow({ auction }: any) {
  return (
    <Link
      href={`/auctions/${auction.id}/results`}
      className="mb-3 block rounded border border-yellow-400/30 bg-yellow-400/10 p-4"
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold">{auction.title}</div>
          <span className="mt-2 inline-block rounded bg-yellow-400/10 px-2 py-0.5 text-xs text-yellow-300">
            Reserve Not Met
          </span>
        </div>

        <div className="font-serif text-xl text-[#c0c0c0]">{auction.price}</div>
      </div>
    </Link>
  );
}
