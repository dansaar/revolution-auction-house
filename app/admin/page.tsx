"use client";

import "@/lib/amplifyclient";
import { toast } from "sonner";

import { useEffect, useState } from "react";
import Link from "next/link";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";
import { isAdminUser } from "@/lib/sellers";
import { BUYER_TIERS, getTier, formatTierLimit } from "@/lib/tiers";

const client = generateClient<Schema>();

export default function AdminPage() {
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [stats, setStats] = useState({
    auctions: 0,
    marketplace: 0,
    bids: 0,
    watchlist: 0,
  });
  const [pendingVerifications, setPendingVerifications] = useState<any[]>([]);
  const [approvalTiers, setApprovalTiers] = useState<Record<string, string>>({});
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [pendingInvoices, setPendingInvoices] = useState<Record<string, any[]>>({});

  async function loadPendingVerifications() {
    try {
      const result = await client.models.BuyerProfile.list({
        filter: { status: { eq: "PENDING_REVIEW" } },
        authMode: "userPool",
      } as any);

      const pending = result.data || [];
      setPendingVerifications(pending);

      const defaults: Record<string, string> = {};
      for (const p of pending) {
        defaults[p.userId] = p.requestedTier && p.requestedTier !== "VERIFIED" ? p.requestedTier : "PREMIUM";
      }
      setApprovalTiers((prev) => ({ ...defaults, ...prev }));

      // Fetch invoices for each pending buyer
      const invoiceMap: Record<string, any[]> = {};
      await Promise.allSettled(
        pending.map(async (p: any) => {
          try {
            const all: any[] = [];
            let nextToken: string | undefined;
            do {
              const res: any = await (client.models.Invoice as any).invoicesByBuyer(
                { buyerUserId: p.userId },
                { authMode: "userPool", limit: 50, ...(nextToken ? { nextToken } : {}) },
              );
              all.push(...(res.data || []));
              nextToken = res.nextToken ?? undefined;
            } while (nextToken);
            all.sort((a, b) => new Date(b.paidAt || b.createdAt || 0).getTime() - new Date(a.paidAt || a.createdAt || 0).getTime());
            invoiceMap[p.userId] = all;
          } catch {
            invoiceMap[p.userId] = [];
          }
        }),
      );
      setPendingInvoices(invoiceMap);
    } catch (err) {
      console.error("Failed to load pending verifications", err);
    }
  }

  useEffect(() => {
    async function loadAdmin() {
      try {
        if (!await isAdminUser()) {
          setIsAdmin(false);
          return;
        }

        setIsAdmin(true);

        const [auctions, marketplace, bids, watchlist] = await Promise.all([
          client.models.Auction.list({ authMode: "apiKey" }),
          client.models.MarketplaceListing.list({ authMode: "apiKey" }),
          client.models.Bid.list({ authMode: "apiKey" }),
          client.models.WatchlistItem.list({ authMode: "userPool" }),
        ]);

        setStats({
          auctions: auctions.data.length,
          marketplace: marketplace.data.length,
          bids: bids.data.length,
          watchlist: watchlist.data.length,
        });

        await loadPendingVerifications();
      } catch {
        setIsAdmin(false);
      } finally {
        setChecking(false);
      }
    }

    loadAdmin();
  }, []);

  async function handleReview(userId: string, approved: boolean) {
    if (processingIds.has(userId)) return;

    setProcessingIds((prev) => new Set(prev).add(userId));

    try {
      const tier = approved ? (approvalTiers[userId] || "VERIFIED") : undefined;

      await client.mutations.reviewBuyerVerification(
        { userId, approved, ...(tier ? { tier } : {}) },
        { authMode: "userPool" } as any,
      );

      await loadPendingVerifications();
    } catch (err) {
      console.error("Review failed", err);
      toast.error("Failed to process request.");
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }
  }

  if (checking) {
    return (
      <main className="min-h-screen bg-[#050607] p-10 text-white">
        Checking admin access...
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050607] px-6 text-white">
        <div className="max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
          <h1 className="font-serif text-3xl text-[#c0c0c0]">
            Admin Access Required
          </h1>
          <p className="mt-3 text-gray-400">
            You do not have permission to view this page.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block rounded bg-[#c0c0c0] px-5 py-3 font-semibold text-black"
          >
            Back Home
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050607] px-6 py-12 text-white">
      <div className="mx-auto max-w-6xl">
        <div className="border-b border-white/10 pb-8">
          <div className="text-xs uppercase tracking-[0.3em] text-gray-500">
            Revolution Auction House
          </div>
          <h1 className="mt-3 font-serif text-5xl text-[#c0c0c0]">
            Admin Dashboard
          </h1>
          <p className="mt-3 text-gray-400">
            Platform overview, moderation, and operations.
          </p>
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-4">
          <Stat label="Auctions" value={stats.auctions} />
          <Stat label="Marketplace" value={stats.marketplace} />
          <Stat label="Bids" value={stats.bids} />
          <Stat label="Watchlist Items" value={stats.watchlist} />
        </div>

        {/* Pending Buyer Verification Queue */}
        <section className="mt-10">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-serif text-3xl text-[#d7d7d7]">
              Pending Buyer Verifications
              {pendingVerifications.length > 0 && (
                <span className="ml-3 inline-flex items-center justify-center rounded-full bg-yellow-500/20 px-2.5 py-0.5 text-sm font-bold text-yellow-300">
                  {pendingVerifications.length}
                </span>
              )}
            </h2>
          </div>

          {pendingVerifications.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6 text-gray-500">
              No pending verification requests.
            </div>
          ) : (
            <div className="space-y-4">
              {pendingVerifications.map((profile) => {
                const currentTier = getTier(profile.verificationTier || "BASIC");
                const requestedTierData = getTier(profile.requestedTier || "PREMIUM");
                const isProcessing = processingIds.has(profile.userId);
                const invoices = pendingInvoices[profile.userId] ?? [];
                const totalSpend = invoices.reduce((sum: number, inv: any) => {
                  const n = parseFloat(String(inv.amount || "0").replace(/[$,]/g, ""));
                  return sum + (isNaN(n) ? 0 : n);
                }, 0);

                return (
                  <div
                    key={profile.userId}
                    className="rounded-xl border border-yellow-400/20 bg-yellow-400/5 p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-white">
                          {profile.email}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-3 text-sm text-gray-400">
                          <span>
                            Current:{" "}
                            <span className="text-[#c0c0c0]">
                              {currentTier.name} ({formatTierLimit(currentTier.code)})
                            </span>
                          </span>
                          <span>→</span>
                          <span>
                            Requested:{" "}
                            <span className="text-[#e7c77f]">
                              {requestedTierData.name} ({formatTierLimit(requestedTierData.code)})
                            </span>
                          </span>
                        </div>
                        {profile.verificationNotes && (
                          <div className="mt-3 rounded border border-white/10 bg-black/30 p-3 text-sm text-gray-300">
                            {profile.verificationNotes}
                          </div>
                        )}

                        {/* Purchase history */}
                        <div className="mt-4">
                          <div className="mb-2 flex items-center gap-3 text-xs uppercase tracking-widest text-gray-500">
                            <span>Purchase History</span>
                            {invoices.length > 0 && (
                              <span className="text-[#e7c77f]">{invoices.length} invoice{invoices.length !== 1 ? "s" : ""} · ${totalSpend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} total</span>
                            )}
                          </div>
                          {invoices.length === 0 ? (
                            <div className="text-xs text-gray-600 italic">No purchases on record.</div>
                          ) : (
                            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                              {invoices.map((inv: any) => (
                                <div key={inv.id} className="flex items-center justify-between rounded border border-white/[0.06] bg-black/20 px-3 py-1.5 text-xs">
                                  <div className="min-w-0 flex-1">
                                    <div className="truncate text-gray-300">{inv.title || "—"}</div>
                                    <div className="text-gray-600">{inv.paidAt ? new Date(inv.paidAt).toLocaleDateString() : "—"}</div>
                                  </div>
                                  <div className="ml-3 shrink-0 font-semibold text-[#e7c77f]">{inv.amount || "—"}</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-start">
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] uppercase tracking-[0.15em] text-gray-500">
                            Approve as
                          </label>
                          <select
                            value={approvalTiers[profile.userId] || "PREMIUM"}
                            onChange={(e) =>
                              setApprovalTiers((prev) => ({
                                ...prev,
                                [profile.userId]: e.target.value,
                              }))
                            }
                            className="rounded border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none focus:border-[#d6aa55]/50"
                          >
                            {BUYER_TIERS.filter((t) => t.code !== "BASIC" && t.code !== "VERIFIED").map((tier) => (
                              <option key={tier.code} value={tier.code}>
                                {tier.name} — {formatTierLimit(tier.code)}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="flex flex-col gap-2 sm:mt-6">
                          <button
                            disabled={isProcessing}
                            onClick={() => handleReview(profile.userId, true)}
                            className="rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
                          >
                            {isProcessing ? "..." : "Approve"}
                          </button>

                          <button
                            disabled={isProcessing}
                            onClick={() => handleReview(profile.userId, false)}
                            className="rounded border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
                          >
                            {isProcessing ? "..." : "Decline"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          <AdminCard
            title="Manage Auctions"
            description="Review auctions, force-end/cancel, and open per-auction bid audits."
            href="/admin/auctions"
          />

          <AdminCard
            title="Manage Marketplace"
            description="Review listings, sellers, and featured inventory."
            href="/admin/marketplace"
          />

          <AdminCard
            title="Seller Controls"
            description="Approve sellers and manage invite-only access."
            href="/admin/sellers"
          />

          <AdminCard
            title="User Management"
            description="View all buyers, edit tiers, purchase history, and online status."
            href="/admin/users"
          />

          <AdminCard
            title="Revenue Dashboard"
            description="Gross revenue, buyer premiums, monthly trend, top sellers, and transaction log."
            href="/admin/revenue"
          />

          <AdminCard
            title="Shill Detection"
            description="Flag bidder/seller pairs with suspicious concentration or identity overlap."
            href="/admin/shill"
          />

          <AdminCard
            title="System Health"
            description="Stripe wiring checks and the in-app server-error backstop."
            href="/admin/system"
          />
        </div>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <div className="text-xs uppercase tracking-[0.22em] text-gray-500">
        {label}
      </div>
      <div className="mt-3 font-serif text-4xl text-[#c0c0c0]">{value}</div>
    </div>
  );
}

function AdminCard({
  title,
  description,
  href,
}: {
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition hover:border-[#c0c0c0]/40 hover:bg-white/[0.06]"
    >
      <h2 className="font-serif text-2xl text-white">{title}</h2>
      <p className="mt-3 text-sm text-gray-400">{description}</p>
      <div className="mt-6 text-sm font-semibold text-[#c0c0c0]">Open →</div>
    </Link>
  );
}
