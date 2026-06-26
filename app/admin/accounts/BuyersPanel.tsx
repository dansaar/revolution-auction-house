"use client";

import "@/lib/amplifyclient";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";
import { isAdminUser } from "@/lib/sellers";
import { BUYER_TIERS, getTier, formatTierLimit, privateBandLabel } from "@/lib/tiers";
import { toast } from "sonner";
import { fetchAuthSession } from "aws-amplify/auth";

const client = generateClient<Schema>();

const TIER_ORDER = ["BASIC", "VERIFIED", "PRIVATE", "TROPHY"] as const;

function tierBadge(code: string) {
  switch (code) {
    case "TROPHY":  return "text-yellow-300 border-yellow-400/30 bg-yellow-400/10";
    case "PRIVATE": return "text-purple-300 border-purple-400/30 bg-purple-400/10";
    case "PREMIUM": return "text-blue-300 border-blue-400/30 bg-blue-400/10";
    case "VERIFIED":return "text-emerald-300 border-emerald-400/30 bg-emerald-400/10";
    default:        return "text-gray-400 border-white/10 bg-white/[0.04]";
  }
}

function statusDot(status: string) {
  switch (status) {
    case "APPROVED":      return "text-emerald-400";
    case "PENDING_REVIEW":return "text-yellow-400";
    case "DECLINED":      return "text-red-400";
    default:              return "text-gray-500";
  }
}

export default function BuyersPanel() {
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const [buyers, setBuyers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [adminEmails, setAdminEmails] = useState<Set<string>>(new Set());
  const [sellerEmails, setSellerEmails] = useState<Set<string>>(new Set());

  const [search, setSearch] = useState("");
  const [filterTier, setFilterTier] = useState("ALL");
  const [filterStatus, setFilterStatus] = useState("ALL");

  // inline edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTier, setEditTier] = useState("BASIC");
  const [editLimit, setEditLimit] = useState(""); // bid max for PRIVATE
  const [saving, setSaving] = useState(false);

  // detail drawer
  const [drawerBuyer, setDrawerBuyer] = useState<any>(null);
  const [drawerInvoices, setDrawerInvoices] = useState<any[]>([]);
  const [drawerInvoicesLoading, setDrawerInvoicesLoading] = useState(false);

  async function fetchAllPages(fn: (opts: any) => Promise<any>, opts: any) {
    const all: any[] = [];
    let nextToken: string | undefined;
    do {
      const res: any = await fn({ ...opts, limit: 1000, ...(nextToken ? { nextToken } : {}) });
      all.push(...(res.data || []));
      nextToken = res.nextToken ?? undefined;
    } while (nextToken);
    return all;
  }

  async function loadData() {
    const buyers = await fetchAllPages((o) => client.models.BuyerProfile.list(o as any), { authMode: "userPool" });
    setBuyers([...buyers].sort((a: any, b: any) => String(a.email || "").localeCompare(String(b.email || ""))));
  }

  async function loadGroupMembers() {
    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();
      if (!token) return;
      const res = await fetch("/api/admin/group-members", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setAdminEmails(new Set((data.admin ?? []).map((e: string) => e.toLowerCase())));
      setSellerEmails(new Set((data.seller ?? []).map((e: string) => e.toLowerCase())));
    } catch {
      // non-fatal
    }
  }

  useEffect(() => {
    async function load() {
      try {
        if (!await isAdminUser()) return;
        setIsAdmin(true);
        await Promise.all([loadData(), loadGroupMembers()]);
      } finally {
        setChecking(false);
        setLoading(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    if (!drawerBuyer?.userId) { setDrawerInvoices([]); return; }
    setDrawerInvoicesLoading(true);
    async function fetchInvoices() {
      try {
        const all: any[] = [];
        let nextToken: string | undefined;
        do {
          const res: any = await (client.models.Invoice as any).invoicesByBuyer(
            { buyerUserId: drawerBuyer.userId },
            { authMode: "userPool", limit: 100, ...(nextToken ? { nextToken } : {}) },
          );
          all.push(...(res.data || []));
          nextToken = res.nextToken ?? undefined;
        } while (nextToken);
        all.sort((a, b) => new Date(b.paidAt || b.createdAt || 0).getTime() - new Date(a.paidAt || a.createdAt || 0).getTime());
        setDrawerInvoices(all);
      } catch (err) {
        console.error("DRAWER_INVOICES_ERROR", err);
        setDrawerInvoices([]);
      } finally {
        setDrawerInvoicesLoading(false);
      }
    }
    fetchInvoices();
  }, [drawerBuyer?.userId]);

  async function saveBuyerTier(buyer: any) {
    if (saving) return;
    try {
      setSaving(true);
      const tier = getTier(editTier);
      // Private ($10K–$1M) and Trophy (above $1M) use a custom bid max; other
      // tiers use the fixed limit.
      let bidLimit: number = tier.limit;
      if (editTier === "PRIVATE") {
        const n = Number(editLimit);
        if (!n || n < 10000 || n > 1000000) {
          toast.error("Enter a Private bid max between $10,000 and $1,000,000");
          setSaving(false);
          return;
        }
        bidLimit = n;
      } else if (editTier === "TROPHY") {
        const n = Number(editLimit);
        if (!n || n <= 1000000 || n > 100000000) {
          toast.error("Enter a Trophy bid max above $1,000,000");
          setSaving(false);
          return;
        }
        bidLimit = n;
      }
      await client.models.BuyerProfile.update(
        { userId: buyer.userId, verificationTier: editTier, bidLimit, status: "APPROVED", reviewedAt: new Date().toISOString() },
        { authMode: "userPool" } as any,
      );
      await loadData();
      setEditingId(null);
      toast.success(`${buyer.email} → ${tier.name}`);
    } catch {
      toast.error("Failed to update tier.");
    } finally {
      setSaving(false);
    }
  }

  const filteredBuyers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return buyers.filter((b: any) => {
      if (filterTier !== "ALL" && (b.verificationTier || "BASIC") !== filterTier) return false;
      if (filterStatus !== "ALL" && (b.status || "APPROVED") !== filterStatus) return false;
      if (q && !`${b.email} ${b.displayName} ${b.userId} ${b.phoneNumber}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [buyers, search, filterTier, filterStatus]);

  const onlineCutoff = Date.now() - 5 * 60 * 1000;
  const onlineCount = buyers.filter((b: any) => b.lastSeenAt && new Date(b.lastSeenAt).getTime() >= onlineCutoff).length;
  const pendingCount = buyers.filter((b: any) => b.status === "PENDING_REVIEW").length;
  const tierCounts = useMemo(() => {
    const c: Record<string, number> = { BASIC: 0, VERIFIED: 0, PRIVATE: 0, TROPHY: 0 };
    for (const b of buyers) { const t = b.verificationTier || "BASIC"; if (t in c) c[t]++; }
    return c;
  }, [buyers]);

  if (checking || loading) return <div className="p-10 text-gray-400">Loading…</div>;
  if (!isAdmin) return <div className="p-10 text-gray-400">Admin access required.</div>;

  return (
    <div>
      <div className="mx-auto max-w-7xl">
        {/* Summary cards */}
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          <SummaryCard label="Total Buyers" value={buyers.length} />
          <SummaryCard label="Online Now" value={onlineCount} accent="emerald" />
          <SummaryCard label="Pending Review" value={pendingCount} accent={pendingCount > 0 ? "yellow" : undefined} />
          {BUYER_TIERS.filter(t => t.code !== "BASIC").map(t => (
            <SummaryCard key={t.code} label={t.name} value={tierCounts[t.code] ?? 0} />
          ))}
        </div>

        {/* Private Client band breakdown */}
        {tierCounts.PRIVATE > 0 && (
          <div className="mt-4 rounded-xl border border-purple-400/20 bg-purple-400/[0.04] p-4">
            <div className="mb-3 text-[10px] uppercase tracking-[0.18em] text-gray-500">
              Private Client by band
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "$10K–$100K", test: (n: number) => n <= 100_000 },
                { label: "$100K–$500K", test: (n: number) => n > 100_000 && n <= 500_000 },
                { label: "$500K–$1M", test: (n: number) => n > 500_000 },
              ].map((band) => {
                const count = buyers.filter(
                  (b: any) =>
                    (b.verificationTier || "") === "PRIVATE" &&
                    band.test(Number(b.bidLimit || 0)),
                ).length;
                return (
                  <div
                    key={band.label}
                    className="rounded-lg border border-purple-400/20 bg-black/30 p-3 text-center"
                  >
                    <div className="font-serif text-xl text-purple-200">{count}</div>
                    <div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-gray-500">
                      {band.label}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Search + filters */}
        <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search email, name, ID…"
              className="rounded-xl border border-white/10 bg-black px-4 py-2.5 text-sm text-white outline-none placeholder:text-gray-600 focus:border-[#d6aa55]/50 w-64"
            />
            <select
                value={filterTier}
                onChange={(e) => setFilterTier(e.target.value)}
                className="rounded-xl border border-white/10 bg-black px-3 py-2.5 text-sm text-white outline-none"
              >
                <option value="ALL">All Tiers</option>
                {TIER_ORDER.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded-xl border border-white/10 bg-black px-3 py-2.5 text-sm text-white outline-none"
            >
              <option value="ALL">All Statuses</option>
              <option value="APPROVED">Approved</option>
              <option value="PENDING_REVIEW">Pending Review</option>
              <option value="DECLINED">Declined</option>
            </select>
          </div>
        </div>

        <div className="mt-3 text-xs text-gray-600">
          {filteredBuyers.length} of {buyers.length} buyers
        </div>

        {/* Buyers table */}
        <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="bg-white/[0.04] text-xs uppercase tracking-[0.16em] text-gray-500">
                <tr>
                  <th className="p-4">Buyer</th>
                  <th className="p-4">Tier</th>
                  <th className="p-4">Limit</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Last Seen</th>
                  <th className="p-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredBuyers.length === 0 ? (
                  <tr><td colSpan={6} className="p-8 text-center text-gray-500">No buyers found.</td></tr>
                ) : filteredBuyers.map((buyer: any) => {
                  const tierCode = buyer.verificationTier || "BASIC";
                  const tier = getTier(tierCode);
                  const isEditing = editingId === buyer.userId;
                  const isOnline = buyer.lastSeenAt && new Date(buyer.lastSeenAt).getTime() >= onlineCutoff;

                  return (
                    <tr key={buyer.userId} className="border-t border-white/[0.06] hover:bg-white/[0.02]">
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          {isOnline && <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" title="Online" />}
                          <div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setDrawerBuyer(buyer)}
                                className="font-medium text-white hover:text-[#e7c77f]"
                              >
                                {buyer.email}
                              </button>
                              {adminEmails.has((buyer.email || "").toLowerCase()) && (
                                <span className="inline-flex rounded border border-rose-500/30 bg-rose-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-rose-300">Admin</span>
                              )}
                              {sellerEmails.has((buyer.email || "").toLowerCase()) && (
                                <span className="inline-flex rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-300">Seller</span>
                              )}
                            </div>
                            {buyer.displayName && buyer.displayName !== buyer.email && (
                              <div className="text-xs text-gray-500">{buyer.displayName}</div>
                            )}
                            {buyer.phoneNumber && (
                              <div className="text-xs text-gray-600">{buyer.phoneNumber}</div>
                            )}
                            {buyer.userId && (
                              <div className="font-mono text-[10px] text-gray-700 select-all">{buyer.userId}</div>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="p-4">
                        {isEditing ? (
                          <select
                            value={editTier}
                            onChange={(e) => setEditTier(e.target.value)}
                            className="rounded border border-[#d6aa55]/30 bg-black px-2 py-1 text-sm text-white outline-none"
                            autoFocus
                          >
                            {TIER_ORDER.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        ) : (
                          <span className={`inline-flex rounded border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${tierBadge(tierCode)}`}>
                            {tier.name}
                          </span>
                        )}
                      </td>

                      <td className="p-4 text-[#c0c0c0]">
                        {isEditing ? (
                          editTier === "PRIVATE" || editTier === "TROPHY" ? (
                            <div className="flex flex-col gap-0.5">
                              <input
                                type="number"
                                min={editTier === "PRIVATE" ? 10000 : 1000000}
                                max={editTier === "PRIVATE" ? 1000000 : 100000000}
                                step={editTier === "PRIVATE" ? 1000 : 100000}
                                value={editLimit}
                                onChange={(e) => setEditLimit(e.target.value)}
                                placeholder={editTier === "PRIVATE" ? "Bid max ($10K–$1M)" : "Bid max (above $1M)"}
                                className="w-32 rounded border border-[#d6aa55]/30 bg-black px-2 py-1 text-sm text-white outline-none"
                              />
                              {editLimit && editTier === "PRIVATE" && Number(editLimit) >= 10000 && (
                                <span className="text-[10px] text-[#e7c77f]">{privateBandLabel(Number(editLimit))}</span>
                              )}
                              {editLimit && editTier === "TROPHY" && Number(editLimit) > 1000000 && (
                                <span className="text-[10px] text-[#e7c77f]">up to ${Number(editLimit).toLocaleString()}</span>
                              )}
                            </div>
                          ) : (
                            formatTierLimit(editTier)
                          )
                        ) : (
                          `$${Number(buyer.bidLimit || tier.limit).toLocaleString()}`
                        )}
                      </td>

                      <td className={`p-4 text-xs uppercase tracking-wide ${statusDot(buyer.status || "APPROVED")}`}>
                        {(buyer.status || "APPROVED").replace("_", " ")}
                      </td>

                      <td className="p-4 text-xs text-gray-500">
                        {buyer.lastSeenAt ? new Date(buyer.lastSeenAt).toLocaleDateString() : "—"}
                        {buyer.lastSeenPage && <div className="truncate max-w-[120px] text-gray-600">{buyer.lastSeenPage}</div>}
                      </td>

                      <td className="p-4">
                        {isEditing ? (
                          <div className="flex gap-2">
                            <button type="button" disabled={saving} onClick={() => saveBuyerTier(buyer)} className="rounded border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50">
                              {saving ? "…" : "Save"}
                            </button>
                            <button type="button" onClick={() => setEditingId(null)} className="rounded border border-white/10 px-3 py-1.5 text-xs text-gray-400 hover:text-white">
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button type="button" onClick={() => { setEditingId(buyer.userId); setEditTier(tierCode); setEditLimit(buyer.bidLimit ? String(buyer.bidLimit) : ""); }} className="rounded border border-white/10 px-3 py-1.5 text-xs text-gray-400 hover:border-[#c0c0c0]/30 hover:text-white">
                            Edit Tier
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
      </div>

      {/* Buyer detail drawer */}
      {drawerBuyer && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={() => setDrawerBuyer(null)}>
          <div
            className="h-full w-full max-w-md overflow-y-auto bg-[#0b0c0e] border-l border-white/10 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" onClick={() => setDrawerBuyer(null)} className="mb-6 text-sm text-gray-500 hover:text-white">
              ✕ Close
            </button>

            <h2 className="font-serif text-2xl text-[#c0c0c0]">{drawerBuyer.email}</h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {adminEmails.has((drawerBuyer.email || "").toLowerCase()) && (
                <span className="inline-flex rounded border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-300">Admin</span>
              )}
              {sellerEmails.has((drawerBuyer.email || "").toLowerCase()) && (
                <span className="inline-flex rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-300">Seller</span>
              )}
            </div>
            {drawerBuyer.displayName && drawerBuyer.displayName !== drawerBuyer.email && (
              <div className="mt-1 text-gray-400">{drawerBuyer.displayName}</div>
            )}

            <div className="mt-6 space-y-4 text-sm">
              <Row label="User ID" value={drawerBuyer.userId} mono />
              <Row label="Tier" value={`${getTier(drawerBuyer.verificationTier || "BASIC").name}`} />
              <Row label="Bid Limit" value={`$${Number(drawerBuyer.bidLimit || 1000).toLocaleString()}`} />
              <Row label="Status" value={(drawerBuyer.status || "APPROVED").replace("_", " ")} />
              <Row label="Phone" value={drawerBuyer.phoneNumber || "—"} />
              <Row label="SMS Opt-in" value={drawerBuyer.smsOptIn ? "Yes" : "No"} />
              <Row label="Last Seen" value={drawerBuyer.lastSeenAt ? new Date(drawerBuyer.lastSeenAt).toLocaleString() : "—"} />
              <Row label="Last Page" value={drawerBuyer.lastSeenPage || "—"} />
              {drawerBuyer.requestedTier && (
                <Row label="Requested Tier" value={drawerBuyer.requestedTier} accent />
              )}
              {drawerBuyer.verificationNotes && (
                <div>
                  <div className="text-xs uppercase tracking-widest text-gray-500">Notes</div>
                  <div className="mt-2 rounded border border-white/10 bg-black/30 p-3 text-gray-300">{drawerBuyer.verificationNotes}</div>
                </div>
              )}
            </div>

            {/* Purchase history */}
            <div className="mt-8">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-xs uppercase tracking-widest text-gray-500">Purchase History</div>
                {!drawerInvoicesLoading && (
                  <span className="text-xs text-gray-600">{drawerInvoices.length} invoice{drawerInvoices.length !== 1 ? "s" : ""}</span>
                )}
              </div>

              {drawerInvoicesLoading ? (
                <div className="space-y-2">
                  {[1,2,3].map(i => <div key={i} className="h-12 animate-pulse rounded-lg bg-white/[0.04]" />)}
                </div>
              ) : drawerInvoices.length === 0 ? (
                <div className="rounded-lg border border-white/[0.06] p-4 text-center text-xs text-gray-600">No purchases yet.</div>
              ) : (
                <div className="space-y-2">
                  {drawerInvoices.map((inv: any) => {
                    const paid = inv.status === "PAID" || inv.paidAt;
                    return (
                      <div key={inv.id} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-xs font-medium text-[#c0c0c0]">{inv.title || "—"}</div>
                            <div className="mt-0.5 text-[10px] text-gray-600">
                              {inv.paidAt ? new Date(inv.paidAt).toLocaleDateString() : "—"}
                              {" · "}
                              {inv.sellerEmail || "—"}
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="text-xs font-semibold text-[#e7c77f]">{inv.amount || "—"}</div>
                            <div className="mt-0.5 flex items-center gap-1 justify-end">
                              <span className={`rounded px-1.5 py-0.5 text-[9px] uppercase font-semibold ${
                                inv.type === "AUCTION" ? "bg-blue-500/10 text-blue-300" : "bg-purple-500/10 text-purple-300"
                              }`}>
                                {inv.type === "AUCTION" ? "Auction" : "Market"}
                              </span>
                              <span className={`rounded px-1.5 py-0.5 text-[9px] uppercase font-semibold ${
                                paid ? "bg-emerald-500/10 text-emerald-300" : "bg-yellow-500/10 text-yellow-300"
                              }`}>
                                {paid ? "Paid" : "Pending"}
                              </span>
                            </div>
                          </div>
                        </div>
                        {inv.subtotal && inv.buyerPremium && (
                          <div className="mt-2 flex gap-3 text-[10px] text-gray-600">
                            <span>Hammer: {inv.subtotal}</span>
                            <span>Premium: {inv.buyerPremium}</span>
                            {inv.tax && inv.tax !== "$0.00" && <span>Tax: {inv.tax}</span>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  const color =
    accent === "emerald" ? "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-300" :
    accent === "yellow"  ? "border-yellow-500/20 bg-yellow-500/[0.06] text-yellow-300" :
    "border-[#c8a96b]/20 bg-[#c8a96b]/[0.06] text-[#e7c98a]";
  return (
    <div className={`rounded-xl border p-4 ${color}`}>
      <div className="text-[10px] uppercase tracking-widest text-gray-500">{label}</div>
      <div className="mt-2 font-serif text-3xl">{value}</div>
    </div>
  );
}

function Row({ label, value, mono, accent }: { label: string; value: string; mono?: boolean; accent?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/[0.06] pb-3">
      <div className="text-xs uppercase tracking-widest text-gray-500 shrink-0">{label}</div>
      <div className={`text-right text-sm ${mono ? "font-mono text-gray-400" : accent ? "text-[#e7c77f]" : "text-[#c0c0c0]"} truncate max-w-[220px]`}>{value}</div>
    </div>
  );
}
