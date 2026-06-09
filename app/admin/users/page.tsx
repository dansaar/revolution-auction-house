"use client";

import "@/lib/amplifyclient";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";
import { isAdminUser } from "@/lib/sellers";
import { BUYER_TIERS, getTier, formatTierLimit } from "@/lib/tiers";
import { toast } from "sonner";

const client = generateClient<Schema>();

const TIER_ORDER = ["BASIC", "VERIFIED", "PREMIUM", "PRIVATE", "TROPHY"] as const;

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

type Tab = "buyers" | "sellers";

export default function AdminUsersPage() {
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const [buyers, setBuyers] = useState<any[]>([]);
  const [sellers, setSellers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [tab, setTab] = useState<Tab>("buyers");
  const [search, setSearch] = useState("");
  const [filterTier, setFilterTier] = useState("ALL");
  const [filterStatus, setFilterStatus] = useState("ALL");

  // inline edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTier, setEditTier] = useState("BASIC");
  const [saving, setSaving] = useState(false);

  // detail drawer
  const [drawerBuyer, setDrawerBuyer] = useState<any>(null);

  async function loadData() {
    const [buyerResult, sellerResult] = await Promise.all([
      client.models.BuyerProfile.list({ authMode: "userPool", limit: 2000 } as any),
      client.models.SellerProfile.list({ authMode: "userPool", limit: 2000 } as any),
    ]);
    setBuyers([...(buyerResult.data || [])].sort((a: any, b: any) => String(a.email || "").localeCompare(String(b.email || ""))));
    setSellers([...(sellerResult.data || [])].sort((a: any, b: any) => String(a.email || "").localeCompare(String(b.email || ""))));
  }

  useEffect(() => {
    async function load() {
      try {
        if (!await isAdminUser()) return;
        setIsAdmin(true);
        await loadData();
      } finally {
        setChecking(false);
        setLoading(false);
      }
    }
    load();
  }, []);

  async function saveBuyerTier(buyer: any) {
    if (saving) return;
    try {
      setSaving(true);
      const tier = getTier(editTier);
      await client.models.BuyerProfile.update(
        { userId: buyer.userId, verificationTier: editTier, bidLimit: tier.limit, status: "APPROVED", reviewedAt: new Date().toISOString() },
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

  async function toggleSeller(seller: any, action: "add" | "remove") {
    try {
      await client.mutations.manageSellerGroup(
        { email: seller.email, action },
        { authMode: "userPool" } as any,
      );
      await loadData();
      toast.success(action === "add" ? "Seller reinstated" : "Seller revoked");
    } catch {
      toast.error("Failed to update seller.");
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

  const filteredSellers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sellers.filter((s: any) => {
      if (filterStatus !== "ALL" && (s.status || "APPROVED") !== filterStatus) return false;
      if (q && !`${s.email} ${s.displayName}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [sellers, search, filterStatus]);

  const onlineCutoff = Date.now() - 5 * 60 * 1000;
  const onlineCount = buyers.filter((b: any) => b.lastSeenAt && new Date(b.lastSeenAt).getTime() >= onlineCutoff).length;
  const pendingCount = buyers.filter((b: any) => b.status === "PENDING_REVIEW").length;
  const tierCounts = useMemo(() => {
    const c: Record<string, number> = { BASIC: 0, VERIFIED: 0, PREMIUM: 0, PRIVATE: 0, TROPHY: 0 };
    for (const b of buyers) { const t = b.verificationTier || "BASIC"; if (t in c) c[t]++; }
    return c;
  }, [buyers]);

  if (checking || loading) return <main className="min-h-screen bg-[#050607] p-10 text-white">Loading...</main>;
  if (!isAdmin) return <main className="min-h-screen bg-[#050607] p-10 text-white">Admin access required.</main>;

  return (
    <main className="min-h-screen bg-[#050607] px-6 py-12 text-white">
      <div className="mx-auto max-w-7xl">
        <Link href="/admin" className="text-sm text-gray-500 hover:text-white">← Admin</Link>

        <h1 className="mt-6 font-serif text-5xl text-[#c0c0c0]">User Management</h1>
        <div className="mt-2 h-px w-48 bg-gradient-to-r from-transparent via-[#d6aa55]/60 to-transparent" />

        {/* Summary cards */}
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          <SummaryCard label="Total Buyers" value={buyers.length} />
          <SummaryCard label="Total Sellers" value={sellers.length} />
          <SummaryCard label="Online Now" value={onlineCount} accent="emerald" />
          <SummaryCard label="Pending Review" value={pendingCount} accent={pendingCount > 0 ? "yellow" : undefined} />
          {BUYER_TIERS.filter(t => t.code !== "BASIC").map(t => (
            <SummaryCard key={t.code} label={t.name} value={tierCounts[t.code] ?? 0} />
          ))}
        </div>

        {/* Tabs + search */}
        <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1 w-fit">
            {(["buyers", "sellers"] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => { setTab(t); setFilterTier("ALL"); setFilterStatus("ALL"); setSearch(""); }}
                className={`rounded-lg px-5 py-2 text-sm font-medium capitalize transition ${tab === t ? "bg-white/10 text-white" : "text-gray-400 hover:text-white"}`}
              >
                {t} <span className="ml-1 text-xs opacity-60">{t === "buyers" ? buyers.length : sellers.length}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search email, name, ID…"
              className="rounded-xl border border-white/10 bg-black px-4 py-2.5 text-sm text-white outline-none placeholder:text-gray-600 focus:border-[#d6aa55]/50 w-64"
            />
            {tab === "buyers" && (
              <select
                value={filterTier}
                onChange={(e) => setFilterTier(e.target.value)}
                className="rounded-xl border border-white/10 bg-black px-3 py-2.5 text-sm text-white outline-none"
              >
                <option value="ALL">All Tiers</option>
                {TIER_ORDER.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            )}
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
          {tab === "buyers" ? `${filteredBuyers.length} of ${buyers.length} buyers` : `${filteredSellers.length} of ${sellers.length} sellers`}
        </div>

        {/* Buyers table */}
        {tab === "buyers" && (
          <div className="mt-4 overflow-hidden rounded-2xl border border-white/10">
            <table className="w-full text-left text-sm">
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
                            <button
                              type="button"
                              onClick={() => setDrawerBuyer(buyer)}
                              className="font-medium text-white hover:text-[#e7c77f]"
                            >
                              {buyer.email}
                            </button>
                            {buyer.displayName && buyer.displayName !== buyer.email && (
                              <div className="text-xs text-gray-500">{buyer.displayName}</div>
                            )}
                            {buyer.phoneNumber && (
                              <div className="text-xs text-gray-600">{buyer.phoneNumber}</div>
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
                        {isEditing ? formatTierLimit(editTier) : `$${Number(buyer.bidLimit || tier.limit).toLocaleString()}`}
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
                          <button type="button" onClick={() => { setEditingId(buyer.userId); setEditTier(tierCode); }} className="rounded border border-white/10 px-3 py-1.5 text-xs text-gray-400 hover:border-[#c0c0c0]/30 hover:text-white">
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
        )}

        {/* Sellers table */}
        {tab === "sellers" && (
          <div className="mt-4 overflow-hidden rounded-2xl border border-white/10">
            <table className="w-full text-left text-sm">
              <thead className="bg-white/[0.04] text-xs uppercase tracking-[0.16em] text-gray-500">
                <tr>
                  <th className="p-4">Seller</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Approved By</th>
                  <th className="p-4">Approved At</th>
                  <th className="p-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSellers.length === 0 ? (
                  <tr><td colSpan={5} className="p-8 text-center text-gray-500">No sellers found.</td></tr>
                ) : filteredSellers.map((seller: any) => {
                  const isActive = seller.status === "APPROVED" || !seller.revokedAt;
                  return (
                    <tr key={seller.email} className="border-t border-white/[0.06] hover:bg-white/[0.02]">
                      <td className="p-4">
                        <div className="font-medium text-white">{seller.email}</div>
                        {seller.displayName && seller.displayName !== seller.email && (
                          <div className="text-xs text-gray-500">{seller.displayName}</div>
                        )}
                      </td>

                      <td className="p-4">
                        <span className={`inline-flex rounded border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${
                          isActive
                            ? "text-emerald-300 border-emerald-500/20 bg-emerald-500/10"
                            : "text-red-300 border-red-500/20 bg-red-500/10"
                        }`}>
                          {isActive ? "Active" : "Revoked"}
                        </span>
                      </td>

                      <td className="p-4 text-xs text-gray-500">{seller.approvedBy || "—"}</td>

                      <td className="p-4 text-xs text-gray-500">
                        {seller.approvedAt ? new Date(seller.approvedAt).toLocaleDateString() : "—"}
                      </td>

                      <td className="p-4">
                        {isActive ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`Revoke seller access for ${seller.email}?`)) toggleSeller(seller, "remove");
                            }}
                            className="rounded border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/20"
                          >
                            Revoke
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => toggleSeller(seller, "add")}
                            className="rounded border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-300 hover:bg-emerald-500/20"
                          >
                            Reinstate
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
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
          </div>
        </div>
      )}
    </main>
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
