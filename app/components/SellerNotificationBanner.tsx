"use client";

import "@/lib/amplifyclient";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { getCurrentUser, fetchAuthSession } from "aws-amplify/auth";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";
import { adminGraphQL, isAdminUser, isApprovedSeller } from "@/lib/sellers";

const client = generateClient<Schema>();

const POLL_MS = 30_000;

export default function SellerNotificationBanner() {
  const [pendingOffers, setPendingOffers] = useState(0);
  const [offerSellerEmails, setOfferSellerEmails] = useState<string[]>([]);
  const [pendingVerifications, setPendingVerifications] = useState(0);
  const [ready, setReady] = useState(false);

  const fetchCounts = useCallback(async () => {
    async function getOffers(): Promise<any[]> {
      try {
        // Use raw GraphQL fetch to bypass Amplify client's auto-owner filter injection.
        // Amplify v6 with ownerDefinedIn silently filters list results by the current
        // user's sub, so admins see 0 records even though AppSync group auth allows all.
        const result = await adminGraphQL(`
          query BannerPendingOffers {
            listOffers(filter: { status: { eq: "PENDING" } }, limit: 500) {
              items { id sellerEmail status }
            }
          }
        `);
        const items = result?.data?.listOffers?.items;
        if (!Array.isArray(items)) {
          console.error("[Banner] unexpected listOffers response:", result);
          return [];
        }
        return items;
      } catch (err) {
        console.error("[Banner] getOffers error:", err);
        return [];
      }
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
        await getCurrentUser();
      } catch {
        return; // not signed in
      }

      try {
        const admin = await isAdminUser();
        let seller = admin;
        if (!seller) {
          let email = "";
          try {
            const s = await fetchAuthSession({ forceRefresh: false });
            email = ((s.tokens?.idToken?.payload?.["email"] as string) || "").toLowerCase();
          } catch { /* no session */ }
          seller = await isApprovedSeller(email);
        }
        if (!seller) return;

        // Force-refresh the session now so adminGraphQL's cached fetch gets a
        // current token with correct Cognito groups (stale cache lacks Admin group).
        try { await fetchAuthSession({ forceRefresh: true }); } catch { /* ignore */ }

        setReady(true);
        await fetchCounts();
        interval = setInterval(() => fetchCounts(), POLL_MS);
      } catch (err) {
        console.error("[Banner] init error:", err);
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
