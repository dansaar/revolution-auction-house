"use client";

import "@/lib/amplifyclient";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";
import { isAdminUser, adminFetchAllInvoices } from "@/lib/sellers";
import { viewInvoicePdf, downloadInvoicePdf } from "@/lib/invoicePdf";
import { toast } from "sonner";
import { confirmDialog } from "@/lib/confirm";

const client = generateClient<Schema>();

function moneyToNumber(value: string | number | null | undefined) {
  if (typeof value === "number") return value;
  if (!value) return 0;
  return Number(String(value).replace(/[$,]/g, ""));
}

function isEnded(auction: any) {
  return Boolean(
    auction?.ended ||
    (auction?.endsAt && new Date(auction.endsAt).getTime() <= Date.now()),
  );
}

export default function AdminAuctionsPage() {
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [auctions, setAuctions] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [processingId, setProcessingId] = useState<string | null>(null);

  async function loadData() {
    const [auctionResult, allInvoices] = await Promise.all([
      client.models.Auction.list({ authMode: "apiKey", limit: 1000 } as any),
      adminFetchAllInvoices(),
    ]);

    const sorted = [...(auctionResult.data || [])].sort(
      (a: any, b: any) =>
        new Date(b.endsAt || b.createdAt || 0).getTime() -
        new Date(a.endsAt || a.createdAt || 0).getTime(),
    );

    setAuctions(sorted);
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
        // Live updates: reflect sellers creating/ending and other admins' changes.
        subs = [
          client.models.Auction.onCreate({ authMode: "apiKey" } as any).subscribe({ next: scheduleRefresh }),
          client.models.Auction.onUpdate({ authMode: "apiKey" } as any).subscribe({ next: scheduleRefresh }),
          client.models.Auction.onDelete({ authMode: "apiKey" } as any).subscribe({ next: scheduleRefresh }),
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

  async function forceEnd(auction: any) {
    if (!(await confirmDialog({ title: "Force-end auction", message: `Force-end "${auction.title}"? This cannot be undone.`, confirmText: "Force End", danger: true }))) return;
    try {
      setProcessingId(auction.id);
      // Use finalizeAuction so the auction is properly settled: winner set from
      // the live leader, reserve checked, winner notified. (Just flipping
      // ended/status leaves it with no winner and unpayable.)
      const res = await client.mutations.finalizeAuction(
        { auctionId: auction.id },
        { authMode: "userPool" } as any,
      );
      if (!res.data?.success) {
        throw new Error(res.data?.message || "Finalize failed");
      }
      await loadData();
      toast.success(
        res.data?.status === "RESERVE_NOT_MET"
          ? "Ended — reserve not met (no winner)."
          : "Auction ended and finalized.",
      );
    } catch (err) {
      console.error(err);
      toast.error("Failed to end auction.");
    } finally {
      setProcessingId(null);
    }
  }

  async function cancelAuction(auction: any) {
    if (!(await confirmDialog({ title: "Cancel auction", message: `Cancel "${auction.title}"? This will mark it CANCELLED with no winner.`, confirmText: "Cancel Auction", cancelText: "Keep", danger: true }))) return;
    try {
      setProcessingId(auction.id);
      await client.models.Auction.update(
        { id: auction.id, ended: true, status: "CANCELLED" },
        { authMode: "userPool" } as any,
      );
      await loadData();
      toast.success("Auction cancelled.");
    } catch (err) {
      console.error(err);
      toast.error("Failed to cancel auction.");
    } finally {
      setProcessingId(null);
    }
  }

  async function deleteAuction(auction: any) {
    if (!(await confirmDialog({ title: "Delete auction", message: `Permanently delete "${auction.title}"? This cannot be undone. Only delete auctions with no bids or winner.`, confirmText: "Delete", danger: true }))) return;
    try {
      setProcessingId(auction.id);
      await client.models.Auction.delete(
        { id: auction.id },
        { authMode: "userPool" } as any,
      );
      await loadData();
      toast.success("Auction deleted.");
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete auction.");
    } finally {
      setProcessingId(null);
    }
  }

  const filtered = useMemo(() => {
    const search = searchText.trim().toLowerCase();
    return auctions.filter((a: any) => {
      const ended = isEnded(a);
      const status = a.status || (ended ? "ENDED" : "LIVE");

      if (filterStatus === "LIVE" && (ended || status === "CANCELLED")) return false;
      if (filterStatus === "ENDED" && (!ended || status === "CANCELLED")) return false;
      if (filterStatus === "CANCELLED" && status !== "CANCELLED") return false;

      if (search) {
        return (
          String(a.title || "").toLowerCase().includes(search) ||
          String(a.sellerEmail || "").toLowerCase().includes(search) ||
          String(a.sellerPublicId || "").toLowerCase().includes(search) ||
          String(a.id || "").toLowerCase().includes(search)
        );
      }
      return true;
    });
  }, [auctions, searchText, filterStatus]);

  const stats = useMemo(() => {
    const live = auctions.filter((a: any) => !isEnded(a) && a.status !== "CANCELLED").length;
    const ended = auctions.filter((a: any) => isEnded(a) && a.status !== "CANCELLED").length;
    const cancelled = auctions.filter((a: any) => a.status === "CANCELLED").length;
    return { live, ended, cancelled, total: auctions.length };
  }, [auctions]);

  if (checking || loading) {
    return (
      <main className="min-h-screen bg-[#050607] p-10 text-white">
        Loading auctions...
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

        <h1 className="mt-6 font-serif text-5xl text-[#c0c0c0]">Manage Auctions</h1>

        {/* Stats */}
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Total", value: stats.total, key: "ALL" },
            { label: "Live", value: stats.live, key: "LIVE" },
            { label: "Ended", value: stats.ended, key: "ENDED" },
            { label: "Cancelled", value: stats.cancelled, key: "CANCELLED" },
          ].map(({ label, value, key }) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilterStatus(filterStatus === key ? "ALL" : key)}
              className={`rounded-xl border p-4 text-left transition ${
                filterStatus === key
                  ? "border-[#d6aa55] bg-gradient-to-b from-[#241a09] to-[#1a1408] ring-1 ring-[#d6aa55]/50 shadow-[0_0_20px_rgba(214,170,85,0.28)]"
                  : "border-white/10 bg-white/[0.03] opacity-70 hover:opacity-100 hover:border-[#d6aa55]/30"
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
            placeholder="Search title, seller email, seller ID, or auction ID"
            className="w-full rounded-xl border border-white/10 bg-black px-5 py-3 text-white outline-none placeholder:text-gray-600 focus:border-[#d6aa55]/50"
          />
        </div>

        <div className="mt-3 text-sm text-gray-500">
          Showing {filtered.length} of {auctions.length}
        </div>

        {/* Table */}
        <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/[0.04] text-xs uppercase tracking-[0.18em] text-gray-500">
              <tr>
                <th className="p-4">Title</th>
                <th className="p-4">Seller</th>
                <th className="p-4">Hammer / Paid</th>
                <th className="p-4">Status</th>
                <th className="p-4">Dates</th>
                <th className="p-4">Bids</th>
                <th className="p-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-500">
                    No auctions found.
                  </td>
                </tr>
              ) : (
                filtered.map((auction: any) => {
                  const ended = isEnded(auction);
                  const status = auction.status || (ended ? "ENDED" : "LIVE");
                  const isCancelled = status === "CANCELLED";
                  const invoice = invoices.find(
                    (inv: any) => String(inv.auctionId) === String(auction.id),
                  );
                  const busy = processingId === auction.id;

                  return (
                    <tr key={auction.id} className="border-t border-white/10 hover:bg-white/[0.02]">
                      <td className="max-w-[200px] p-4">
                        <div className="truncate font-medium text-white">{auction.title}</div>
                        <div className="truncate text-xs text-gray-600">{auction.id}</div>
                      </td>

                      <td className="p-4 text-gray-400">
                        <div>{auction.sellerEmail || "—"}</div>
                        {auction.sellerPublicId && (
                          <div className="text-xs text-gray-600">{auction.sellerPublicId}</div>
                        )}
                        {(() => {
                          // No sale if the reserve wasn't met — don't imply a winner.
                          const reserveUnmet =
                            auction.status === "RESERVE_NOT_MET" ||
                            (auction.reservePrice &&
                              moneyToNumber(auction.price || 0) < moneyToNumber(auction.reservePrice || 0));
                          if (reserveUnmet) {
                            return (
                              <div className="mt-1 text-xs text-yellow-400/80">Reserve not met — no sale</div>
                            );
                          }
                          return (invoice?.buyerEmail || auction.winnerEmail) ? (
                            <div className="mt-1 text-xs text-emerald-400/80">
                              Winner: {invoice?.buyerEmail || auction.winnerEmail}
                            </div>
                          ) : null;
                        })()}
                      </td>

                      <td className="p-4 text-[#c0c0c0]">
                        <div>{auction.winningBid || auction.price || "—"}</div>
                        {invoice && (
                          <div className="text-xs text-emerald-400">
                            Paid: ${moneyToNumber(invoice.amount).toLocaleString()}
                          </div>
                        )}
                      </td>

                      <td className="p-4">
                        <span
                          className={`rounded px-2 py-0.5 text-xs uppercase ${
                            isCancelled
                              ? "bg-gray-500/10 text-gray-400"
                              : ended
                              ? "bg-red-500/10 text-red-300"
                              : "bg-emerald-500/10 text-emerald-300"
                          }`}
                        >
                          {status}
                        </span>
                      </td>

                      <td className="p-4 text-xs text-gray-400">
                        {auction.createdAt && (
                          <div>Listed {new Date(auction.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
                        )}
                        {auction.endsAt && (
                          <div className="mt-0.5">Ends {new Date(auction.endsAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
                        )}
                        {invoice?.paidAt && (
                          <div className="mt-0.5 text-emerald-400">Sold {new Date(invoice.paidAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
                        )}
                      </td>

                      <td className="p-4 text-gray-400">{auction.bids || 0}</td>

                      <td className="p-4">
                        <div className="flex flex-wrap gap-2">
                          <Link
                            href={`/auctions/${auction.id}`}
                            className="rounded border border-white/10 px-3 py-1.5 text-xs text-gray-400 hover:text-white"
                          >
                            View
                          </Link>
                          <Link
                            href={`/auctions/${auction.id}/audit`}
                            className="rounded border border-[#d6aa55]/20 px-3 py-1.5 text-xs text-[#e7c77f] hover:bg-[#1a1408]"
                          >
                            Audit
                          </Link>
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
                          {!ended && !isCancelled && (
                            <>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => forceEnd(auction)}
                                className="rounded border border-orange-500/20 bg-orange-500/10 px-3 py-1.5 text-xs text-orange-300 hover:bg-orange-500/20 disabled:opacity-50"
                              >
                                {busy ? "..." : "Force End"}
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => cancelAuction(auction)}
                                className="rounded border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/20 disabled:opacity-50"
                              >
                                {busy ? "..." : "Cancel"}
                              </button>
                            </>
                          )}
                          {!auction.paid && !auction.winnerUserId && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => deleteAuction(auction)}
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
