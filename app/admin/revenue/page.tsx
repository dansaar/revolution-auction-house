"use client";

import "@/lib/amplifyclient";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";
import { isAdminUser } from "@/lib/sellers";
import { DATE_PRESETS, DatePreset, getDateRange } from "@/lib/datePresets";

const client = generateClient<Schema>();

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 });
}

function fmtFull(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}

type ViewStats = {
  gross: number; hammer: number; premium: number; tax: number;
  count: number;
  monthly: { key: string; label: string; gross: number; premium: number }[];
  topSellers: { email: string; revenue: number; share: number }[];
};

type Stats = {
  all: ViewStats;
  auctions: ViewStats;
  marketplace: ViewStats;
  pending: { value: number; count: number };
};

type Transaction = {
  id: string; paidAt: string; title: string;
  buyerEmail: string; sellerEmail: string;
  subtotal: string; buyerPremium: string; tax: string; amount: string;
  type: string;
};

const EMPTY_STATS: ViewStats = {
  gross: 0, hammer: 0, premium: 0, tax: 0, count: 0, monthly: [], topSellers: [],
};

export default function AdminRevenuePage() {
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<Transaction[]>([]);
  const [view, setView] = useState<"all" | "auctions" | "marketplace">("all");
  const [page, setPage] = useState(0);
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const PAGE_SIZE = 25;

  const fetchStats = useCallback(async (preset: DatePreset, cs?: string, ce?: string) => {
    setLoading(true);
    try {
      const { start, end } = getDateRange(preset, cs, ce);
      const result = await (client as any).queries.getRevenueStats(
        {
          startDate: start?.toISOString() ?? null,
          endDate: end?.toISOString() ?? null,
        },
        { authMode: "userPool" },
      );
      const data = result?.data;
      if (data?.statsJson) setStats(JSON.parse(data.statsJson));
      if (data?.recentJson) setRecent(JSON.parse(data.recentJson));
    } catch (err) {
      console.error("REVENUE_STATS_ERROR", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    async function init() {
      try {
        if (!await isAdminUser()) return;
        setIsAdmin(true);
        await fetchStats("all");
      } finally {
        setChecking(false);
      }
    }
    init();
  }, [fetchStats]);

  const handlePreset = (preset: DatePreset) => {
    setDatePreset(preset);
    setPage(0);
    if (preset !== "custom") fetchStats(preset);
  };

  const viewStats: ViewStats = stats?.[view] ?? EMPTY_STATS;
  const pendingStats = stats?.pending ?? { value: 0, count: 0 };
  const auctionGross = stats?.auctions?.gross ?? 0;
  const marketGross  = stats?.marketplace?.gross ?? 0;
  const auctionCount = stats?.auctions?.count ?? 0;
  const marketCount  = stats?.marketplace?.count ?? 0;

  const maxMonthly = useMemo(
    () => Math.max(1, ...viewStats.monthly.map((m) => m.gross)),
    [viewStats],
  );

  const filteredRecent = useMemo(() => {
    if (view === "all") return recent;
    if (view === "auctions") return recent.filter((t) => t.type === "AUCTION" || (!t.type && !t.id?.includes("list")));
    return recent.filter((t) => t.type === "MARKETPLACE" || t.type === "MARKET");
  }, [recent, view]);

  const paginated = filteredRecent.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filteredRecent.length / PAGE_SIZE);

  if (checking) return <main className="min-h-screen bg-[#050607] p-10 text-white">Loading…</main>;
  if (!isAdmin) return <main className="min-h-screen bg-[#050607] p-10 text-white">Admin access required.</main>;

  return (
    <main className="min-h-screen bg-[#050607] px-6 py-12 text-white">
      <div className="mx-auto max-w-7xl">
        <Link href="/admin" className="text-sm text-gray-500 hover:text-white">← Admin</Link>

        <h1 className="mt-6 font-serif text-5xl text-[#c0c0c0]">Revenue Dashboard</h1>
        <div className="mt-2 h-px w-48 bg-gradient-to-r from-transparent via-[#d6aa55]/60 to-transparent" />

        {/* Date filter */}
        <div className="mt-8 flex flex-wrap gap-2">
          {DATE_PRESETS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => handlePreset(key)}
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
              onClick={() => { setPage(0); fetchStats("custom", customStart, customEnd); }}
              className="rounded-lg border border-[#d6aa55]/40 bg-[#d6aa55]/10 px-5 py-2 text-sm text-[#e7c77f] hover:bg-[#d6aa55]/20"
            >
              Apply
            </button>
          </div>
        )}

        {/* View toggle */}
        <div className="mt-5 flex gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1 w-fit">
          {(["all", "auctions", "marketplace"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => { setView(v); setPage(0); }}
              className={`rounded-lg px-5 py-2 text-sm font-medium capitalize transition ${view === v ? "bg-white/10 text-white" : "text-gray-400 hover:text-white"}`}
            >
              {v}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="mt-10 space-y-4">
            {[1,2,3,4].map(i => <div key={i} className="h-24 animate-pulse rounded-xl bg-white/[0.04]" />)}
          </div>
        ) : (
          <>
            {/* KPI cards */}
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KPI label="Gross Revenue" value={fmt(viewStats.gross)} sub={`${viewStats.count} paid invoices`} gold />
              <KPI label="Hammer / Sale Value" value={fmt(viewStats.hammer)} sub="Subtotal before premium + tax" />
              <KPI label="Buyer Premium" value={fmt(viewStats.premium)} sub={viewStats.gross > 0 ? `${((viewStats.premium / viewStats.gross) * 100).toFixed(1)}% of gross` : "—"} />
              <KPI label="Tax Collected" value={fmt(viewStats.tax)} />
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <KPI label="Auction Revenue" value={fmt(auctionGross)} sub={`${auctionCount} invoices`} />
              <KPI label="Marketplace Revenue" value={fmt(marketGross)} sub={`${marketCount} invoices`} />
              <KPI label="Pending / Uncollected" value={fmt(pendingStats.value)} sub={`${pendingStats.count} unpaid invoices`} accent="yellow" />
            </div>

            {/* Monthly trend */}
            {viewStats.monthly.length > 0 && (
              <section className="mt-10">
                <h2 className="mb-4 font-serif text-2xl text-gray-400">Monthly Revenue</h2>
                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
                  <div className="flex items-end gap-2 overflow-x-auto pb-2" style={{ minHeight: 160 }}>
                    {viewStats.monthly.map((m) => {
                      const barH = Math.round((m.gross / maxMonthly) * 120);
                      const premH = Math.round((m.premium / maxMonthly) * 120);
                      return (
                        <div key={m.key} className="group flex flex-1 min-w-[40px] flex-col items-center gap-1">
                          <div className="relative w-full flex flex-col justify-end" style={{ height: 128 }}>
                            <div className="w-full rounded-t bg-[#d6aa55]/30 group-hover:bg-[#d6aa55]/50 transition" style={{ height: barH }} title={`${m.label}: ${fmtFull(m.gross)}`} />
                            <div className="absolute bottom-0 w-full rounded-t bg-[#d6aa55]/70 group-hover:bg-[#d6aa55]/90 transition" style={{ height: premH }} title={`Premium: ${fmtFull(m.premium)}`} />
                          </div>
                          <div className="text-[10px] text-gray-600 whitespace-nowrap">{m.label}</div>
                          <div className="text-[10px] text-gray-500 opacity-0 group-hover:opacity-100 transition whitespace-nowrap">{fmt(m.gross)}</div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3 flex gap-4 text-xs text-gray-500">
                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#d6aa55]/30" /> Gross revenue</span>
                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#d6aa55]/70" /> Buyer premium</span>
                  </div>
                </div>
              </section>
            )}

            {/* Top sellers */}
            {viewStats.topSellers.length > 0 && (
              <section className="mt-10">
                <h2 className="mb-4 font-serif text-2xl text-gray-400">Top Sellers by Revenue</h2>
                <div className="overflow-x-auto rounded-2xl border border-white/10">
                  <table className="w-full min-w-[500px] text-sm">
                    <thead className="bg-white/[0.04] text-xs uppercase tracking-widest text-gray-500">
                      <tr>
                        <th className="p-4 text-left">#</th>
                        <th className="p-4 text-left">Seller</th>
                        <th className="p-4 text-right">Revenue</th>
                        <th className="p-4 text-right">Share</th>
                        <th className="p-4 text-right w-48">Bar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewStats.topSellers.map(({ email, revenue, share }, i) => (
                        <tr key={email} className="border-t border-white/[0.06] hover:bg-white/[0.02]">
                          <td className="p-4 text-gray-600">{i + 1}</td>
                          <td className="p-4 text-white">{email}</td>
                          <td className="p-4 text-right font-semibold text-[#c0c0c0]">{fmtFull(revenue)}</td>
                          <td className="p-4 text-right text-gray-500">{share}%</td>
                          <td className="p-4">
                            <div className="h-2 w-full rounded-full bg-white/[0.06]">
                              <div className="h-2 rounded-full bg-[#d6aa55]/60" style={{ width: `${share}%` }} />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* Transaction log */}
            <section className="mt-10">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-serif text-2xl text-gray-400">Recent Transactions</h2>
                <span className="text-sm text-gray-600">{filteredRecent.length} shown (up to 100)</span>
              </div>
              <div className="overflow-x-auto rounded-2xl border border-white/10">
                <table className="w-full min-w-[800px] text-sm">
                  <thead className="bg-white/[0.04] text-xs uppercase tracking-widest text-gray-500">
                    <tr>
                      <th className="p-4 text-left">Date</th>
                      <th className="p-4 text-left">Item</th>
                      <th className="p-4 text-left">Buyer</th>
                      <th className="p-4 text-left">Seller</th>
                      <th className="p-4 text-right">Subtotal</th>
                      <th className="p-4 text-right">Premium</th>
                      <th className="p-4 text-right">Tax</th>
                      <th className="p-4 text-right">Total</th>
                      <th className="p-4 text-left">Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.length === 0 ? (
                      <tr><td colSpan={9} className="p-8 text-center text-gray-500">No paid invoices in this period.</td></tr>
                    ) : paginated.map((t) => (
                      <tr key={t.id} className="border-t border-white/[0.06] hover:bg-white/[0.02]">
                        <td className="p-4 text-xs text-gray-500 whitespace-nowrap">
                          {t.paidAt ? new Date(t.paidAt).toLocaleDateString() : "—"}
                        </td>
                        <td className="p-4 max-w-[160px] truncate text-white">{t.title || "—"}</td>
                        <td className="p-4 text-xs text-gray-400 max-w-[140px] truncate">{t.buyerEmail || "—"}</td>
                        <td className="p-4 text-xs text-gray-400 max-w-[140px] truncate">{t.sellerEmail || "—"}</td>
                        <td className="p-4 text-right text-gray-400">{t.subtotal || "—"}</td>
                        <td className="p-4 text-right text-[#e7c77f]/80">{t.buyerPremium || "—"}</td>
                        <td className="p-4 text-right text-gray-500">{t.tax || "—"}</td>
                        <td className="p-4 text-right font-semibold text-[#c0c0c0]">{t.amount || "—"}</td>
                        <td className="p-4">
                          <span className={`rounded px-2 py-0.5 text-[10px] uppercase font-semibold ${
                            t.type === "AUCTION" ? "bg-blue-500/10 text-blue-300" : "bg-purple-500/10 text-purple-300"
                          }`}>
                            {t.type === "AUCTION" ? "Auction" : "Market"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
                  <button type="button" disabled={page === 0} onClick={() => setPage(p => p - 1)} className="rounded border border-white/10 px-4 py-2 hover:text-white disabled:opacity-30">← Prev</button>
                  <span>Page {page + 1} of {totalPages}</span>
                  <button type="button" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="rounded border border-white/10 px-4 py-2 hover:text-white disabled:opacity-30">Next →</button>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function KPI({ label, value, sub, gold, accent }: { label: string; value: string; sub?: string; gold?: boolean; accent?: string }) {
  const border = gold ? "border-[#d6aa55]/30 bg-[#d6aa55]/[0.06]" :
                 accent === "yellow" ? "border-yellow-500/20 bg-yellow-500/[0.05]" :
                 "border-white/10 bg-white/[0.03]";
  const valColor = gold ? "text-[#e7c77f]" : accent === "yellow" ? "text-yellow-300" : "text-[#c0c0c0]";
  return (
    <div className={`rounded-xl border p-5 ${border}`}>
      <div className="text-xs uppercase tracking-widest text-gray-500">{label}</div>
      <div className={`mt-2 font-serif text-3xl ${valColor}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-gray-600">{sub}</div>}
    </div>
  );
}
