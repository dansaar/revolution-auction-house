"use client";

import "@/lib/amplifyclient";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { getCurrentUser } from "aws-amplify/auth";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";
import { cdnUrl } from "@/lib/cdn";
import { moneyToNumber } from "@/lib/money";
import { DATE_PRESETS, DatePreset, getDateRange, inRange } from "@/lib/datePresets";

const client = generateClient<Schema>();

function fmt(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function pct(n: number, d: number) {
  if (!d) return "—";
  return `${Math.round((n / d) * 100)}%`;
}

export default function SellerAnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [allAuctions, setAllAuctions] = useState<any[]>([]);
  const [allListings, setAllListings] = useState<any[]>([]);

  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [appliedCustomStart, setAppliedCustomStart] = useState("");
  const [appliedCustomEnd, setAppliedCustomEnd] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const user = await getCurrentUser();
        const userId = user.userId || user.username || "";

        async function fetchSellerAuctions() {
          const all: any[] = [];
          let nextToken: string | undefined;
          do {
            const res: any = await (client.models.Auction as any).auctionsBySellerUserId(
              { sellerUserId: userId },
              { authMode: "userPool", limit: 500, ...(nextToken ? { nextToken } : {}) },
            );
            all.push(...(res.data || []));
            nextToken = res.nextToken ?? undefined;
          } while (nextToken);
          return all;
        }

        async function fetchSellerListings() {
          const all: any[] = [];
          let nextToken: string | undefined;
          do {
            const res: any = await (client.models.MarketplaceListing as any).listingsBySellerUserId(
              { sellerUserId: userId },
              { authMode: "userPool", limit: 500, ...(nextToken ? { nextToken } : {}) },
            );
            all.push(...(res.data || []));
            nextToken = res.nextToken ?? undefined;
          } while (nextToken);
          return all;
        }

        const [myAuctions, myListings] = await Promise.all([
          fetchSellerAuctions(),
          fetchSellerListings(),
        ]);

        setAllAuctions(myAuctions.map((a: any) => ({
          ...a,
          image: cdnUrl(a.thumbImages?.[0] || a.images?.[0] || a.image || ""),
        })));
        setAllListings(myListings);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const { start, end } = useMemo(
    () => getDateRange(datePreset, appliedCustomStart, appliedCustomEnd),
    [datePreset, appliedCustomStart, appliedCustomEnd],
  );

  // Filter by createdAt for the selected period
  const auctions = useMemo(
    () => allAuctions.filter((a) => inRange(a.createdAt, start, end)),
    [allAuctions, start, end],
  );
  const listings = useMemo(
    () => allListings.filter((l) => inRange(l.createdAt, start, end)),
    [allListings, start, end],
  );

  if (loading) {
    return (
      <main className="min-h-screen bg-[#050607] px-6 py-12 text-white">
        <div className="mx-auto max-w-5xl space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-white/[0.04]" />
          ))}
        </div>
      </main>
    );
  }

  const now = Date.now();

  const liveAuctions = auctions.filter(
    (a) => !a.ended && a.endsAt && new Date(a.endsAt).getTime() > now &&
      !(a.status === "SCHEDULED" && a.startsAt && new Date(a.startsAt).getTime() > now),
  );
  const scheduledAuctions = auctions.filter(
    (a) => a.status === "SCHEDULED" && a.startsAt && new Date(a.startsAt).getTime() > now,
  );
  const endedAuctions = auctions.filter(
    (a) => a.ended || (a.endsAt && new Date(a.endsAt).getTime() <= now),
  );
  const soldAuctions = endedAuctions.filter(
    (a) => a.winnerUserId && (!a.reservePrice || moneyToNumber(a.price || 0) >= moneyToNumber(a.reservePrice || 0)),
  );
  const paidAuctions = soldAuctions.filter((a) => a.paid === true);
  const totalHammer = soldAuctions.reduce((s, a) => s + moneyToNumber(a.price || 0), 0);
  const totalPaidHammer = paidAuctions.reduce((s, a) => s + moneyToNumber(a.price || 0), 0);
  const avgSalePrice = soldAuctions.length ? totalHammer / soldAuctions.length : 0;
  const highestSale = soldAuctions.reduce((best, a) => {
    const p = moneyToNumber(a.price || 0);
    return p > moneyToNumber(best?.price || 0) ? a : best;
  }, null as any);
  const totalBids = auctions.reduce((s, a) => s + Number(a.bids || 0), 0);

  const activeListings = listings.filter((l) => l.status === "ACTIVE" || l.status === "PAUSED" || l.status === "OFFER_PENDING");
  const soldListings = listings.filter((l) => l.status === "SOLD" || l.sold);
  const marketplaceRevenue = soldListings.reduce((s, l) => s + moneyToNumber(l.acceptedOfferAmount || l.price || 0), 0);

  const StatCard = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
    <div className="rounded-xl border border-[#c8a96b]/20 bg-[#c8a96b]/[0.06] p-5">
      <div className="text-xs uppercase tracking-widest text-gray-500">{label}</div>
      <div className="mt-2 font-serif text-3xl text-[#e7c98a]">{value}</div>
      {sub && <div className="mt-1 text-xs text-gray-600">{sub}</div>}
    </div>
  );

  return (
    <main className="min-h-screen bg-[#050607] px-6 py-12 text-white">
      <div className="mx-auto max-w-5xl">
        <Link href="/seller" className="text-sm text-gray-500 hover:text-white">
          ← Seller Dashboard
        </Link>

        <h1 className="mt-6 font-serif text-5xl text-[#c0c0c0]">Analytics</h1>
        <div className="mt-2 h-px w-48 bg-gradient-to-r from-transparent via-[#d6aa55]/60 to-transparent" />

        {/* Date filter */}
        <div className="mt-8 flex flex-wrap gap-2">
          {DATE_PRESETS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setDatePreset(key)}
              className={`rounded-lg border px-4 py-2 text-sm transition ${
                datePreset === key
                  ? "border-[#d6aa55]/60 bg-[#d6aa55]/10 text-[#e7c77f]"
                  : "border-white/10 text-gray-400 hover:border-white/20 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {datePreset === "custom" && (
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-widest text-gray-500">From</label>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="rounded-lg border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none focus:border-[#d6aa55]/50"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-widest text-gray-500">To</label>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="rounded-lg border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none focus:border-[#d6aa55]/50"
              />
            </div>
            <button
              type="button"
              onClick={() => { setAppliedCustomStart(customStart); setAppliedCustomEnd(customEnd); }}
              className="rounded-lg border border-[#d6aa55]/40 bg-[#d6aa55]/10 px-5 py-2 text-sm text-[#e7c77f] hover:bg-[#d6aa55]/20"
            >
              Apply
            </button>
          </div>
        )}

        <p className="mt-2 text-xs text-gray-600">Filtered by listed date (createdAt)</p>

        {/* Auction stats */}
        <h2 className="mt-10 mb-4 font-serif text-2xl text-gray-400">Auctions</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total Auctions" value={String(auctions.length)} sub={`${liveAuctions.length} live · ${scheduledAuctions.length} scheduled`} />
          <StatCard label="Sold" value={String(soldAuctions.length)} sub={`of ${endedAuctions.length} ended`} />
          <StatCard label="Sell-Through Rate" value={pct(soldAuctions.length, endedAuctions.length)} />
          <StatCard label="Total Bids Received" value={totalBids.toLocaleString()} />
          <StatCard label="Hammer Value" value={fmt(totalHammer)} sub="all sold auctions" />
          <StatCard label="Collected Revenue" value={fmt(totalPaidHammer)} sub="paid auctions only" />
          <StatCard label="Avg Sale Price" value={avgSalePrice ? fmt(avgSalePrice) : "—"} />
          <StatCard label="Unpaid Wins" value={String(soldAuctions.filter((a) => !a.paid).length)} />
        </div>

        {highestSale && (
          <div className="mt-6 rounded-xl border border-[#d6aa55]/20 bg-[#1a1408]/40 p-5">
            <div className="mb-3 text-xs uppercase tracking-widest text-gray-500">Top Sale</div>
            <div className="flex items-center gap-4">
              <img
                src={highestSale.image || "/logo.png"}
                alt={highestSale.title}
                onError={(e) => { e.currentTarget.src = "/logo.png"; }}
                className="h-16 w-16 rounded-lg object-contain bg-black shrink-0"
              />
              <div>
                <div className="font-medium text-white">{highestSale.title}</div>
                <div className="mt-1 font-serif text-2xl text-[#e7c77f]">{highestSale.price}</div>
                {highestSale.grade && <div className="mt-0.5 text-xs text-gray-500">{highestSale.grade}</div>}
              </div>
              <Link
                href={`/auctions/${highestSale.id}/results`}
                className="ml-auto text-sm text-gray-500 hover:text-white shrink-0"
              >
                View Results →
              </Link>
            </div>
          </div>
        )}

        {/* Marketplace stats */}
        <h2 className="mt-12 mb-4 font-serif text-2xl text-gray-400">Marketplace</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total Listings" value={String(listings.length)} />
          <StatCard label="Active" value={String(activeListings.length)} />
          <StatCard label="Sold" value={String(soldListings.length)} sub={pct(soldListings.length, listings.length) + " conversion"} />
          <StatCard label="Revenue" value={fmt(marketplaceRevenue)} />
        </div>

        {/* Sold auction history */}
        <h2 className="mt-12 mb-4 font-serif text-2xl text-gray-400">Auction Sale History</h2>
        {soldAuctions.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-8 text-center text-gray-500">
            No sold auctions in this period.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs uppercase tracking-widest text-gray-500">
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3">Grade</th>
                  <th className="px-4 py-3">Hammer</th>
                  <th className="px-4 py-3">Bids</th>
                  <th className="px-4 py-3">Ended</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {[...soldAuctions]
                  .sort((a, b) => new Date(b.endsAt || 0).getTime() - new Date(a.endsAt || 0).getTime())
                  .map((a) => (
                    <tr key={a.id} className="border-b border-white/[0.06] hover:bg-white/[0.02]">
                      <td className="px-4 py-3">
                        <Link href={`/auctions/${a.id}/results`} className="text-white hover:text-[#e7c77f]">
                          <div className="font-medium truncate max-w-[180px]">{a.title}</div>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-gray-400">{a.grade || "—"}</td>
                      <td className="px-4 py-3 font-semibold text-[#c0c0c0]">{a.price}</td>
                      <td className="px-4 py-3 text-gray-400">{a.bids || 0}</td>
                      <td className="px-4 py-3 text-gray-500">
                        {a.endsAt ? new Date(a.endsAt).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {a.paid ? (
                          <span className="rounded border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase text-emerald-300">Paid</span>
                        ) : (
                          <span className="rounded border border-yellow-500/20 bg-yellow-500/10 px-2 py-0.5 text-[10px] uppercase text-yellow-300">Unpaid</span>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
