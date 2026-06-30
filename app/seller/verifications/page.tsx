"use client";

import "@/lib/amplifyclient";
import { toast } from "sonner";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getCurrentUser } from "aws-amplify/auth";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";
import { isApprovedSeller, isAdminUser } from "@/lib/sellers";
import { BUYER_TIERS, getTier, formatTierLimit, privateBandLabel } from "@/lib/tiers";

const client = generateClient<Schema>();

// Sellers and admins can approve any upgrade tier. Private uses an exact $ limit.
const APPROVABLE_TIERS = BUYER_TIERS.filter((t) => t.code !== "BASIC");

export default function SellerVerificationsPage() {
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const [pending, setPending] = useState<any[]>([]);
  const [invoiceMap, setInvoiceMap] = useState<Record<string, any[]>>({});
  const [approvalTiers, setApprovalTiers] = useState<Record<string, string>>({});
  const [approvalLimits, setApprovalLimits] = useState<Record<string, string>>({});
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

  async function loadPending() {
    const result = await client.models.BuyerProfile.list({
      filter: { status: { eq: "PENDING_REVIEW" } },
      authMode: "userPool",
    } as any);

    const profiles = result.data || [];
    setPending(profiles);

    const defaults: Record<string, string> = {};
    const limitDefaults: Record<string, string> = {};
    for (const p of profiles) {
      defaults[p.userId] = p.requestedTier && !["BASIC", "VERIFIED"].includes(p.requestedTier)
        ? p.requestedTier
        : "PRIVATE";
      // Prefill the approval limit with what the buyer requested.
      if (p.requestedLimit) limitDefaults[p.userId] = String(p.requestedLimit);
    }
    setApprovalTiers((prev) => ({ ...defaults, ...prev }));
    setApprovalLimits((prev) => ({ ...limitDefaults, ...prev }));

    const map: Record<string, any[]> = {};
    await Promise.allSettled(
      profiles.map(async (p: any) => {
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
          map[p.userId] = all;
        } catch {
          map[p.userId] = [];
        }
      }),
    );
    setInvoiceMap(map);
  }

  useEffect(() => {
    async function init() {
      try {
        const user = await getCurrentUser();
        const email = ((user as any).signInDetails?.loginId || "").toLowerCase();

        const [seller, admin] = await Promise.all([isApprovedSeller(email), isAdminUser()]);
        if (!seller && !admin) return;
        setAllowed(true);
        setIsAdmin(admin);
        await loadPending();
      } finally {
        setChecking(false);
      }
    }
    init();
  }, []);

  async function handleReview(userId: string, approved: boolean) {
    if (processingIds.has(userId)) return;
    setProcessingIds((prev) => new Set(prev).add(userId));
    try {
      const tier = approved ? (approvalTiers[userId] || "PRIVATE") : undefined;
      let bidLimit: number | undefined;
      if (approved && tier === "PRIVATE") {
        bidLimit = Number(approvalLimits[userId]);
        if (!bidLimit || bidLimit < 10000 || bidLimit > 1000000) {
          toast.error("Enter a Private limit between $10,000 and $1,000,000");
          return;
        }
      }
      if (approved && tier === "TROPHY") {
        bidLimit = Number(approvalLimits[userId]);
        if (!bidLimit || bidLimit <= 1000000 || bidLimit > 100000000) {
          toast.error("Enter a Trophy max bid above $1,000,000");
          return;
        }
      }
      await client.mutations.reviewBuyerVerification(
        { userId, approved, ...(tier ? { tier } : {}), ...(bidLimit ? { bidLimit } : {}) },
        { authMode: "userPool" } as any,
      );
      await loadPending();
    } catch (err: any) {
      toast.error(err?.message || "Failed to process request.");
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }
  }

  if (checking) return <main className="min-h-screen bg-[#050607] p-10 text-white">Loading…</main>;

  if (!allowed) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050607] px-6 text-white">
        <div className="max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
          <h1 className="font-serif text-3xl text-[#c0c0c0]">Seller Access Required</h1>
          <p className="mt-3 text-gray-400">You must be an approved seller to view this page.</p>
          <Link href="/" className="mt-6 inline-block rounded bg-[#c0c0c0] px-5 py-3 font-semibold text-black">Back Home</Link>
        </div>
      </main>
    );
  }

  const approvableTiers = APPROVABLE_TIERS;

  return (
    <main className="min-h-screen bg-[#050607] px-6 py-12 text-white">
      <div className="mx-auto max-w-4xl">
        <Link href="/seller" className="text-sm text-gray-500 hover:text-white">← Seller Dashboard</Link>

        <h1 className="mt-6 font-serif text-5xl text-[#c0c0c0]">Buyer Verifications</h1>
        <div className="mt-2 h-px w-48 bg-gradient-to-r from-transparent via-[#d6aa55]/60 to-transparent" />
        <p className="mt-4 text-gray-400">
          Review pending buyer verification requests. Private Client is approved
          at an exact limit ($10K–$1M); the band is shown for reference.
        </p>

        <section className="mt-8">
          {pending.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-8 text-center text-gray-500">
              No pending verification requests.
            </div>
          ) : (
            <div className="space-y-5">
              {pending.map((profile) => {
                const currentTier = getTier(profile.verificationTier || "BASIC");
                const requestedTier = getTier(profile.requestedTier || "PRIVATE");
                const currentLimitLabel =
                  currentTier.code === "PRIVATE" && profile.bidLimit
                    ? `$${Number(profile.bidLimit).toLocaleString()} · ${privateBandLabel(Number(profile.bidLimit))}`
                    : formatTierLimit(currentTier.code);
                const isProcessing = processingIds.has(profile.userId);
                const invoices = invoiceMap[profile.userId] ?? [];
                const totalSpend = invoices.reduce((sum: number, inv: any) => {
                  const n = parseFloat(String(inv.amount || "0").replace(/[$,]/g, ""));
                  return sum + (isNaN(n) ? 0 : n);
                }, 0);

                return (
                  <div key={profile.userId} className="rounded-xl border border-yellow-400/20 bg-yellow-400/5 p-6">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="text-lg font-semibold text-white">{profile.email}</div>
                        <div className="mt-1 flex flex-wrap gap-3 text-sm text-gray-400">
                          <span>Current: <span className="text-[#c0c0c0]">{currentTier.name} ({currentLimitLabel})</span></span>
                          <span>→</span>
                          <span>Requesting: <span className="text-[#e7c77f]">{requestedTier.name} ({formatTierLimit(requestedTier.code)})</span></span>
                        </div>

                        {profile.verificationNotes && (
                          <div className="mt-3 rounded border border-white/10 bg-black/30 p-3 text-sm text-gray-300">
                            {profile.verificationNotes}
                          </div>
                        )}

                        {/* Purchase history */}
                        <div className="mt-5">
                          <div className="mb-2 flex items-center gap-3 text-xs uppercase tracking-widest text-gray-500">
                            <span>Purchase History</span>
                            {invoices.length > 0 && (
                              <span className="text-[#e7c77f]">
                                {invoices.length} invoice{invoices.length !== 1 ? "s" : ""} · ${totalSpend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} total
                              </span>
                            )}
                          </div>
                          {invoices.length === 0 ? (
                            <div className="text-xs italic text-gray-600">No purchases on record.</div>
                          ) : (
                            <div className="max-h-52 space-y-1.5 overflow-y-auto pr-1">
                              {invoices.map((inv: any) => (
                                <div key={inv.id} className="flex items-center justify-between rounded border border-white/[0.06] bg-black/20 px-3 py-2 text-xs">
                                  <div className="min-w-0 flex-1">
                                    <div className="truncate font-medium text-gray-300">{inv.title || "—"}</div>
                                    <div className="mt-0.5 text-gray-600">
                                      {inv.paidAt ? new Date(inv.paidAt).toLocaleDateString() : "—"}
                                      {inv.sellerEmail && ` · ${inv.sellerEmail}`}
                                    </div>
                                  </div>
                                  <div className="ml-4 shrink-0 text-right">
                                    <div className="font-semibold text-[#e7c77f]">{inv.amount || "—"}</div>
                                    <div className="mt-0.5 text-[9px] uppercase text-gray-600">
                                      {inv.type === "AUCTION" ? "Auction" : "Market"}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-col gap-3">
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] uppercase tracking-[0.15em] text-gray-500">Approve as</label>
                          <select
                            value={approvalTiers[profile.userId] || "PRIVATE"}
                            onChange={(e) => setApprovalTiers((prev) => ({ ...prev, [profile.userId]: e.target.value }))}
                            className="rounded border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none focus:border-[#d6aa55]/50"
                          >
                            {approvableTiers.map((tier) => (
                              <option key={tier.code} value={tier.code}>
                                {tier.name} — {formatTierLimit(tier.code)}
                              </option>
                            ))}
                          </select>
                        </div>

                        {((approvalTiers[profile.userId] || "PRIVATE") === "PRIVATE" ||
                          (approvalTiers[profile.userId] || "PRIVATE") === "TROPHY") && (
                          (() => {
                            const t = approvalTiers[profile.userId] || "PRIVATE";
                            const isPriv = t === "PRIVATE";
                            const val = approvalLimits[profile.userId] ?? "";
                            return (
                              <div className="flex flex-col gap-1">
                                <label className="text-[10px] uppercase tracking-[0.15em] text-gray-500">
                                  {isPriv ? "Limit ($10K–$1M)" : "Max bid (above $1M)"}
                                </label>
                                <input
                                  type="number"
                                  min={isPriv ? 10000 : 1000000}
                                  max={isPriv ? 1000000 : 100000000}
                                  step={isPriv ? 1000 : 100000}
                                  placeholder={isPriv ? "e.g. 400000" : "e.g. 2500000"}
                                  value={val}
                                  onChange={(e) => setApprovalLimits((prev) => ({ ...prev, [profile.userId]: e.target.value }))}
                                  className="rounded border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none focus:border-[#d6aa55]/50"
                                />
                                {val && isPriv && (
                                  <span className="text-[10px] text-[#e7c77f]">Band: {privateBandLabel(Number(val))}</span>
                                )}
                                {val && !isPriv && Number(val) > 1000000 && (
                                  <span className="text-[10px] text-[#e7c77f]">Up to ${Number(val).toLocaleString()} (wire/escrow)</span>
                                )}
                              </div>
                            );
                          })()
                        )}

                        <button
                          disabled={isProcessing}
                          onClick={() => handleReview(profile.userId, true)}
                          className="rounded bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
                        >
                          {isProcessing ? "…" : "Approve"}
                        </button>

                        <button
                          disabled={isProcessing}
                          onClick={() => handleReview(profile.userId, false)}
                          className="rounded border border-red-500/30 bg-red-500/10 px-5 py-2 text-sm font-semibold text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
                        >
                          {isProcessing ? "…" : "Decline"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

