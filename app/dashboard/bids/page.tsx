"use client";

import "@/lib/amplifyclient";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getCurrentUser } from "aws-amplify/auth";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";
import { moneyToNumber } from "@/lib/money";
import { cdnUrl } from "@/lib/cdn";
import {
  AUCTION_PUBLIC_FIELDS,
  AUCTION_STATE_PUBLIC_FIELDS,
  BID_PUBLIC_FIELDS,
} from "@/lib/auctionSelection";

const client = generateClient<Schema>();

function getCountdown(endsAt: string | null | undefined, now: number) {
  if (!endsAt) return null;
  const diff = new Date(endsAt).getTime() - now;
  if (diff <= 0) return null;
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s}s`;
}

function resolveImage(auction: any) {
  const raw = auction?.thumbImages?.[0] || auction?.images?.[0] || auction?.image || "";
  if (!raw) return "/logo.png";
  if (raw.startsWith("http") || raw.startsWith("/")) return raw;
  return cdnUrl(raw);
}

function makeBidderDisplayName(value: string) {
  if (!value) return "";
  if (value.startsWith("Bidder ")) return value;
  return `Bidder ${value.slice(0, 4).toUpperCase()}`;
}

const STATUS_ORDER = ["outbid", "winning", "pay-now", "paid", "reserve-not-met", "lost"] as const;
type Status = typeof STATUS_ORDER[number];

const STATUS_CONFIG: Record<Status, { label: string; className: string }> = {
  outbid:   { label: "Outbid",    className: "bg-red-500/10 text-red-300 border-red-500/20" },
  winning:  { label: "Winning",   className: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20" },
  "pay-now":{ label: "Won · Pay Now", className: "bg-[#d6aa55]/10 text-[#e7c77f] border-[#d6aa55]/30" },
  paid:     { label: "Won · Paid",    className: "bg-blue-500/10 text-blue-300 border-blue-500/20" },
  "reserve-not-met": { label: "Reserve Not Met", className: "bg-orange-500/10 text-orange-300 border-orange-500/20" },
  lost:     { label: "Lost",      className: "bg-white/5 text-gray-500 border-white/10" },
};

export default function MyBidsPage() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [filter, setFilter] = useState<Status | "all">("all");
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const currentUser = await getCurrentUser();
        setUser(currentUser);

        const userId = currentUser.userId || currentUser.username || "";
        const userEmail = currentUser.signInDetails?.loginId || currentUser.username || "";

        const [bidByUser, bidByEmail, auctionResult, stateResult, invoiceResult] =
          await Promise.all([
            client.models.Bid.bidsByBidder(
              { bidderUserId: userId },
              { authMode: "apiKey", selectionSet: BID_PUBLIC_FIELDS, limit: 1000 } as any,
            ),
            client.models.Bid.bidsByBidderEmail(
              { bidderEmail: userEmail },
              { authMode: "apiKey", selectionSet: BID_PUBLIC_FIELDS, limit: 1000 } as any,
            ),
            client.models.Auction.list({
              authMode: "apiKey",
              selectionSet: AUCTION_PUBLIC_FIELDS,
            } as any),
            client.models.AuctionState.list({
              authMode: "apiKey",
              selectionSet: AUCTION_STATE_PUBLIC_FIELDS,
            } as any),
            client.models.Invoice.list({ authMode: "userPool" } as any),
          ]);

        const allBids = Array.from(
          new Map(
            [...(bidByUser.data || []), ...(bidByEmail.data || [])].map((b: any) => [b.id, b]),
          ).values(),
        );

        const stateMap: Record<string, any> = {};
        for (const s of stateResult.data || []) {
          if (s.auctionId) stateMap[s.auctionId] = s;
        }

        const invoiceMap: Record<string, boolean> = {};
        for (const inv of invoiceResult.data || []) {
          if (inv.auctionId) invoiceMap[inv.auctionId] = true;
        }

        // Keep highest bid per auction
        const highestByAuction = new Map<string, any>();
        for (const bid of allBids) {
          const existing = highestByAuction.get(bid.auctionId);
          if (!existing || moneyToNumber(bid.amount) > moneyToNumber(existing.amount)) {
            highestByAuction.set(bid.auctionId, bid);
          }
        }

        const meValues = new Set([
          userId,
          userEmail,
          userEmail.toLowerCase(),
          makeBidderDisplayName(userId),
          makeBidderDisplayName(userEmail),
        ].map(String));

        const built: any[] = [];

        for (const [auctionId, myBid] of highestByAuction) {
          const auction = (auctionResult.data || []).find((a: any) => a.id === auctionId);
          if (!auction) continue;

          const state = stateMap[auctionId];
          const currentPrice = state?.currentPrice || auction.price || "$0";
          const leaderUserId = state?.leaderUserId || auction.winnerUserId || "";

          const isEnded =
            auction.ended === true ||
            auction.status === "CANCELLED" ||
            (auction.endsAt && new Date(auction.endsAt).getTime() <= Date.now());

          const isLeading = meValues.has(String(leaderUserId));
          const isPaid = auction.paid === true || invoiceMap[auctionId] === true;

          // A reserve auction that ended below its reserve did NOT sell — the high
          // bidder doesn't owe payment, so don't show it as "Won · Pay Now".
          const reservePrice = moneyToNumber(auction.reservePrice || 0);
          const finalPrice = moneyToNumber(currentPrice);
          const reserveMet = reservePrice <= 0 || finalPrice >= reservePrice;

          let status: Status;
          if (!isEnded) {
            status = isLeading ? "winning" : "outbid";
          } else if (isLeading && reserveMet) {
            status = isPaid ? "paid" : "pay-now";
          } else if (isLeading && !reserveMet) {
            status = "reserve-not-met";
          } else {
            status = "lost";
          }

          built.push({
            auctionId,
            title: auction.title,
            imageUrl: resolveImage(auction),
            myBidAmount: myBid.amount,
            currentPrice,
            endsAt: auction.endsAt,
            isEnded,
            isPaid,
            status,
          });
        }

        // Sort: action-needed first, then by status order, then by endsAt
        built.sort((a, b) => {
          const ai = STATUS_ORDER.indexOf(a.status);
          const bi = STATUS_ORDER.indexOf(b.status);
          if (ai !== bi) return ai - bi;
          if (a.endsAt && b.endsAt) {
            return new Date(a.endsAt).getTime() - new Date(b.endsAt).getTime();
          }
          return 0;
        });

        setRows(built);
      } catch (err) {
        console.error("MY BIDS ERROR", err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    for (const s of STATUS_ORDER) c[s] = rows.filter((r) => r.status === s).length;
    return c;
  }, [rows]);

  const visible = filter === "all" ? rows : rows.filter((r) => r.status === filter);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#050607] px-6 py-12 text-white">
        <div className="mx-auto max-w-4xl">
          <div className="h-12 w-48 animate-pulse rounded bg-white/[0.06]" />
          <div className="mt-8 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-white/[0.04]" />
            ))}
          </div>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-[#050607] px-6 py-12 text-white">
        <div className="mx-auto max-w-4xl text-center text-gray-400">
          Sign in to view your bids.
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050607] px-6 py-12 text-white">
      <div className="mx-auto max-w-4xl">
        <Link href="/dashboard" className="text-sm text-gray-500 hover:text-white">
          ← Dashboard
        </Link>

        <h1 className="mt-6 font-serif text-5xl text-[#c0c0c0]">My Bids</h1>
        <div className="mt-2 h-px w-48 bg-gradient-to-r from-transparent via-[#d6aa55]/60 to-transparent" />

        {/* Filter tabs */}
        <div className="mt-8 flex flex-wrap gap-2">
          {([
            ["all", "All"],
            ["outbid", "Outbid"],
            ["winning", "Winning"],
            ["pay-now", "Pay Now"],
            ["paid", "Paid"],
            ["reserve-not-met", "Reserve Not Met"],
            ["lost", "Lost"],
          ] as const).map(([key, label]) => {
            const count = counts[key] ?? 0;
            if (count === 0 && key !== "all") return null;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`rounded-full border px-4 py-1.5 text-sm transition ${
                  filter === key
                    ? "border-[#d6aa55]/60 bg-[#1a1408] text-[#e7c77f]"
                    : "border-white/10 text-gray-400 hover:border-white/20 hover:text-white"
                }`}
              >
                {label}
                <span className="ml-1.5 text-xs opacity-60">{count}</span>
              </button>
            );
          })}
        </div>

        {/* Rows */}
        <div className="mt-6 space-y-3">
          {visible.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-10 text-center text-gray-500">
              {filter === "all" ? "You haven't placed any bids yet." : `No ${filter} bids.`}
            </div>
          ) : (
            visible.map((row) => {
              const cfg = STATUS_CONFIG[row.status as Status];
              const countdown = !row.isEnded ? getCountdown(row.endsAt, now) : null;

              return (
                <div
                  key={row.auctionId}
                  className={`flex items-center gap-4 rounded-xl border bg-white/[0.02] p-4 transition hover:bg-white/[0.04] ${
                    row.status === "outbid"
                      ? "border-red-500/20"
                      : row.status === "pay-now"
                      ? "border-[#d6aa55]/20"
                      : "border-white/10"
                  }`}
                >
                  {/* Thumbnail */}
                  <Link href={`/auctions/${row.auctionId}`} className="shrink-0">
                    <img
                      src={row.imageUrl}
                      alt={row.title}
                      onError={(e) => { e.currentTarget.src = "/logo.png"; }}
                      className="h-16 w-16 rounded-lg object-contain bg-black"
                    />
                  </Link>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/auctions/${row.auctionId}`}
                      className="block truncate font-medium text-white hover:text-[#e7c77f]"
                    >
                      {row.title}
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-400">
                      <span>My bid: <span className="text-[#c0c0c0]">{row.myBidAmount || "—"}</span></span>
                      <span>Current: <span className="font-semibold text-white">{row.currentPrice}</span></span>
                      {countdown && (
                        <span className={`${countdown.includes("m") && !countdown.includes("h") && !countdown.includes("d") ? "text-red-400" : "text-gray-500"}`}>
                          Ends in {countdown}
                        </span>
                      )}
                      {row.isEnded && row.endsAt && (
                        <span className="text-gray-600">
                          Ended {new Date(row.endsAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Status + CTA */}
                  <div className="shrink-0 flex flex-col items-end gap-2">
                    <span className={`rounded border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-[0.12em] ${cfg.className}`}>
                      {cfg.label}
                    </span>
                    {row.status === "outbid" && (
                      <Link
                        href={`/auctions/${row.auctionId}`}
                        className="rounded border border-white/10 px-3 py-1 text-xs text-gray-300 hover:border-white/30 hover:text-white"
                      >
                        Bid Again
                      </Link>
                    )}
                    {row.status === "pay-now" && (
                      <Link
                        href="/cart"
                        className="rounded border border-[#d6aa55]/40 bg-[#d6aa55]/10 px-3 py-1 text-xs text-[#e7c77f] hover:bg-[#d6aa55]/20"
                      >
                        Pay Now
                      </Link>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </main>
  );
}
