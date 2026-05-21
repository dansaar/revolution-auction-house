"use client";

import "@/lib/amplifyclient";

import React, { useEffect, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { getCurrentUser } from "aws-amplify/auth";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";
import { cdnUrl } from "@/lib/cdn";

function AuctionCard({ item, ended, isWatching, toggleWatchlist }: any) {
  const time = getTimeLeft(item.endsAt);
  const watching = isWatching(item.id);

  return (
    <div
      className={`group overflow-hidden rounded-lg border transition ${
        ended
          ? "border-white/10 bg-white/[0.03]"
          : time.urgency === "critical"
            ? "animate-pulse border-red-500 bg-red-500/10"
            : time.urgency === "danger"
              ? "border-red-500 bg-red-500/5"
              : time.urgency === "warning"
                ? "border-yellow-400 bg-yellow-400/5"
                : "border-white/10 bg-white/[0.03] hover:border-[#c0c0c0]/50"
      }`}
    >
      <div className="relative bg-black">
        <div className="absolute inset-0 animate-pulse bg-white/[0.04]" />

        <img
          loading="lazy"
          decoding="async"
          src={
            item.image && item.image !== "undefined" && item.image.trim() !== ""
              ? item.image
              : "/logo.png"
          }
          onError={(e) => {
            e.currentTarget.src = "/logo.png";
          }}
          alt={item.title}
          className={`relative z-10 h-64 w-full object-cover transition ${
            ended ? "grayscale opacity-60" : ""
          }`}
        />

        <div
          className={`absolute left-3 top-3 z-20 rounded px-2 py-1 text-xs uppercase ${
            ended ? "bg-gray-700" : "bg-red-600"
          }`}
        >
          {ended ? "Ended" : "Live"}
        </div>

        <button
          type="button"
          onClick={async (e) => {
            e.preventDefault();
            e.stopPropagation();

            await toggleWatchlist(item);
          }}
          className={`absolute right-4 top-4 z-10 rounded-full border p-3 transition hover:scale-110 active:scale-90 ${
            watching
              ? "border-red-500 bg-red-600/30 text-red-300 shadow-[0_0_25px_rgba(239,68,68,0.4)]"
              : "border-white/10 bg-black/60 text-white hover:text-red-300"
          }`}
        >
          <span className="text-xl">{watching ? "❤️" : "♡"}</span>
        </button>

        <div className="absolute bottom-3 left-3 z-20 rounded bg-black/70 px-3 py-1 text-xs text-[#c0c0c0]">
          {ended ? "Final" : `⏱ ${time.label}`}
        </div>
      </div>

      <div className="p-4">
        <div className="font-semibold text-white">{item.title}</div>
        <div className="text-sm text-gray-400">{item.subtitle}</div>

        <div className="mt-4 flex items-end justify-between">
          <div>
            <div className="text-xs uppercase text-gray-500">
              {ended ? "Final Bid" : "Current Bid"}
            </div>
            <div className="text-xl text-[#c0c0c0]">{item.price}</div>
          </div>

          <div className="text-sm text-gray-400">{item.bids || 0} bids</div>
        </div>
      </div>
    </div>
  );
}

export default function AuctionsPage() {
  const clientRef = React.useRef(generateClient<Schema>());
  const client = clientRef.current;
  const [user, setUser] = useState<any>(null);
  const userKey = user?.signInDetails?.loginId || user?.username;
  const [auctions, setAuctions] = useState<any[]>([]);
  const [now, setNow] = useState(Date.now());
  const [watchedIds, setWatchedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  function isWatching(auctionId: string) {
    return watchedIds.includes(auctionId);
  }

  async function loadWatchlist() {
    if (!userKey) return;

    const result = await client.models.WatchlistItem.list({
      filter: {
        userEmail: { eq: userKey },
      },
      authMode: "userPool",
    });

    setWatchedIds(result.data.map((item: any) => item.auctionId));
  }

  async function toggleWatchlist(auction: any) {
    if (!userKey) {
      window.location.href = "/signin";
      return;
    }

    const nextWatched = !watchedIds.includes(auction.id);

    setWatchedIds((prev) =>
      nextWatched
        ? [...prev, auction.id]
        : prev.filter((id) => id !== auction.id),
    );

    try {
      const result = await client.models.WatchlistItem.list({
        filter: {
          auctionId: { eq: auction.id },
          userEmail: { eq: userKey },
        },
        authMode: "userPool",
      });

      // delete existing rows
      for (const item of result.data) {
        await client.models.WatchlistItem.delete(
          { id: item.id },
          { authMode: "userPool" },
        );
      }

      // create new watchlist item
      if (nextWatched) {
        await client.models.WatchlistItem.create(
          {
            auctionId: auction.id,
            title: auction.title,
            image:
              auction.thumbImages?.[0] ||
              auction.storageImage ||
              auction.image ||
              "/logo.png",

            href: `/auctions/${auction.id}`,
            userEmail: userKey,
          },
          { authMode: "userPool" },
        );
      }

      localStorage.setItem("watchlist-updated-at", String(Date.now()));
      window.dispatchEvent(new Event("watchlist-updated"));
    } catch (error) {
      console.error("Toggle watchlist failed:", error);
    }
  }

  useEffect(() => {
    async function loadUser() {
      try {
        const currentUser = await getCurrentUser();
        setUser(currentUser);
      } catch {
        setUser(null);
      }
    }

    loadUser();
  }, []);

  useEffect(() => {
    async function loadAuctions() {
      try {
        const [result, stateResult] = await Promise.all([
          client.models.Auction.list({
            authMode: "apiKey",
          } as any),

          client.models.AuctionState.list({
            authMode: "apiKey",
          } as any),
        ]);

        const resolved = result.data.map((auction: any) => {
          let resolvedImage = "/logo.png";

          const imagePath =
            auction.thumbImages?.find(
              (img: string) =>
                img && img !== "undefined" && img !== "/logo.png",
            ) ||
            auction.image ||
            auction.images?.find(
              (img: string) =>
                img && img !== "undefined" && img !== "/logo.png",
            );

          try {
            if (imagePath && imagePath !== "undefined") {
              resolvedImage = cdnUrl(imagePath);
            }
          } catch {}

          const state = stateResult.data.find(
            (s: any) => s.auctionId === auction.id,
          );

          return {
            ...auction,

            storageImage: imagePath,

            image: resolvedImage,

            price: state?.currentPrice || auction.price,

            bids: state?.bidCount ?? auction.bids,

            winnerEmail: state?.leaderUserId || auction.winnerEmail,
          };
        });

        setAuctions(resolved);
      } catch (err) {
        console.error("AUCTIONS LOAD ERROR", err);
      } finally {
        setLoading(false);
      }
    }

    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    function scheduleRefresh() {
      if (refreshTimer) clearTimeout(refreshTimer);

      refreshTimer = setTimeout(() => {
        loadAuctions();
      }, 300);
    }

    loadAuctions();

    const auctionCreateSub = client.models.Auction.onCreate({
      authMode: "apiKey",
    }).subscribe({
      next: () => scheduleRefresh(),
    });

    const auctionUpdateSub = client.models.Auction.onUpdate({
      authMode: "apiKey",
    }).subscribe({
      next: () => scheduleRefresh(),
    });

    const stateUpdateSub = client.models.AuctionState.onUpdate({
      authMode: "apiKey",
    }).subscribe({
      next: () => scheduleRefresh(),
    });

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);

      auctionCreateSub.unsubscribe();

      auctionUpdateSub.unsubscribe();

      stateUpdateSub.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!userKey) return;

    loadWatchlist();

    window.addEventListener("focus", loadWatchlist);
    window.addEventListener("watchlist-updated", loadWatchlist);

    return () => {
      window.removeEventListener("focus", loadWatchlist);
      window.removeEventListener("watchlist-updated", loadWatchlist);
    };
  }, [userKey]);

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const liveAuctions = auctions.filter((a) => {
    if (!a.endsAt) return true;
    return new Date(a.endsAt).getTime() > now;
  });

  const endedAuctions = auctions.filter((a) => {
    if (!a.endsAt) return false;
    return new Date(a.endsAt).getTime() <= now;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050607] px-6 py-12 text-white">
        <div className="mx-auto max-w-7xl">
          <div className="mb-10 h-14 w-64 animate-pulse rounded bg-white/[0.06]" />

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((item) => (
              <div
                key={item}
                className="h-[390px] animate-pulse rounded-lg border border-white/10 bg-white/[0.04]"
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050607] px-6 py-12 text-white">
      <div className="mx-auto mb-10 max-w-7xl">
        <h1 className="mb-3 font-serif text-5xl">Auctions</h1>
        <p className="max-w-xl text-gray-400">
          Bid on curated, high-end Pokémon cards from verified sellers.
        </p>
      </div>

      <div className="mx-auto mb-8 flex max-w-7xl items-center justify-between">
        <div className="flex gap-3">
          <button className="rounded border border-white/20 px-4 py-2 hover:border-[#c0c0c0]">
            Ending Soon
          </button>
          <button className="rounded border border-white/20 px-4 py-2 hover:border-[#c0c0c0]">
            High Value
          </button>
          <button className="rounded border border-white/20 px-4 py-2 hover:border-[#c0c0c0]">
            PSA 10
          </button>
        </div>

        <button className="flex items-center gap-2 rounded border border-white/20 px-4 py-2 hover:border-[#c0c0c0]">
          <SlidersHorizontal size={16} />
          Filters
        </button>
      </div>

      <section className="mx-auto max-w-7xl">
        <h2 className="mb-4 font-serif text-2xl">Live Auctions</h2>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {liveAuctions.map((item) => (
            <Link key={item.id} href={`/auctions/${item.id}`}>
              <AuctionCard
                item={item}
                isWatching={isWatching}
                toggleWatchlist={toggleWatchlist}
              />
            </Link>
          ))}
        </div>

        <h2 className="mb-4 mt-12 font-serif text-2xl text-gray-500">
          Ended Auctions
        </h2>

        {endedAuctions.length === 0 ? (
          <p className="text-gray-600">No ended auctions yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {endedAuctions.map((item) => (
              <Link key={item.id} href={`/auctions/${item.id}/results`}>
                <AuctionCard
                  item={item}
                  ended
                  isWatching={isWatching}
                  toggleWatchlist={toggleWatchlist}
                />
              </Link>
            ))}
          </div>
        )}
      </section>

      <div className="mx-auto mt-16 max-w-7xl text-center">
        <h2 className="mb-4 font-serif text-3xl">
          Ready to place high-value bids?
        </h2>
        <p className="mb-6 text-gray-400">
          Verified buyers can unlock higher bidding limits.
        </p>

        <Link href="/verify">
          <button className="mx-auto rounded bg-[#c0c0c0] px-6 py-3 font-semibold text-black">
            Start Verification
          </button>
        </Link>
      </div>
    </div>
  );
}

function getTimeLeft(endsAt: string | null | undefined) {
  if (!endsAt) return { label: "No end time", urgency: "none" };

  const diff = new Date(endsAt).getTime() - Date.now();

  if (diff <= 0) return { label: "Ended", urgency: "ended" };

  const days = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);

  if (diff < 10000) return { label: `${s}s`, urgency: "critical" };
  if (diff < 30000) return { label: `${m}m ${s}s`, urgency: "danger" };
  if (diff < 120000) return { label: `${m}m ${s}s`, urgency: "warning" };

  if (days > 0) {
    return { label: `${days}days ${h}hr ${m}min`, urgency: "normal" };
  }

  if (h > 0) return { label: `${h}h ${m}m`, urgency: "normal" };

  return { label: `${m}m ${s}s`, urgency: "normal" };
}
