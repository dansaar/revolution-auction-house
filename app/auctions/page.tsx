"use client";

import "@/lib/amplifyclient";

import React, { useEffect, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { getCurrentUser } from "aws-amplify/auth";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";
import { cdnUrl } from "@/lib/cdn";
import { moneyToNumber } from "@/lib/money";

function GradeBadge({ grade }: { grade?: string | null }) {
  if (!grade) return null;
  const g = grade.trim();
  const num = parseFloat((g.match(/(\d+\.?\d*)/) || [])[1] || "0");
  const color =
    num >= 10
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
      : num >= 9.5
        ? "border-[#d6aa55]/50 bg-[#d6aa55]/10 text-[#e7c77f]"
        : num >= 9
          ? "border-white/30 bg-white/[0.06] text-[#c0c0c0]"
          : "border-white/20 bg-white/[0.04] text-gray-400";
  return (
    <span className={`inline-flex items-center rounded border px-2.5 py-1 text-xs font-bold uppercase tracking-[0.14em] ${color}`}>
      {g}
    </span>
  );
}

function AuctionCard({ item, ended, isWatching, toggleWatchlist }: any) {
  const time = getTimeLeft(item.endsAt);
  const watching = isWatching(item.id);
  const reservePrice = moneyToNumber(item.reservePrice || 0);
  const currentPrice = moneyToNumber(item.price || 0);
  const hasReserve = reservePrice > 0;
  const reserveMet = !hasReserve || currentPrice >= reservePrice;

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
                : "border-white/10 bg-white/[0.03] hover:border-[#c0c0c0]/50 hover:shadow-[0_0_40px_rgba(192,192,192,0.12)] hover:-translate-y-1"
      }`}
    >
      <div className="relative bg-black">
        <div className="relative h-56 bg-black sm:h-72">
          <img
            loading="lazy"
            src={
              item.imageUrl ||
              cdnUrl(
                item.thumbImages?.[0] || item.images?.[0] || item.image || "",
              ) ||
              "/logo.png"
            }
            alt={item.title}
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = "/logo.png";
            }}
            className="relative z-10 h-full w-full object-contain bg-black transition duration-500 group-hover:scale-105"
          />
        </div>

        <div
          className={`absolute left-3 top-3 z-20 rounded px-2 py-1 text-xs uppercase ${
            ended ? "bg-gray-700" : "bg-red-600"
          }`}
        >
          {ended ? "Ended" : "Live"}
        </div>
        {!ended && (
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
        )}

        <div className="absolute bottom-3 left-3 z-20 rounded bg-black/70 px-3 py-1 text-xs text-[#c0c0c0]">
          {ended ? "Final Results" : `⏱ ${time.label}`}
        </div>
      </div>

      <div className="p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <GradeBadge grade={item.grade} />
            {item.population && (
              <span className="text-xs text-gray-500">Pop: {item.population}</span>
            )}
          </div>
          <span className="text-[10px] uppercase tracking-[0.18em] text-gray-600">
            LOT-{item.id.slice(-6).toUpperCase()}
          </span>
        </div>

        <div className="mt-2 text-sm font-semibold text-white sm:text-base">
          {item.title}
        </div>
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

        {!ended && (
          <div className="mt-3 w-full rounded bg-white/[0.06] py-2 text-center text-xs font-semibold uppercase tracking-[0.18em] text-[#c0c0c0] opacity-0 transition group-hover:opacity-100">
            Bid Now →
          </div>
        )}

        {ended && (
          <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3">
            <span className="text-xs uppercase tracking-[0.16em] text-gray-500">
              Result
            </span>
            {reserveMet ? (
              <span className="rounded bg-emerald-500/15 px-2 py-1 text-[11px] uppercase text-emerald-300">
                Reserve Met
              </span>
            ) : (
              <span className="rounded bg-yellow-500/15 px-2 py-1 text-[11px] uppercase text-yellow-300">
                Reserve Not Met
              </span>
            )}
          </div>
        )}
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
  const [filter, setFilter] = useState<
    "ALL" | "ENDING_SOON" | "HIGH_VALUE" | "PSA_10"
  >("ALL");
  const [search, setSearch] = useState("");

  function isWatching(auctionId: string) {
    return watchedIds.includes(auctionId);
  }

  async function loadWatchlist() {
    if (!user) return;

    const result = await client.models.WatchlistItem.list({
      authMode: "userPool",
    });

    setWatchedIds((result.data || []).map((item: any) => item.auctionId));
  }

  async function toggleWatchlist(auction: any) {
    if (!user) {
      window.location.href = "/signin";
      return;
    }

    const userSub = user.userId || user.username || "";
    const nextWatched = !watchedIds.includes(auction.id);

    setWatchedIds((prev) =>
      nextWatched
        ? [...prev, auction.id]
        : prev.filter((id) => id !== auction.id),
    );

    try {
      const result = await client.models.WatchlistItem.list({
        filter: { auctionId: { eq: auction.id } },
        authMode: "userPool",
      });

      for (const item of result.data) {
        await client.models.WatchlistItem.delete(
          { id: item.id },
          { authMode: "userPool" },
        );
      }

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
            userEmail: user.signInDetails?.loginId || user.username || "",
            userSub,
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

        if (result.errors?.length) {
          console.error("AUCTIONS QUERY ERRORS", result.errors);
        }

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

            ended: auction.ended || state?.ended || false,
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
    if (a.ended === true) return false;
    if (!a.endsAt) return true;
    return new Date(a.endsAt).getTime() > now;
  });

  function applySearch(items: any[]) {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((a) =>
      [a.title, a.subtitle, a.grade, a.certNumber, a.year, a.setName]
        .some((f) => String(f || "").toLowerCase().includes(q))
    );
  }

  function applyFilter(items: any[]) {
    if (filter === "ENDING_SOON") {
      return [...items].sort(
        (a, b) =>
          new Date(a.endsAt || 0).getTime() - new Date(b.endsAt || 0).getTime(),
      );
    }

    if (filter === "HIGH_VALUE") {
      return [...items].sort(
        (a, b) => moneyToNumber(b.price || 0) - moneyToNumber(a.price || 0),
      );
    }

    if (filter === "PSA_10") {
      return items.filter((item) =>
        String(item.grade || "")
          .toLowerCase()
          .includes("10"),
      );
    }

    return items;
  }

  const visibleLiveAuctions = applyFilter(applySearch(liveAuctions));

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
        <div className="mb-8 flex flex-col items-start gap-3 border-b border-white/10 pb-6 sm:flex-row sm:items-center sm:gap-6 md:mb-10 md:pb-8">
          <img
            src="/logo.png"
            alt="Revolution"
            className="h-20 w-auto object-contain sm:h-28 md:h-40"
          />
          <div className="flex flex-1 items-center justify-between">
            <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl">Auctions</h1>
            <Link
              href="/auctions/results"
              className="text-sm text-gray-500 hover:text-white"
            >
              Results →
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto mb-6 max-w-7xl">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by title, grade, year, set, cert number..."
          className="w-full rounded-xl border border-white/10 bg-black px-5 py-4 text-white outline-none placeholder:text-gray-600 focus:border-[#d6aa55]/50"
        />
      </div>

      <div className="mx-auto mb-8 flex max-w-7xl flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() =>
              setFilter(filter === "ENDING_SOON" ? "ALL" : "ENDING_SOON")
            }
            className={`rounded border px-4 py-2 ${
              filter === "ENDING_SOON"
                ? "border-[#c0c0c0] bg-white/[0.08] text-white"
                : "border-white/20 hover:border-[#c0c0c0]"
            }`}
          >
            Ending Soon
          </button>

          <button
            onClick={() =>
              setFilter(filter === "HIGH_VALUE" ? "ALL" : "HIGH_VALUE")
            }
            className={`rounded border px-4 py-2 ${
              filter === "HIGH_VALUE"
                ? "border-[#c0c0c0] bg-white/[0.08] text-white"
                : "border-white/20 hover:border-[#c0c0c0]"
            }`}
          >
            High Value
          </button>

          <button
            onClick={() => setFilter(filter === "PSA_10" ? "ALL" : "PSA_10")}
            className={`rounded border px-4 py-2 ${
              filter === "PSA_10"
                ? "border-[#c0c0c0] bg-white/[0.08] text-white"
                : "border-white/20 hover:border-[#c0c0c0]"
            }`}
          >
            PSA 10
          </button>
        </div>

        {filter !== "ALL" && (
          <button
            onClick={() => setFilter("ALL")}
            className="flex items-center gap-2 rounded border border-white/20 px-4 py-2 text-gray-400 hover:border-[#c0c0c0] hover:text-white"
          >
            <SlidersHorizontal size={16} />
            Clear Filters
          </button>
        )}
      </div>

      <section className="mx-auto max-w-7xl">
        <h2 className="mb-4 font-serif text-2xl">Live Auctions</h2>

        {visibleLiveAuctions.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-8 text-gray-500">
            No live auctions{search ? ` matching "${search}"` : ""}.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {visibleLiveAuctions.map((item) => (
              <Link key={item.id} href={`/auctions/${item.id}`}>
                <AuctionCard
                  item={item}
                  ended={false}
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
