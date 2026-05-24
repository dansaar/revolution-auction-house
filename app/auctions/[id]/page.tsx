"use client";

import "@/lib/amplifyclient";
import React, { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";
import { getCurrentUser, type AuthUser } from "aws-amplify/auth";
import { moneyToNumber } from "@/lib/money";
import { cdnUrl } from "@/lib/cdn";

function getIncrement(amount: number): number {
  if (amount < 100) return 5;
  if (amount < 500) return 10;
  if (amount < 1000) return 25;
  if (amount < 2500) return 50;
  if (amount < 5000) return 100;
  if (amount < 10000) return 250;
  if (amount < 25000) return 500;
  if (amount < 50000) return 1000;
  if (amount < 100000) return 2500;
  if (amount < 250000) return 5000;
  if (amount < 500000) return 10000;
  return 25000;
}

function formatMoney(amount: number): string {
  return `$${amount.toLocaleString()}`;
}

function makeBidderDisplayName(value: string) {
  if (!value) return "";
  if (value.startsWith("Bidder ")) return value;
  return `Bidder ${value.slice(0, 4).toUpperCase()}`;
}

async function listRecentBids(client: any, auctionId: string): Promise<any[]> {
  const response: any = await client.models.Bid.bidsByAuction({ auctionId }, {
    authMode: "apiKey",
    limit: 50,
  } as any);

  return [...(response.data || [])].sort(
    (a: any, b: any) =>
      new Date(b.createdAt || 0).getTime() -
      new Date(a.createdAt || 0).getTime(),
  );
}

async function listMyAuctionBids(
  client: any,
  auctionId: string,
  userId: string,
  userEmail: string,
): Promise<any[]> {
  const byUser: any = await client.models.Bid.bidsByBidder(
    { bidderUserId: userId },
    {
      authMode: "apiKey",
      limit: 1000,
    } as any,
  );

  const byEmail: any = await client.models.Bid.bidsByBidderEmail(
    { bidderEmail: userEmail },
    {
      authMode: "apiKey",
      limit: 1000,
    } as any,
  );

  return [...(byUser.data || []), ...(byEmail.data || [])].filter(
    (bid: any) => bid.auctionId === auctionId,
  );
}

export default function LiveAuctionPage() {
  const params = useParams();
  const id = params.id as string;

  const clientRef = useRef(generateClient<Schema>());
  const client = clientRef.current;

  const [auction, setAuction] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [myMaxBid, setMyMaxBid] = useState("");
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<any[]>([]);
  const [timeLeft, setTimeLeft] = useState("");
  const [timeColor, setTimeColor] = useState("text-gray-400");
  const [auctionMessage, setAuctionMessage] = useState("");
  const [flashOutbid, setFlashOutbid] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const refreshingRef = useRef(false);
  const pendingRefreshRef = useRef(false);
  const refreshBidsRef = useRef<(() => void) | null>(null);
  const [selectedImage, setSelectedImage] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const [displayPrice, setDisplayPrice] = useState(0);
  const [isWatching, setIsWatching] = useState(false);
  const [watchBusy, setWatchBusy] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false); // FIX #10
  const [auctionEnded, setAuctionEnded] = useState(false); // FIX #3  reactive state
  const [resolvedImages, setResolvedImages] = useState<string[]>([]);

  const rawUserKey = user?.userId || user?.username || "";

  // FIX #14  scroll to top only on first load, not every bid update
  const historyInitialized = useRef(false);
  useEffect(() => {
    if (!listRef.current || historyInitialized.current) return;
    listRef.current.scrollTop = 0;
    historyInitialized.current = true;
  }, [history]);

  // Load auction
  useEffect(() => {
    async function loadAuction() {
      const result = await client.models.Auction.get(
        { id },
        { authMode: "apiKey" },
      );
      setAuction(result.data);
      setDisplayPrice(moneyToNumber(result.data?.price || 0));
      setLoading(false);

      refreshAuctionState();

      if (
        result.data?.ended ||
        (result.data?.endsAt &&
          new Date(result.data.endsAt).getTime() <= Date.now())
      ) {
        setAuctionEnded(true); // FIX #3
      }
    }
    loadAuction();
  }, [id]);

  useEffect(() => {
    if (!auction?.id) return;

    let active = true;

    async function refreshLiveAuction() {
      if (!active) return;

      try {
        await refreshAuctionState();

        const sorted = await listRecentBids(client, id);
        setHistory(sorted);

        const myBids = await listMyAuctionBids(
          client,
          id,
          rawUserKey,
          user?.signInDetails?.loginId || "",
        );

        const myMaxAmount = myBids
          .filter((b) => b.maxBid && moneyToNumber(b.maxBid) > 0)
          .map((b) => moneyToNumber(b.maxBid))
          .reduce((max, amt) => Math.max(max, amt), 0);

        setMyMaxBid(myMaxAmount > 0 ? formatMoney(myMaxAmount) : "");
      } catch (err) {
        console.error("LIVE POLL ERROR", err);
      }
    }

    refreshLiveAuction();

    const interval = setInterval(refreshLiveAuction, 5000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [auction?.id, id, rawUserKey]);

  useEffect(() => {
    function resolveImages() {
      const imagePaths = fullscreen
        ? auction?.fullImages?.length
          ? auction.fullImages
          : auction?.images
        : auction?.mediumImages?.length
          ? auction.mediumImages
          : auction?.images;

      if (!auction?.id || !imagePaths?.length) return;

      const cacheKey = fullscreen
        ? `auction-full-images-${auction.id}`
        : `auction-medium-images-${auction.id}`;

      const cached = sessionStorage.getItem(cacheKey);

      if (cached) {
        const cachedUrls = JSON.parse(cached);

        setResolvedImages(cachedUrls);
        setSelectedImage(cachedUrls[0] || "/logo.png");

        return;
      }

      const urls = imagePaths.map((path: string) => cdnUrl(path));

      setResolvedImages(urls);
      setSelectedImage(urls[0] || "/logo.png");
      sessionStorage.setItem(cacheKey, JSON.stringify(urls));
    }

    resolveImages();
  }, [auction?.id, fullscreen]);

  useEffect(() => {
    if (!fullscreen && resolvedImages.length > 0) {
      setSelectedImage(resolvedImages[0]);
    }
  }, [fullscreen, resolvedImages]);

  //  Load user ONCE
  useEffect(() => {
    async function loadUser() {
      try {
        setUser(await getCurrentUser());
      } catch {
        setUser(null);
      } finally {
        setAuthReady(true);
      }
    }
    loadUser();
  }, []);

  //  Load bids + realtime subscriptions
  useEffect(() => {
    if (!authReady || !user) return;

    async function loadBids() {
      if (refreshingRef.current) {
        pendingRefreshRef.current = true;
        return;
      }

      refreshingRef.current = true;

      try {
        const sorted = await listRecentBids(client, id);

        setHistory(sorted);

        await new Promise((resolve) => setTimeout(resolve, 300));

        await refreshAuctionState();

        const myBids = await listMyAuctionBids(
          client,
          id,
          rawUserKey,
          user?.signInDetails?.loginId || "",
        );

        const myMaxAmount = myBids
          .filter((b) => b.maxBid && moneyToNumber(b.maxBid) > 0)
          .map((b) => moneyToNumber(b.maxBid))
          .reduce((max, amt) => Math.max(max, amt), 0);

        setMyMaxBid(myMaxAmount > 0 ? formatMoney(myMaxAmount) : "");
      } catch (err) {
        console.error("LOAD BIDS ERROR", err);
      } finally {
        refreshingRef.current = false;

        if (pendingRefreshRef.current) {
          pendingRefreshRef.current = false;
          loadBids();
        }
      }
    }
    refreshBidsRef.current = loadBids;

    loadBids();

    const bidCreateSub = client.models.Bid.onCreate({
      authMode: "apiKey",
    }).subscribe({
      next: (b) => {
        if (b.auctionId === id) {
          loadBids();
          window.dispatchEvent(new Event("bid-updated"));
        }
      },
      error: (e) => console.error("Bid create sub error:", e),
    });
    const bidUpdateSub = client.models.Bid.onUpdate({
      authMode: "apiKey",
    }).subscribe({
      next: (b) => {
        if (b.auctionId === id) {
          loadBids();
          window.dispatchEvent(new Event("bid-updated"));
        }
      },
      error: (e) => console.error("Bid update sub error:", e),
    });
    const stateUpdateSub = client.models.AuctionState.onUpdate({
      authMode: "apiKey",
    }).subscribe({
      next: (state: any) => {
        if (state.auctionId !== id) return;

        setDisplayPrice(moneyToNumber(state.currentPrice || 0));

        const newLeader = state.leaderUserId || "";

        if (rawUserKey && myMaxBid && newLeader && newLeader !== rawUserKey) {
          setFlashOutbid(true);

          const audio = new Audio("/outbid.mp3");
          audio.volume = 0.35;
          audio.play().catch(() => {});

          setTimeout(() => setFlashOutbid(false), 1500);
        }

        setAuction((prev: any) => ({
          ...(prev || {}),
          price: state.currentPrice,
          endsAt: state.endsAt || prev?.endsAt,
          winnerUserId: state.leaderUserId,
          winnerDisplayName: makeBidderDisplayName(state.leaderUserId || ""),
          winnerEmail: state.leaderUserId,
        }));

        pendingRefreshRef.current = true;

        refreshBidsRef.current?.();

        window.dispatchEvent(new Event("bid-updated"));
      },

      error: (e) => console.error("AuctionState sub error:", e),
    });

    return () => {
      bidCreateSub.unsubscribe();
      bidUpdateSub.unsubscribe();
      stateUpdateSub.unsubscribe();
    };
  }, [id, authReady, user]);

  // Timer
  useEffect(() => {
    if (!auction?.endsAt) return;
    const interval = setInterval(async () => {
      const diff = new Date(auction.endsAt).getTime() - Date.now();

      if (diff <= 0) {
        setTimeLeft("Ended");
        setTimeColor("text-red-500");
        setAuctionMessage("Auction Ended");
        setAuctionEnded(true);
        clearInterval(interval);
        return;
      }

      const days = Math.floor(diff / 86400000);
      const hours = Math.floor((diff % 86400000) / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setTimeLeft(
        `${days}days ${hours}hr ${minutes}min ${String(seconds).padStart(2, "0")}sec`,
      );

      if (diff < 5000) {
        setTimeColor("text-red-500");
        setAuctionMessage("Going Twice...");
      } else if (diff < 10000) {
        setTimeColor("text-red-500");
        setAuctionMessage("Going Once...");
      } else if (diff < 30000) {
        setTimeColor("text-red-500");
        setAuctionMessage("Final seconds");
      } else if (diff < 120000) {
        setTimeColor("text-yellow-400");
        setAuctionMessage("Closing soon");
      } else {
        setTimeColor("text-gray-400");
        setAuctionMessage("");
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [auction?.id, auction?.endsAt, auction?.ended, auction?.price]);

  // FIX #2 â€“ bidderMap + actualWinner in useMemo (not bare component body)
  const actualWinnerUserId =
    auction?.winnerUserId || auction?.winnerEmail || "";

  const userIsWinning = !!rawUserKey && actualWinnerUserId === rawUserKey;

  //  Outbid flash
  useEffect(() => {
    const isWinning = !!rawUserKey && actualWinnerUserId === rawUserKey;

    const hasBid = !!myMaxBid;

    if (!hasBid || isWinning) return;

    setFlashOutbid(true);

    const audio = new Audio("/outbid.mp3");
    audio.volume = 0.35;
    audio.play().catch(() => {});

    const t = setTimeout(() => setFlashOutbid(false), 1500);

    return () => clearTimeout(t);
  }, [myMaxBid, rawUserKey, actualWinnerUserId]);
  //  Watchlist
  useEffect(() => {
    async function loadWatchStatus() {
      if (!auction?.id || !user) return;

      try {
        const currentUser = await getCurrentUser();

        const safeUserKey =
          currentUser?.signInDetails?.loginId || currentUser?.username || "";

        if (!safeUserKey) return;

        const result = await client.models.WatchlistItem.list({
          filter: {
            auctionId: { eq: auction.id },
            userEmail: { eq: safeUserKey },
          },
          authMode: "userPool",
        });

        setIsWatching(result.data.length > 0);
      } catch {
        setIsWatching(false);
      }
    }

    loadWatchStatus();

    window.addEventListener("watchlist-updated", loadWatchStatus);

    window.addEventListener("storage", loadWatchStatus);

    window.addEventListener("focus", loadWatchStatus);

    return () => {
      window.removeEventListener("watchlist-updated", loadWatchStatus);

      window.removeEventListener("storage", loadWatchStatus);

      window.removeEventListener("focus", loadWatchStatus);
    };
  }, [auction?.id, user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050607] px-6 py-10 text-white">
        <div className="mx-auto max-w-6xl">
          <div className="mb-14 h-12 w-52 animate-pulse rounded bg-white/[0.06]" />

          <div className="grid gap-10 lg:grid-cols-2">
            <div className="h-[600px] animate-pulse rounded-2xl border border-white/10 bg-white/[0.04]" />
            <div className="space-y-5">
              <div className="h-12 w-3/4 animate-pulse rounded bg-white/[0.06]" />
              <div className="h-16 w-1/2 animate-pulse rounded bg-white/[0.06]" />
              <div className="h-[340px] animate-pulse rounded-2xl border border-white/10 bg-white/[0.04]" />
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (!auction) return <div className="text-white p-10">Not found</div>;

  const currentAmount = moneyToNumber(auction?.price || 0);
  const increment = getIncrement(currentAmount);
  const nextBid = currentAmount + increment;

  const userHasBid = !!myMaxBid;

  const userIsOutbid = userHasBid && !userIsWinning;
  const reservePrice = moneyToNumber(auction.reservePrice || 0);
  const reserveMet =
    reservePrice === 0 || moneyToNumber(auction?.price || 0) >= reservePrice;

  const images = resolvedImages.length > 0 ? resolvedImages : ["/logo.png"];

  const mainImage =
    selectedImage && selectedImage !== "undefined" && selectedImage.trim()
      ? selectedImage
      : images[0] || "/logo.png";

  //  Watchlist toggle
  async function toggleWatchlist() {
    if (!auction?.id || watchBusy) return;

    let safeUserKey = "";

    try {
      const currentUser = await getCurrentUser();

      safeUserKey =
        currentUser?.signInDetails?.loginId || currentUser?.username || "";
    } catch {
      window.location.href = "/signin";
      return;
    }

    if (!safeUserKey) {
      window.location.href = "/signin";
      return;
    }

    setWatchBusy(true);

    const currentWatching = isWatching;
    const next = !currentWatching;

    setIsWatching(next);

    try {
      const existing = await client.models.WatchlistItem.list({
        filter: {
          auctionId: { eq: auction.id },
          userEmail: { eq: safeUserKey },
        },
        authMode: "userPool",
      });

      for (const item of existing.data) {
        await client.models.WatchlistItem.delete(
          { id: item.id },
          { authMode: "userPool" },
        );
      }

      if (next) {
        await client.models.WatchlistItem.create(
          {
            auctionId: auction.id,
            title: auction.title,
            image: auction.thumbImages?.[0] || auction.image || "/logo.png",
            href: `/auctions/${auction.id}`,
            userEmail: safeUserKey,
          },
          { authMode: "userPool" },
        );
      }

      localStorage.setItem("watchlist-updated-at", String(Date.now()));
      window.dispatchEvent(new Event("watchlist-updated"));

      const refreshed = await client.models.WatchlistItem.list({
        filter: {
          auctionId: { eq: auction.id },
          userEmail: { eq: safeUserKey },
        },
        authMode: "userPool",
      });

      const finalWatching = refreshed.data.length > 0;

      setIsWatching(finalWatching);
    } catch (err) {
      console.error("Toggle watchlist failed:", err);

      setIsWatching((p) => !p);
    } finally {
      setWatchBusy(false);
    }
  }
  async function refreshAuctionState() {
    const stateResult = await client.models.AuctionState.get(
      {
        auctionId: id,
      } as any,
      {
        authMode: "apiKey",
      } as any,
    );

    const state = stateResult.data;

    if (!state) return;

    setDisplayPrice(moneyToNumber(state.currentPrice || 0));

    setAuction((prev: any) => ({
      ...(prev || {}),
      price: state.currentPrice,
      endsAt: state.endsAt || prev?.endsAt,
      winnerUserId: state.leaderUserId,
      winnerDisplayName: makeBidderDisplayName(state.leaderUserId || ""),
      winnerEmail: state.leaderUserId,
    }));
  }

  async function placeBid() {
    if (!user) {
      window.location.href = `/signin?next=/auctions/${id}`;
      return;
    }

    if (isSubmitting) return;

    const enteredMaxBid = moneyToNumber(input);

    setIsSubmitting(true);

    try {
      const result = await client.mutations.placeBid(
        {
          auctionId: id,
          maxBid: enteredMaxBid,
        },
        {
          authMode: "userPool",
        } as any,
      );

      if (!result.data?.success) {
        alert(result.data?.message || "Bid failed");
        return;
      }

      const newPrice = result.data.currentPrice || enteredMaxBid;

      setDisplayPrice(newPrice);

      setAuction((prev: any) => ({
        ...(prev || {}),
        price: formatMoney(newPrice),
        winnerUserId: rawUserKey,
        winnerDisplayName: makeBidderDisplayName(rawUserKey),
        winnerEmail: rawUserKey,
      }));

      setMyMaxBid(formatMoney(enteredMaxBid));
      setInput("");

      pendingRefreshRef.current = true;
      refreshBidsRef.current?.();

      setTimeout(() => {
        pendingRefreshRef.current = true;
        refreshBidsRef.current?.();
      }, 1000);
    } catch (err: any) {
      console.error("PLACE BID ERROR FULL", err);
      alert(err?.message || "Failed to place bid");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#050607] text-white px-6 py-10">
      {flashOutbid && (
        <div className="fixed left-1/2 top-6 z-50 -translate-x-1/2 rounded-full border border-red-500/30 bg-red-500/20 px-6 py-3 text-sm font-bold uppercase tracking-[0.18em] text-red-300 shadow-[0_0_40px_rgba(239,68,68,0.35)]">
          You’ve been outbid
        </div>
      )}

      <main className="max-w-6xl mx-auto">
        <div className="mb-10 flex flex-col gap-3 border-b border-white/10 pb-8 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/auctions"
            className="rounded-full border border-white/10 px-6 py-3 text-sm uppercase tracking-[0.22em] text-white transition hover:border-white/30 hover:bg-white/[0.03]"
          >
            ← Auctions
          </Link>

          <Link
            href="/dashboard"
            className="rounded-full border border-white/10 px-6 py-3 text-sm uppercase tracking-[0.22em] text-white transition hover:border-white/30 hover:bg-white/[0.03] hover:scale-[1.02] active:scale-[0.99]"
          >
            Buyer Dashboard →
          </Link>
        </div>

        <div className="grid lg:grid-cols-2 gap-10 mt-6">
          {/* IMAGE GALLERY */}
          <div>
            <button
              type="button"
              onClick={() => setFullscreen(true)}
              className="group relative block h-[360px] w-full rounded-2xl border border-white/10 bg-black md:h-[520px] lg:h-[600px]"
            >
              <img
                loading="eager"
                src={
                  mainImage !== "undefined" && mainImage.trim()
                    ? mainImage
                    : "/logo.png"
                }
                alt={auction.title}
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = "/logo.png";
                }}
                className="h-full w-full rounded-2xl object-contain bg-black transition duration-500"
              />

              <div className="pointer-events-none absolute bottom-3 right-3 rounded bg-black/70 px-3 py-1 text-xs text-[#c0c0c0] opacity-0 transition group-hover:opacity-100">
                Click to fullscreen
              </div>
            </button>

            <div className="mt-4 grid grid-cols-4 gap-3">
              {images.map((src: string, i: number) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSelectedImage(src)}
                  className={`overflow-hidden rounded border ${
                    mainImage === src
                      ? "border-[#c0c0c0]"
                      : "border-white/10 opacity-70"
                  }`}
                >
                  <img
                    loading="lazy"
                    src={
                      src && src !== "undefined" && src.trim()
                        ? src
                        : "/logo.png"
                    }
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = "/logo.png";
                    }}
                    alt={`${auction.title} ${i + 1}`}
                    className="h-20 w-full object-contain bg-black"
                  />
                </button>
              ))}
            </div>
          </div>

          {/* RIGHT SIDE */}
          <div>
            <h1 className="text-4xl font-serif">{auction.title}</h1>

            {/* FIX #11  single source of truth: always use displayPrice number state */}

            <div className="mt-6 text-5xl text-[#c0c0c0] font-serif">
              {formatMoney(displayPrice)}
            </div>

            {myMaxBid && (
              <div className="mt-2 text-sm text-gray-400">
                Your max bid:{" "}
                <span className="font-semibold text-[#c0c0c0]">{myMaxBid}</span>
              </div>
            )}
            {user && !auctionEnded && userIsWinning && (
              <div className="mt-5 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm font-semibold text-emerald-300">
                You are currently the highest bidder
              </div>
            )}
            {user && !auctionEnded && userIsOutbid && (
              <div className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-300">
                You’ve been outbid
              </div>
            )}

            <div className={`mt-6 text-2xl ${timeColor}`}>{timeLeft}</div>
            <div className={timeColor}>{auctionMessage}</div>

            {auction?.endsAt &&
              new Date(auction.endsAt).getTime() - Date.now() <= 3000 &&
              new Date(auction.endsAt).getTime() > Date.now() && (
                <div className="mt-4 text-center text-red-500 text-xl font-bold animate-pulse">
                  ⚡ FINAL CALL
                </div>
              )}

            {/* BID CONSOLE */}
            <div className="mt-8 rounded-2xl border border-white/10 bg-[#0b0c0e] p-6 shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
              <div className="flex items-start justify-between border-b border-white/10 pb-5">
                <div>
                  <div className="text-xs uppercase tracking-[0.28em] text-gray-500">
                    Private Bid Console
                  </div>

                  <div className="mt-2 font-serif text-2xl text-white">
                    Place Max Bid
                  </div>

                  {user && (
                    <div className="mt-4 flex items-center gap-3">
                      <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-emerald-300">
                        Verified Bidder
                      </span>

                      <span className="text-xs uppercase tracking-[0.22em] text-[#c0c0c0]">
                        {makeBidderDisplayName(
                          user?.userId || user?.username || "",
                        )}
                      </span>
                    </div>
                  )}
                </div>

                <div className="text-right">
                  <div className="text-xs uppercase tracking-[0.22em] text-gray-500">
                    Increment
                  </div>

                  <div className="mt-2 font-serif text-3xl text-[#c0c0c0]">
                    ${increment.toLocaleString()}
                  </div>
                </div>
              </div>

              {auctionEnded && (
                <div className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-center text-sm text-red-300">
                  This auction has ended. Final results are available.
                </div>
              )}

              <div className="mt-6">
                <label className="mb-3 block text-xs uppercase tracking-[0.22em] text-gray-500">
                  Your Maximum Bid
                </label>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <input
                    disabled={auctionEnded || isSubmitting}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !auctionEnded && !isSubmitting) {
                        placeBid();
                      }
                    }}
                    placeholder={`Min ${formatMoney(nextBid)}`}
                    className="flex-1 rounded-xl border border-white/10 bg-black px-4 py-4 text-lg text-white outline-none transition placeholder:text-[#c8a96b] focus:border-[#c0c0c0]/60 disabled:opacity-40"
                  />

                  {auctionEnded ? (
                    <Link
                      href={`/auctions/${id}/results`}
                      className="flex items-center rounded-xl bg-[#c0c0c0] px-6 py-4 text-sm font-bold uppercase tracking-[0.16em] text-black transition hover:bg-white"
                    >
                      View Results →
                    </Link>
                  ) : (
                    <button
                      onClick={placeBid}
                      disabled={isSubmitting}
                      className="rounded-xl bg-[#c0c0c0] px-7 py-4 text-sm font-bold uppercase tracking-[0.16em] text-black transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isSubmitting ? "Placing..." : "Place Bid"}
                    </button>
                  )}
                </div>

                <div className="mt-3 text-xs text-gray-500">
                  Enter your maximum bid. The system will bid automatically up
                  to your limit.
                </div>
              </div>

              <button
                type="button"
                disabled={watchBusy}
                onClick={toggleWatchlist}
                className={`mt-5 flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-4 text-sm font-bold uppercase tracking-[0.16em] transition disabled:opacity-50 ${
                  isWatching
                    ? "border-red-500/40 bg-red-600/15 text-red-300"
                    : "border-white/15 bg-white/[0.03] text-[#c0c0c0] hover:border-[#c0c0c0]/50 hover:bg-white/[0.06]"
                }`}
              >
                <span className="text-lg">
                  {Boolean(isWatching) ? "♥" : "♡"}
                </span>
                {watchBusy
                  ? "Updating..."
                  : Boolean(isWatching)
                    ? "Watching This Auction"
                    : "Add To Watchlist"}
              </button>

              <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4 text-xs uppercase tracking-[0.18em]">
                <span className="text-gray-500">Reserve Status</span>
                {reserveMet ? (
                  <span className="text-emerald-400">Reserve Met</span>
                ) : (
                  <span className="text-yellow-400">Reserve Not Met</span>
                )}
              </div>
            </div>

            {/* HISTORY */}
            <div className="mt-10">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="text-xs uppercase tracking-[0.24em] text-gray-500">
                    Bid Activity
                  </div>

                  <div className="mt-1 font-serif text-2xl text-white">
                    Bid History
                  </div>
                </div>

                <div className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs uppercase tracking-[0.18em] text-gray-400">
                  {history.length} Bids
                </div>
              </div>

              <div
                ref={listRef}
                className="max-h-[420px] overflow-y-auto rounded-2xl border border-white/10 bg-[#0a0b0d]"
              >
                {history.map((bid, i) => (
                  <div
                    key={i}
                    className={`border-b border-white/5 px-5 py-4 transition ${
                      i === 0 ? "bg-emerald-500/10" : "hover:bg-white/[0.03]"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className={`h-2.5 w-2.5 rounded-full ${
                            i === 0 ? "bg-emerald-400" : "bg-[#c0c0c0]/40"
                          }`}
                        />

                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-white">
                              {bid.bidderName}
                            </span>

                            {bid.isProxy && (
                              <span className="rounded-full border border-[#c0c0c0]/20 bg-[#c0c0c0]/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-[#c0c0c0]">
                                Auto Bid
                              </span>
                            )}

                            {i === 0 && (
                              <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-emerald-300">
                                Leading
                              </span>
                            )}
                          </div>

                          <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-gray-500">
                            Max bid protected
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="font-serif text-2xl text-[#c0c0c0]">
                          {bid.amount}
                        </div>

                        <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-gray-500">
                          Bid Placed
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-12 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <h2 className="font-serif text-3xl text-[#c0c0c0]">
            Details & Provenance
          </h2>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Detail label="Grade" value={auction.grade} />
            <Detail label="Certification #" value={auction.certNumber} />
            <Detail label="Year" value={auction.year} />
            <Detail label="Set" value={auction.setName} />
            <Detail label="Card Number" value={auction.cardNumber} />
            <Detail label="Population" value={auction.population} />
          </div>

          {auction.description && (
            <div className="mt-8">
              <div className="text-xs uppercase tracking-[0.2em] text-gray-500">
                Description
              </div>

              <p className="mt-3 whitespace-pre-line text-gray-300">
                {auction.description}
              </p>
            </div>
          )}

          {auction.provenance && (
            <div className="mt-8">
              <div className="text-xs uppercase tracking-[0.2em] text-gray-500">
                Provenance
              </div>

              <p className="mt-3 whitespace-pre-line text-gray-300">
                {auction.provenance}
              </p>
            </div>
          )}
        </div>
      </main>

      {/* FULLSCREEN MODAL */}
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
              src={
                mainImage && mainImage !== "undefined" && mainImage.trim()
                  ? mainImage
                  : "/logo.png"
              }
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = "/logo.png";
              }}
              alt={auction.title}
              className="max-h-[78vh] max-w-[95vw] rounded-lg object-contain transition duration-500 hover:scale-110"
            />

            <div className="mt-5 flex max-w-4xl gap-3 overflow-x-auto">
              {images.map((src: string, i: number) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSelectedImage(src)}
                  className={`h-20 w-20 shrink-0 overflow-hidden rounded border ${
                    mainImage === src
                      ? "border-[#c0c0c0]"
                      : "border-white/20 opacity-60"
                  }`}
                >
                  <img
                    loading="lazy"
                    src={
                      src && src !== "undefined" && src.trim()
                        ? src
                        : "/logo.png"
                    }
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = "/logo.png";
                    }}
                    alt={`${auction.title} ${i + 1}`}
                    className="h-full w-full object-contain bg-black"
                  />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
function Detail({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;

  return (
    <div className="rounded-xl border border-white/10 bg-black/40 p-4">
      <div className="text-xs uppercase tracking-[0.2em] text-gray-500">
        {label}
      </div>

      <div className="mt-2 text-lg text-white">{value}</div>
    </div>
  );
}
