"use client";

import "@/lib/amplifyclient";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";
import { isAdminUser } from "@/lib/sellers";

const client = generateClient<Schema>();

const COMMON_DOMAINS = new Set(["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com", "aol.com"]);

export default function ShillDetectionPage() {
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [auctions, setAuctions] = useState<any[]>([]);
  const [bidLogs, setBidLogs] = useState<any[]>([]);
  const [sellers, setSellers] = useState<any[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const admin = await isAdminUser();
        setIsAdmin(admin);
        if (!admin) return;

        const [auctionResult, sellerResult] = await Promise.all([
          client.models.Auction.list({ authMode: "apiKey", limit: 1000 } as any),
          client.models.SellerProfile.list({ authMode: "userPool", limit: 1000 } as any),
        ]);

        // BidAuditLog is Admin-group only; paginate up to 3000 records
        const allBids: any[] = [];
        let nextToken: string | null = null;
        for (let page = 0; page < 3; page++) {
          const bidResult: any = await client.models.BidAuditLog.list({
            authMode: "userPool",
            limit: 1000,
            ...(nextToken ? { nextToken } : {}),
          } as any);
          allBids.push(...(bidResult.data || []));
          nextToken = bidResult.nextToken ?? null;
          if (!nextToken) break;
        }

        setAuctions(auctionResult.data || []);
        setBidLogs(allBids);
        setSellers(sellerResult.data || []);
      } catch (err) {
        console.error("SHILL DETECTION LOAD ERROR", err);
      } finally {
        setChecking(false);
        setLoading(false);
      }
    }
    load();
  }, []);

  const analysis = useMemo(() => {
    if (!bidLogs.length || !auctions.length) {
      return { flags: [], stats: { totalBidders: 0, totalAcceptedBids: 0 } };
    }

    // auction id → seller info
    const auctionSellers: Record<string, { sellerUserId: string; sellerEmail: string }> = {};
    for (const a of auctions) {
      auctionSellers[a.id] = {
        sellerUserId: a.sellerUserId || "",
        sellerEmail: (a.sellerEmail || "").toLowerCase(),
      };
    }

    // known seller emails and userIds
    const sellerEmailSet = new Set(sellers.map((s: any) => (s.email || "").toLowerCase()));
    const sellerUserIdSet = new Set(auctions.map((a: any) => a.sellerUserId).filter(Boolean));

    // group accepted bids by bidder
    const accepted = bidLogs.filter((b: any) => b && b.accepted);

    type SellerEntry = {
      sellerEmail: string;
      sellerUserId: string;
      count: number;
      auctions: Set<string>;
    };

    type BidderEntry = {
      bidderEmail: string;
      totalBids: number;
      bySeller: Record<string, SellerEntry>;
    };

    const byBidder: Record<string, BidderEntry> = {};

    for (const bid of accepted) {
      if (!bid) continue;
      const info = auctionSellers[bid.auctionId];
      if (!info) continue;

      const bidderId = bid.bidderUserId || bid.bidderEmail || "unknown";
      if (!byBidder[bidderId]) {
        byBidder[bidderId] = { bidderEmail: bid.bidderEmail || "", totalBids: 0, bySeller: {} };
      }
      byBidder[bidderId].totalBids++;

      const sellerKey = info.sellerUserId || info.sellerEmail;
      if (!byBidder[bidderId].bySeller[sellerKey]) {
        byBidder[bidderId].bySeller[sellerKey] = {
          sellerEmail: info.sellerEmail,
          sellerUserId: info.sellerUserId,
          count: 0,
          auctions: new Set(),
        };
      }
      byBidder[bidderId].bySeller[sellerKey].count++;
      byBidder[bidderId].bySeller[sellerKey].auctions.add(bid.auctionId);
    }

    const flags: any[] = [];

    for (const [bidderId, data] of Object.entries(byBidder)) {
      if (data.totalBids < 3) continue;

      for (const [, sd] of Object.entries(data.bySeller)) {
        const pct = sd.count / data.totalBids;
        const reasons: string[] = [];
        let score = 0;

        // concentration
        if (pct >= 0.8 && sd.count >= 5) {
          reasons.push(`${Math.round(pct * 100)}% of bids on one seller`);
          score += 50;
        } else if (pct >= 0.6 && sd.count >= 3) {
          reasons.push(`${Math.round(pct * 100)}% of bids on one seller`);
          score += 25;
        }

        // bidder is also a seller — possible bid ring
        if (sellerUserIdSet.has(bidderId) || sellerEmailSet.has(data.bidderEmail.toLowerCase())) {
          reasons.push("Bidder is also a registered seller");
          score += 30;
        }

        // same non-common email domain as seller
        const bDomain = data.bidderEmail.split("@")[1]?.toLowerCase() || "";
        const sDomain = sd.sellerEmail.split("@")[1]?.toLowerCase() || "";
        if (bDomain && sDomain && bDomain === sDomain && !COMMON_DOMAINS.has(bDomain)) {
          reasons.push(`Shared email domain (${bDomain})`);
          score += 25;
        }

        if (reasons.length > 0) {
          flags.push({
            bidderId,
            bidderEmail: data.bidderEmail,
            sellerEmail: sd.sellerEmail,
            sellerUserId: sd.sellerUserId,
            bidsOnSeller: sd.count,
            auctionCount: sd.auctions.size,
            totalBids: data.totalBids,
            pct: Math.round(pct * 100),
            reasons,
            score,
          });
        }
      }
    }

    flags.sort((a, b) => b.score - a.score);

    return {
      flags,
      stats: {
        totalBidders: Object.keys(byBidder).length,
        totalAcceptedBids: accepted.length,
      },
    };
  }, [bidLogs, auctions, sellers]);

  if (checking || loading) {
    return (
      <main className="min-h-screen bg-[#050607] p-10 text-white">
        Analyzing bidding patterns...
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="min-h-screen bg-[#050607] p-10 text-white">
        Admin access required.
      </main>
    );
  }

  const { flags, stats } = analysis;

  return (
    <main className="min-h-screen bg-[#050607] px-6 py-12 text-white">
      <div className="mx-auto max-w-7xl">
        <Link href="/admin" className="text-sm text-gray-500 hover:text-white">
          ← Back to Admin
        </Link>

        <div className="mt-6 border-b border-white/10 pb-8">
          <h1 className="font-serif text-5xl text-[#c0c0c0]">Shill Detection</h1>
          <p className="mt-3 text-gray-400">
            Flags bidder/seller pairs with unusual concentration, shared identity, or domain overlap.
          </p>
        </div>

        <div className="mt-8 grid gap-5 md:grid-cols-3">
          <StatBox label="Bidders Analyzed" value={stats.totalBidders} />
          <StatBox label="Accepted Bids" value={stats.totalAcceptedBids} />
          <StatBox label="Flagged Pairs" value={flags.length} alert={flags.length > 0} />
        </div>

        <section className="mt-10">
          <h2 className="mb-2 font-serif text-3xl text-[#c0c0c0]">Flagged Pairs</h2>
          <p className="mb-6 text-sm text-gray-500">
            Sorted by risk score. Flags are signals, not proof — investigate before acting.
          </p>

          {flags.length === 0 ? (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-8 text-emerald-300">
              No suspicious patterns detected.
            </div>
          ) : (
            <div className="space-y-4">
              {flags.map((flag, i) => (
                <div
                  key={i}
                  className={`rounded-2xl border p-5 ${
                    flag.score >= 50
                      ? "border-red-500/30 bg-red-500/[0.04]"
                      : "border-yellow-500/20 bg-yellow-500/[0.03]"
                  }`}
                >
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded px-2 py-1 text-xs font-bold uppercase tracking-wider ${
                            flag.score >= 50
                              ? "bg-red-500/20 text-red-300"
                              : "bg-yellow-500/15 text-yellow-300"
                          }`}
                        >
                          Risk {flag.score}
                        </span>
                        {flag.reasons.map((r: string, j: number) => (
                          <span
                            key={j}
                            className="rounded border border-white/10 bg-white/[0.05] px-2 py-1 text-xs text-gray-300"
                          >
                            {r}
                          </span>
                        ))}
                      </div>

                      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                        <div>
                          <div className="text-xs uppercase tracking-widest text-gray-500">
                            Bidder
                          </div>
                          <div className="mt-1 break-all text-white">
                            {flag.bidderEmail || flag.bidderId}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-widest text-gray-500">
                            Seller
                          </div>
                          <div className="mt-1 break-all text-white">
                            {flag.sellerEmail || flag.sellerUserId || "—"}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-3 text-center lg:w-80">
                      <Metric label="On seller" value={flag.bidsOnSeller} />
                      <Metric label="Auctions" value={flag.auctionCount} />
                      <Metric label="Total bids" value={flag.totalBids} />
                      <Metric
                        label="Concentration"
                        value={`${flag.pct}%`}
                        color={flag.pct >= 80 ? "text-red-300" : "text-yellow-300"}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function StatBox({
  label,
  value,
  alert = false,
}: {
  label: string;
  value: number;
  alert?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-6 ${
        alert && value > 0
          ? "border-red-500/30 bg-red-500/[0.04]"
          : "border-white/10 bg-white/[0.03]"
      }`}
    >
      <div className="text-xs uppercase tracking-[0.22em] text-gray-500">{label}</div>
      <div
        className={`mt-3 font-serif text-4xl ${
          alert && value > 0 ? "text-red-300" : "text-[#c0c0c0]"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  color = "text-[#c0c0c0]",
}: {
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`mt-1 font-serif text-xl ${color}`}>{value}</div>
    </div>
  );
}
