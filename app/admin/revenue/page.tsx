"use client";

import "@/lib/amplifyclient";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";
import { isAdminUser } from "@/lib/sellers";
import { moneyToNumber } from "@/lib/money";

const client = generateClient<Schema>();

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 });
}

function fmtFull(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}

function monthKey(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string) {
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1).toLocaleString("en-US", { month: "short", year: "2-digit" });
}

export default function AdminRevenuePage() {
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"all" | "auctions" | "marketplace">("all");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;

  useEffect(() => {
    async function load() {
      try {
        if (!await isAdminUser()) return;
        setIsAdmin(true);
        const all: any[] = [];
        let nextToken: string | undefined;
        do {
          const res: any = await client.models.Invoice.list({
            authMode: "userPool",
            limit: 1000,
            ...(nextToken ? { nextToken } : {}),
          } as any);
          all.push(...(res.data || []));
          nextToken = res.nextToken ?? undefined;
        } while (nextToken);
        setInvoices(all);
      } finally {
        setChecking(false);
        setLoading(false);
      }
    }
    load();
  }, []);

  const paid = useMemo(() => invoices.filter((inv: any) => inv.status === "PAID" || inv.paidAt), [invoices]);
  const pending = useMemo(() => invoices.filter((inv: any) => !inv.paidAt && inv.status !== "PAID"), [invoices]);

  const filtered = useMemo(() =>
    view === "all" ? paid :
    view === "auctions" ? paid.filter((i: any) => i.type === "AUCTION" || i.auctionId) :
    paid.filter((i: any) => i.type === "MARKETPLACE" || i.listingId),
  [paid, view]);

  const totalGross      = useMemo(() => filtered.reduce((s, i) => s + moneyToNumber(i.amount    || 0), 0), [filtered]);
  const totalHammer     = useMemo(() => filtered.reduce((s, i) => s + moneyToNumber(i.subtotal  || 0), 0), [filtered]);
  const totalPremium    = useMemo(() => filtered.reduce((s, i) => s + moneyToNumber(i.buyerPremium || 0), 0), [filtered]);
  const totalTax        = useMemo(() => filtered.reduce((s, i) => s + moneyToNumber(i.tax       || 0), 0), [filtered]);

  const auctionGross    = useMemo(() => paid.filter((i: any) => i.type === "AUCTION" || i.auctionId).reduce((s, i) => s + moneyToNumber(i.amount || 0), 0), [paid]);
  const marketGross     = useMemo(() => paid.filter((i: any) => i.type === "MARKETPLACE" || i.listingId).reduce((s, i) => s + moneyToNumber(i.amount || 0), 0), [paid]);

  const pendingValue    = useMemo(() => pending.reduce((s, i) => s + moneyToNumber(i.amount || 0), 0), [pending]);

  // Monthly revenue (last 12 months)
  const monthlyData = useMemo(() => {
    const map: Record<string, { gross: number; premium: number }> = {};
    for (const inv of filtered) {
      if (!inv.paidAt) continue;
      const k = monthKey(inv.paidAt);
      if (!map[k]) map[k] = { gross: 0, premium: 0 };
      map[k].gross   += moneyToNumber(inv.amount       || 0);
      map[k].premium += moneyToNumber(inv.buyerPremium || 0);
    }
    const keys = Object.keys(map).sort().slice(-12);
    return keys.map(k => ({ key: k, label: monthLabel(k), ...map[k] }));
  }, [filtered]);

  const maxMonthly = useMemo(() => Math.max(1, ...monthlyData.map(m => m.gross)), [monthlyData]);

  // Top sellers
  const topSellers = useMemo(() => {
    const map: Record<string, number> = {};
    for (const inv of filtered) {
      if (!inv.sellerEmail) continue;
      map[inv.sellerEmail] = (map[inv.sellerEmail] || 0) + moneyToNumber(inv.amount || 0);
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [filtered]);

  // Paginated recent invoices
  const sorted = useMemo(() => [...filtered].sort((a, b) => new Date(b.paidAt || b.createdAt || 0).getTime() - new Date(a.paidAt || a.createdAt || 0).getTime()), [filtered]);
  const paginated = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);

  if (checking || loading) return <main className="min-h-screen bg-[#050607] p-10 text-white">Loading…</main>;
  if (!isAdmin) return <main className="min-h-screen bg-[#050607] p-10 text-white">Admin access required.</main>;

  return (
    <main className="min-h-screen bg-[#050607] px-6 py-12 text-white">
      <div className="mx-auto max-w-7xl">
        <Link href="/admin" className="text-sm text-gray-500 hover:text-white">← Admin</Link>

        <h1 className="mt-6 font-serif text-5xl text-[#c0c0c0]">Revenue Dashboard</h1>
        <div className="mt-2 h-px w-48 bg-gradient-to-r from-transparent via-[#d6aa55]/60 to-transparent" />

        {/* View toggle */}
        <div className="mt-8 flex gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1 w-fit">
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

        {/* KPI cards */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KPI label="Gross Revenue" value={fmt(totalGross)} sub={`${filtered.length} paid invoices`} gold />
          <KPI label="Hammer / Sale Value" value={fmt(totalHammer)} sub="Subtotal before premium + tax" />
          <KPI label="Buyer Premium" value={fmt(totalPremium)} sub={totalGross > 0 ? `${((totalPremium / totalGross) * 100).toFixed(1)}% of gross` : "—"} />
          <KPI label="Tax Collected" value={fmt(totalTax)} />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <KPI label="Auction Revenue" value={fmt(auctionGross)} sub={`${paid.filter((i: any) => i.type === "AUCTION" || i.auctionId).length} invoices`} />
          <KPI label="Marketplace Revenue" value={fmt(marketGross)} sub={`${paid.filter((i: any) => i.type === "MARKETPLACE" || i.listingId).length} invoices`} />
          <KPI label="Pending / Uncollected" value={fmt(pendingValue)} sub={`${pending.length} unpaid invoices`} accent="yellow" />
        </div>

        {/* Monthly trend */}
        {monthlyData.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-4 font-serif text-2xl text-gray-400">Monthly Revenue</h2>
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
              <div className="flex items-end gap-2 overflow-x-auto pb-2" style={{ minHeight: 160 }}>
                {monthlyData.map((m) => {
                  const barH = Math.round((m.gross / maxMonthly) * 120);
                  const premH = Math.round((m.premium / maxMonthly) * 120);
                  return (
                    <div key={m.key} className="group flex flex-1 min-w-[40px] flex-col items-center gap-1">
                      <div className="relative w-full flex flex-col justify-end" style={{ height: 128 }}>
                        {/* gross bar */}
                        <div
                          className="w-full rounded-t bg-[#d6aa55]/30 group-hover:bg-[#d6aa55]/50 transition"
                          style={{ height: barH }}
                          title={`${m.label}: ${fmtFull(m.gross)}`}
                        />
                        {/* premium overlay */}
                        <div
                          className="absolute bottom-0 w-full rounded-t bg-[#d6aa55]/70 group-hover:bg-[#d6aa55]/90 transition"
                          style={{ height: premH }}
                          title={`Premium: ${fmtFull(m.premium)}`}
                        />
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
        {topSellers.length > 0 && (
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
                  {topSellers.map(([email, rev], i) => (
                    <tr key={email} className="border-t border-white/[0.06] hover:bg-white/[0.02]">
                      <td className="p-4 text-gray-600">{i + 1}</td>
                      <td className="p-4 text-white">{email}</td>
                      <td className="p-4 text-right font-semibold text-[#c0c0c0]">{fmtFull(rev)}</td>
                      <td className="p-4 text-right text-gray-500">{totalGross > 0 ? `${((rev / totalGross) * 100).toFixed(1)}%` : "—"}</td>
                      <td className="p-4">
                        <div className="h-2 w-full rounded-full bg-white/[0.06]">
                          <div
                            className="h-2 rounded-full bg-[#d6aa55]/60"
                            style={{ width: `${totalGross > 0 ? (rev / totalGross) * 100 : 0}%` }}
                          />
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
            <h2 className="font-serif text-2xl text-gray-400">Transaction Log</h2>
            <span className="text-sm text-gray-600">{sorted.length} paid invoices</span>
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
                  <tr><td colSpan={9} className="p-8 text-center text-gray-500">No paid invoices yet.</td></tr>
                ) : paginated.map((inv: any) => (
                  <tr key={inv.id} className="border-t border-white/[0.06] hover:bg-white/[0.02]">
                    <td className="p-4 text-xs text-gray-500 whitespace-nowrap">
                      {inv.paidAt ? new Date(inv.paidAt).toLocaleDateString() : "—"}
                    </td>
                    <td className="p-4 max-w-[160px] truncate text-white">{inv.title || "—"}</td>
                    <td className="p-4 text-xs text-gray-400 max-w-[140px] truncate">{inv.buyerEmail || "—"}</td>
                    <td className="p-4 text-xs text-gray-400 max-w-[140px] truncate">{inv.sellerEmail || "—"}</td>
                    <td className="p-4 text-right text-gray-400">{inv.subtotal || "—"}</td>
                    <td className="p-4 text-right text-[#e7c77f]/80">{inv.buyerPremium || "—"}</td>
                    <td className="p-4 text-right text-gray-500">{inv.tax || "—"}</td>
                    <td className="p-4 text-right font-semibold text-[#c0c0c0]">{inv.amount || "—"}</td>
                    <td className="p-4">
                      <span className={`rounded px-2 py-0.5 text-[10px] uppercase font-semibold ${
                        (inv.type === "AUCTION" || inv.auctionId)
                          ? "bg-blue-500/10 text-blue-300"
                          : "bg-purple-500/10 text-purple-300"
                      }`}>
                        {(inv.type === "AUCTION" || inv.auctionId) ? "Auction" : "Market"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
              <button
                type="button"
                disabled={page === 0}
                onClick={() => setPage(p => p - 1)}
                className="rounded border border-white/10 px-4 py-2 hover:text-white disabled:opacity-30"
              >
                ← Prev
              </button>
              <span>Page {page + 1} of {totalPages}</span>
              <button
                type="button"
                disabled={page >= totalPages - 1}
                onClick={() => setPage(p => p + 1)}
                className="rounded border border-white/10 px-4 py-2 hover:text-white disabled:opacity-30"
              >
                Next →
              </button>
            </div>
          )}
        </section>
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
