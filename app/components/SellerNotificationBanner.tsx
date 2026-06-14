"use client";

import "@/lib/amplifyclient";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { getCurrentUser, fetchAuthSession } from "aws-amplify/auth";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";
import { isApprovedSeller } from "@/lib/sellers";

const client = generateClient<Schema>();

const POLL_MS = 30_000;

export default function SellerNotificationBanner() {
  const [pendingOffers, setPendingOffers] = useState(0);
  const [offerSellerEmails, setOfferSellerEmails] = useState<string[]>([]);
  const [pendingVerifications, setPendingVerifications] = useState(0);
  const [ready, setReady] = useState(false);

  const fetchCounts = useCallback(async () => {
    async function getOffers(): Promise<any[]> {
      // All approved sellers and admins see all pending offers site-wide
      try {
        const res = await client.models.Offer.list({
          filter: { status: { eq: "PENDING" } },
          authMode: "userPool",
          limit: 500,
        } as any);
        return res.data ?? [];
      } catch { return []; }
    }

    const [offersResult, verifRes] = await Promise.allSettled([
      getOffers(),
      client.models.BuyerProfile.list({
        filter: { status: { eq: "PENDING_REVIEW" } },
        authMode: "userPool",
      } as any),
    ]);

    if (offersResult.status === "fulfilled") {
      const offers = offersResult.value;
      setPendingOffers(offers.length);
      const emails = [...new Set(
        offers.map((o: any) => o.sellerEmail).filter(Boolean)
      )] as string[];
      setOfferSellerEmails(emails);
    }
    if (verifRes.status === "fulfilled") {
      setPendingVerifications(verifRes.value.data?.length ?? 0);
    }
  }, []);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;

    async function init() {
      try {
        const user = await getCurrentUser();
        const email = ((user as any).signInDetails?.loginId || user.username || "").toLowerCase();

        const session = await fetchAuthSession({ forceRefresh: true });
        const groups = (session.tokens?.idToken?.payload?.["cognito:groups"] as string[]) ?? [];
        const admin = groups.includes("Admin");

        const seller = admin || await isApprovedSeller(email);
        if (!seller) return;

        setReady(true);
        await fetchCounts();
        interval = setInterval(() => fetchCounts(), POLL_MS);
      } catch {
        // not signed in — skip silently
      }
    }

    init();
    return () => clearInterval(interval);
  }, [fetchCounts]);

  if (!ready || (pendingOffers === 0 && pendingVerifications === 0)) return null;

  return (
    <div className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/30 bg-[#1a1000]/95 px-5 py-3 backdrop-blur">
      <div className="flex flex-wrap items-center gap-4 text-sm">
        {pendingOffers > 0 && (
          <span className="flex items-center gap-2 text-amber-300">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-black">
              {pendingOffers}
            </span>
            {pendingOffers === 1 ? "1 pending offer" : `${pendingOffers} pending offers`}
            {offerSellerEmails.length > 0 && (
              <span className="text-amber-500/70 text-xs">
                · {offerSellerEmails.join(", ")}
              </span>
            )}
          </span>
        )}
        {pendingOffers > 0 && pendingVerifications > 0 && (
          <span className="text-amber-700">·</span>
        )}
        {pendingVerifications > 0 && (
          <span className="flex items-center gap-2 text-amber-300">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-black">
              {pendingVerifications}
            </span>
            {pendingVerifications === 1
              ? "1 buyer verification request"
              : `${pendingVerifications} buyer verification requests`}
          </span>
        )}
      </div>
      <div className="flex gap-3 text-xs font-semibold">
        {pendingOffers > 0 && (
          <Link
            href="/seller?tab=marketplace"
            className="rounded border border-amber-500/40 px-3 py-1.5 text-amber-300 transition hover:bg-amber-500/20"
          >
            View Offers →
          </Link>
        )}
        {pendingVerifications > 0 && (
          <Link
            href="/seller/verifications"
            className="rounded border border-amber-500/40 px-3 py-1.5 text-amber-300 transition hover:bg-amber-500/20"
          >
            Review Buyers →
          </Link>
        )}
      </div>
    </div>
  );
}
