"use client";

import "@/lib/amplifyclient";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { getCurrentUser, fetchAuthSession } from "aws-amplify/auth";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";
import { isApprovedSeller, isAdminUser } from "@/lib/sellers";

const client = generateClient<Schema>();

const POLL_MS = 30_000;

export default function SellerNotificationBanner() {
  const [pendingOffers, setPendingOffers] = useState(0);
  const [pendingVerifications, setPendingVerifications] = useState(0);
  const [sellerEmail, setSellerEmail] = useState("");
  const [ready, setReady] = useState(false);

  const fetchCounts = useCallback(async (sub: string, admin: boolean) => {
    const [offerRes, verifRes] = await Promise.allSettled([
      admin
        ? client.models.Offer.list({
            filter: { status: { eq: "PENDING" } },
            authMode: "userPool",
          } as any)
        : (client.models.Offer as any).offersBySellerUserId(
            { sellerUserId: sub },
            { filter: { status: { eq: "PENDING" } }, authMode: "userPool", limit: 500 },
          ),
      client.models.BuyerProfile.list({
        filter: { status: { eq: "PENDING_REVIEW" } },
        authMode: "userPool",
      } as any),
    ]);

    if (offerRes.status === "fulfilled") {
      setPendingOffers(offerRes.value.data?.length ?? 0);
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
        const email = ((user as any).signInDetails?.loginId || "").toLowerCase();
        const [seller, admin] = await Promise.all([isApprovedSeller(email), isAdminUser()]);
        if (!seller && !admin) return;

        setSellerEmail(email);

        const session = await fetchAuthSession({ forceRefresh: false });
        const sub = (session.tokens?.idToken?.payload?.sub as string) || "";

        setReady(true);
        await fetchCounts(sub, admin);
        interval = setInterval(() => fetchCounts(sub, admin), POLL_MS);
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
            {sellerEmail && (
              <span className="text-amber-500/70 text-xs">· {sellerEmail}</span>
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
