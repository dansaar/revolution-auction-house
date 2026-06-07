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

const TIER_ORDER = ["BASIC", "VERIFIED", "PREMIUM", "PRIVATE", "TROPHY"];

function tierColor(code: string) {
  switch (code) {
    case "TROPHY": return "text-yellow-300 border-yellow-400/30 bg-yellow-400/10";
    case "PRIVATE": return "text-purple-300 border-purple-400/30 bg-purple-400/10";
    case "PREMIUM": return "text-blue-300 border-blue-400/30 bg-blue-400/10";
    case "VERIFIED": return "text-emerald-300 border-emerald-400/30 bg-emerald-400/10";
    default: return "text-gray-400 border-white/10 bg-white/[0.04]";
  }
}

function statusColor(status: string) {
  switch (status) {
    case "APPROVED": return "text-emerald-300";
    case "PENDING_REVIEW": return "text-yellow-300";
    case "DECLINED": return "text-red-300";
    default: return "text-gray-400";
  }
}

export default function AdminBuyersPage() {
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [buyers, setBuyers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [filterTier, setFilterTier] = useState("ALL");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTier, setEditTier] = useState("BASIC");
  const [saving, setSaving] = useState(false);

  async function loadBuyers() {
    const result = await client.models.BuyerProfile.list({
      authMode: "userPool",
      limit: 1000,
    } as any);

    const sorted = [...(result.data || [])].sort((a: any, b: any) =>
      String(a.email || "").localeCompare(String(b.email || "")),
    );

    setBuyers(sorted);
  }

  useEffect(() => {
    async function load() {
      try {
        if (!await isAdminUser()) return;
        setIsAdmin(true);
        await loadBuyers();
      } finally {
        setChecking(false);
        setLoading(false);
      }
    }
    load();
  }, []);

  async function saveTier(buyer: any) {
    if (saving) return;
    try {
      setSaving(true);
      const tier = getTier(editTier);
      await client.models.BuyerProfile.update(
        {
          userId: buyer.userId,
          verificationTier: editTier,
          bidLimit: tier.limit,
          status: "APPROVED",
          reviewedAt: new Date().toISOString(),
        },
        { authMode: "userPool" } as any,
      );
      await loadBuyers();
      setEditingId(null);
      toast.success(`${buyer.email} updated to ${tier.name}`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to update tier.");
    } finally {
      setSaving(false);
    }
  }

  const filtered = useMemo(() => {
    const search = searchText.trim().toLowerCase();
    return buyers.filter((b: any) => {
      if (filterTier !== "ALL" && (b.verificationTier || "BASIC") !== filterTier) return false;
      if (filterStatus !== "ALL" && (b.status || "APPROVED") !== filterStatus) return false;
      if (search) {
        return (
          String(b.email || "").toLowerCase().includes(search) ||
          String(b.displayName || "").toLowerCase().includes(search) ||
          String(b.userId || "").toLowerCase().includes(search)
        );
      }
      return true;
    });
  }, [buyers, searchText, filterTier, filterStatus]);

  const tierCounts = useMemo(() => {
    const counts: Record<string, number> = { BASIC: 0, VERIFIED: 0, PREMIUM: 0, PRIVATE: 0, TROPHY: 0 };
    for (const b of buyers) {
      const t = b.verificationTier || "BASIC";
      if (t in counts) counts[t]++;
    }
    return counts;
  }, [buyers]);

  if (checking || loading) {
    return (
      <main className="min-h-screen bg-[#050607] p-10 text-white">
        Loading buyers...
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

  return (
    <main className="min-h-screen bg-[#050607] px-6 py-12 text-white">
      <div className="mx-auto max-w-7xl">
        <Link href="/admin" className="text-sm text-gray-500 hover:text-white">
          ← Back to Admin
        </Link>

        <div className="mt-6 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="font-serif text-5xl text-[#c0c0c0]">Buyer Management</h1>
            <p className="mt-3 text-gray-400">
              {buyers.length} total buyers — search, filter, and adjust tiers.
            </p>
          </div>
        </div>

        {/* Tier breakdown */}
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {BUYER_TIERS.map((tier) => (
            <button
              key={tier.code}
              type="button"
              onClick={() => setFilterTier(filterTier === tier.code ? "ALL" : tier.code)}
              className={`rounded-xl border p-4 text-left transition ${
                filterTier === tier.code
                  ? "border-[#d6aa55]/50 bg-[#1a1408]"
                  : "border-white/10 bg-white/[0.03] hover:border-white/20"
              }`}
            >
              <div className="text-xs uppercase tracking-[0.18em] text-gray-500">{tier.name}</div>
              <div className="mt-2 font-serif text-3xl text-[#c0c0c0]">{tierCounts[tier.code] ?? 0}</div>
              <div className="mt-1 text-xs text-gray-600">{formatTierLimit(tier.code)} limit</div>
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search email, name, or user ID"
            className="flex-1 rounded-xl border border-white/10 bg-black px-5 py-3 text-white outline-none placeholder:text-gray-600 focus:border-[#d6aa55]/50"
          />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-xl border border-white/10 bg-black px-4 py-3 text-white outline-none"
          >
            <option value="ALL">All Statuses</option>
            <option value="APPROVED">Approved</option>
            <option value="PENDING_REVIEW">Pending Review</option>
            <option value="DECLINED">Declined</option>
          </select>
        </div>

        {/* Results count */}
        <div className="mt-4 text-sm text-gray-500">
          Showing {filtered.length} of {buyers.length}
        </div>

        {/* Buyer list */}
        <div className="mt-4 overflow-hidden rounded-2xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/[0.04] text-xs uppercase tracking-[0.18em] text-gray-500">
              <tr>
                <th className="p-4">Buyer</th>
                <th className="p-4">Tier</th>
                <th className="p-4">Bid Limit</th>
                <th className="p-4">Status</th>
                <th className="p-4">Last Seen</th>
                <th className="p-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-500">
                    No buyers found.
                  </td>
                </tr>
              ) : (
                filtered.map((buyer: any) => {
                  const tierCode = buyer.verificationTier || "BASIC";
                  const tier = getTier(tierCode);
                  const isEditing = editingId === buyer.userId;

                  return (
                    <tr key={buyer.userId} className="border-t border-white/10 hover:bg-white/[0.02]">
                      <td className="p-4">
                        <div className="font-medium text-white">{buyer.email}</div>
                        {buyer.displayName && buyer.displayName !== buyer.email && (
                          <div className="text-xs text-gray-500">{buyer.displayName}</div>
                        )}
                        {buyer.phoneNumber && (
                          <div className="text-xs text-gray-600">{buyer.phoneNumber}</div>
                        )}
                      </td>

                      <td className="p-4">
                        {isEditing ? (
                          <select
                            value={editTier}
                            onChange={(e) => setEditTier(e.target.value)}
                            className="rounded border border-[#d6aa55]/30 bg-black px-2 py-1 text-sm text-white outline-none"
                            autoFocus
                          >
                            {TIER_ORDER.map((t) => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        ) : (
                          <span
                            className={`inline-flex rounded border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${tierColor(tierCode)}`}
                          >
                            {tier.name}
                          </span>
                        )}
                      </td>

                      <td className="p-4 text-[#c0c0c0]">
                        {isEditing
                          ? formatTierLimit(editTier)
                          : `$${Number(buyer.bidLimit || tier.limit).toLocaleString()}`}
                      </td>

                      <td className={`p-4 text-xs uppercase tracking-wide ${statusColor(buyer.status || "APPROVED")}`}>
                        {(buyer.status || "APPROVED").replace("_", " ")}
                      </td>

                      <td className="p-4 text-xs text-gray-500">
                        {buyer.lastSeenAt
                          ? new Date(buyer.lastSeenAt).toLocaleDateString()
                          : "—"}
                        {buyer.lastSeenPage && (
                          <div className="text-gray-600">{buyer.lastSeenPage}</div>
                        )}
                      </td>

                      <td className="p-4">
                        {isEditing ? (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => saveTier(buyer)}
                              className="rounded border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
                            >
                              {saving ? "Saving..." : "Save"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="rounded border border-white/10 px-3 py-1.5 text-xs text-gray-400 hover:text-white"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(buyer.userId);
                              setEditTier(tierCode);
                            }}
                            className="rounded border border-white/10 px-3 py-1.5 text-xs text-gray-400 hover:border-[#c0c0c0]/30 hover:text-white"
                          >
                            Edit Tier
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
