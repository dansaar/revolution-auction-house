"use client";

import "@/lib/amplifyclient";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";
import { isAdminUser, adminFetchAllInvoices } from "@/lib/sellers";
import { viewInvoicePdf, downloadInvoicePdf } from "@/lib/invoicePdf";
import { toast } from "sonner";

const client = generateClient<Schema>();

function moneyToNumber(value: string | number | null | undefined) {
  if (typeof value === "number") return value;
  if (!value) return 0;
  return Number(String(value).replace(/[$,]/g, ""));
}

export default function AdminMarketplacePage() {
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [listings, setListings] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [processingId, setProcessingId] = useState<string | null>(null);

  async function loadData() {
    const [listingResult, allInvoices] = await Promise.all([
      client.models.MarketplaceListing.list({ authMode: "apiKey", limit: 1000 } as any),
      adminFetchAllInvoices(),
    ]);

    const sorted = [...(listingResult.data || [])].sort(
      (a: any, b: any) =>
        new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(),
    );

    setListings(sorted);
    setInvoices(allInvoices);
  }

  useEffect(() => {
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => { loadData(); }, 800);
    };
    let subs: { unsubscribe: () => void }[] = [];

    async function load() {
      try {
        if (!await isAdminUser()) return;
        setIsAdmin(true);
        await loadData();
        // Live updates: reflect new listings, sales, and other admins' changes.
        subs = [
          client.models.MarketplaceListing.onCreate({ authMode: "apiKey" } as any).subscribe({ next: scheduleRefresh }),
          client.models.MarketplaceListing.onUpdate({ authMode: "apiKey" } as any).subscribe({ next: scheduleRefresh }),
          client.models.MarketplaceListing.onDelete({ authMode: "apiKey" } as any).subscribe({ next: scheduleRefresh }),
        ];
      } finally {
        setChecking(false);
        setLoading(false);
      }
    }
    load();

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      subs.forEach((s) => s.unsubscribe());
    };
  }, []);

  async function deactivateListing(listing: any) {
    if (!confirm(`Deactivate "${listing.title}"? It will no longer appear in the marketplace.`)) return;
    try {
      setProcessingId(listing.id);
      await client.models.MarketplaceListing.update(
        { id: listing.id, status: "INACTIVE" },
        { authMode: "userPool" } as any,
      );
      await loadData();
      toast.success("Listing deactivated.");
    } catch (err) {
      console.error(err);
      toast.error("Failed to deactivate listing.");
    } finally {
      setProcessingId(null);
    }
  }

  async function reactivateListing(listing: any) {
    try {
      setProcessingId(listing.id);
      await client.models.MarketplaceListing.update(
        { id: listing.id, status: "ACTIVE" },
        { authMode: "userPool" } as any,
      );
      await loadData();
      toast.success("Listing reactivated.");
    } catch (err) {
      console.error(err);
      toast.error("Failed to reactivate listing.");
    } finally {
      setProcessingId(null);
    }
  }

  async function deleteListing(listing: any) {
    if (!confirm(`Permanently delete "${listing.title}"?\n\nThis cannot be undone. Only delete listings with no buyer.`)) return;
    try {
      setProcessingId(listing.id);
      await client.models.MarketplaceListing.delete(
        { id: listing.id },
        { authMode: "userPool" } as any,
      );
      await loadData();
      toast.success("Listing deleted.");
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete listing.");
    } finally {
      setProcessingId(null);
    }
  }

  async function toggleFeatured(listing: any) {
    try {
      setProcessingId(listing.id);
      await client.models.MarketplaceListing.update(
        { id: listing.id, featured: !listing.featured },
        { authMode: "userPool" } as any,
      );
      await loadData();
      toast.success(listing.featured ? "Removed from featured." : "Marked as featured.");
    } catch (err) {
      console.error(err);
      toast.error("Failed to update listing.");
    } finally {
      setProcessingId(null);
    }
  }

  const filtered = useMemo(() => {
    const search = searchText.trim().toLowerCase();
    return listings.filter((l: any) => {
      const status = l.status || "ACTIVE";
      if (filterStatus === "ACTIVE" && status !== "ACTIVE") return false;
      if (filterStatus === "SOLD" && !l.sold) return false;
      if (filterStatus === "INACTIVE" && status !== "INACTIVE") return false;
      if (filterStatus === "FEATURED" && !l.featured) return false;

      if (search) {
        return (
          String(l.title || "").toLowerCase().includes(search) ||
          String(l.sellerEmail || "").toLowerCase().includes(search) ||
          String(l.buyerEmail || "").toLowerCase().includes(search) ||
          String(l.id || "").toLowerCase().includes(search)
        );
      }
      return true;
    });
  }, [listings, searchText, filterStatus]);

  const stats = useMemo(() => {
    const active = listings.filter((l: any) => (l.status || "ACTIVE") === "ACTIVE" && !l.sold).length;
    const sold = listings.filter((l: any) => l.sold).length;
    const inactive = listings.filter((l: any) => l.status === "INACTIVE").length;
    const featured = listings.filter((l: any) => l.featured).length;
    return { active, sold, inactive, featured, total: listings.length };
  }, [listings]);

  if (checking || loading) {
    return (
      <main className="min-h-screen bg-[#050607] p-10 text-white">
        Loading marketplace...
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

        <h1 className="mt-6 font-serif text-5xl text-[#c0c0c0]">Marketplace Listings</h1>

        {/* Stats */}
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: "Total", value: stats.total, key: "ALL" },
            { label: "Active", value: stats.active, key: "ACTIVE" },
            { label: "Sold", value: stats.sold, key: "SOLD" },
            { label: "Inactive", value: stats.inactive, key: "INACTIVE" },
            { label: "Featured", value: stats.featured, key: "FEATURED" },
          ].map(({ label, value, key }) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilterStatus(filterStatus === key ? "ALL" : key)}
              className={`rounded-xl border p-4 text-left transition ${
                filterStatus === key
                  ? "border-[#d6aa55]/50 bg-[#1a1408]"
                  : "border-white/10 bg-white/[0.03] hover:border-white/20"
              }`}
            >
              <div className="text-xs uppercase tracking-[0.18em] text-gray-500">{label}</div>
              <div className="mt-2 font-serif text-3xl text-[#c0c0c0]">{value}</div>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="mt-6">
          <input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search title, seller email, buyer email, or listing ID"
            className="w-full rounded-xl border border-white/10 bg-black px-5 py-3 text-white outline-none placeholder:text-gray-600 focus:border-[#d6aa55]/50"
          />
        </div>

        <div className="mt-3 text-sm text-gray-500">
          Showing {filtered.length} of {listings.length}
        </div>

        {/* Table */}
        <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/[0.04] text-xs uppercase tracking-[0.18em] text-gray-500">
              <tr>
                <th className="p-4">Title</th>
                <th className="p-4">Seller</th>
                <th className="p-4">Price / Paid</th>
                <th className="p-4">Status</th>
                <th className="p-4">Dates</th>
                <th className="p-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-500">
                    No listings found.
                  </td>
                </tr>
              ) : (
                filtered.map((listing: any) => {
                  const status = listing.status || "ACTIVE";
                  const invoice = invoices.find(
                    (inv: any) => String(inv.listingId) === String(listing.id),
                  );
                  const busy = processingId === listing.id;

                  return (
                    <tr key={listing.id} className="border-t border-white/10 hover:bg-white/[0.02]">
                      <td className="max-w-[200px] p-4">
                        <div className="truncate font-medium text-white">{listing.title}</div>
                        {listing.featured && (
                          <div className="text-xs text-[#e7c77f]">Featured</div>
                        )}
                        <div className="truncate text-xs text-gray-600">{listing.id}</div>
                      </td>

                      <td className="p-4 text-gray-400">
                        <div>{listing.sellerEmail || "—"}</div>
                        {listing.sellerPublicId && (
                          <div className="text-xs text-gray-600">{listing.sellerPublicId}</div>
                        )}
                        {(listing.buyerEmail || invoice?.buyerEmail) && (
                          <div className="mt-1 text-xs text-emerald-400/80">
                            Buyer: {listing.buyerEmail || invoice?.buyerEmail}
                          </div>
                        )}
                      </td>

                      <td className="p-4 text-[#c0c0c0]">
                        <div>{listing.acceptedOfferAmount || listing.price || "—"}</div>
                        {invoice && (
                          <div className="text-xs text-emerald-400">
                            Paid: ${moneyToNumber(invoice.amount).toLocaleString()}
                          </div>
                        )}
                      </td>

                      <td className="p-4">
                        <span
                          className={`rounded px-2 py-0.5 text-xs uppercase ${
                            listing.sold
                              ? "bg-blue-500/10 text-blue-300"
                              : status === "INACTIVE"
                              ? "bg-gray-500/10 text-gray-400"
                              : "bg-emerald-500/10 text-emerald-300"
                          }`}
                        >
                          {listing.sold ? "SOLD" : status}
                        </span>
                      </td>

                      <td className="p-4 text-xs text-gray-400">
                        {listing.createdAt && (
                          <div>Listed {new Date(listing.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
                        )}
                        {(invoice?.paidAt || listing.paidAt) && (
                          <div className="mt-0.5 text-emerald-400">Sold {new Date(invoice?.paidAt || listing.paidAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
                        )}
                      </td>

                      <td className="p-4">
                        <div className="flex flex-wrap gap-2">
                          <Link
                            href={`/marketplace/${listing.id}`}
                            className="rounded border border-white/10 px-3 py-1.5 text-xs text-gray-400 hover:text-white"
                          >
                            View
                          </Link>
          {!listing.sold && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => toggleFeatured(listing)}
                              className={`rounded border px-3 py-1.5 text-xs disabled:opacity-50 ${
                                listing.featured
                                  ? "border-[#d6aa55]/30 text-[#e7c77f] hover:bg-[#1a1408]"
                                  : "border-white/10 text-gray-400 hover:text-white"
                              }`}
                            >
                              {listing.featured ? "Unfeature" : "Feature"}
                            </button>
                          )}
                          {invoice && (
                            <>
                              <button
                                type="button"
                                onClick={() => viewInvoicePdf(invoice.id)}
                                className="rounded border border-white/10 px-3 py-1.5 text-xs text-gray-300 hover:text-white"
                              >
                                Invoice
                              </button>
                              <button
                                type="button"
                                onClick={() => downloadInvoicePdf(invoice.id)}
                                className="rounded border border-[#d6aa55]/30 px-3 py-1.5 text-xs text-[#e7c77f] hover:bg-[#1a1408]"
                              >
                                ↓
                              </button>
                            </>
                          )}
                          {!listing.sold && (
                            status === "INACTIVE" ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => reactivateListing(listing)}
                                className="rounded border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
                              >
                                {busy ? "..." : "Reactivate"}
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => deactivateListing(listing)}
                                className="rounded border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/20 disabled:opacity-50"
                              >
                                {busy ? "..." : "Deactivate"}
                              </button>
                            )
                          )}
                          {!listing.sold && !listing.paid && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => deleteListing(listing)}
                              className="rounded border border-red-700/40 bg-red-900/20 px-3 py-1.5 text-xs text-red-400 hover:bg-red-900/40 disabled:opacity-50"
                            >
                              {busy ? "..." : "Delete"}
                            </button>
                          )}
                        </div>
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
