"use client";

import React from "react";
import {
  ArrowRight,
  BadgeCheck,
  Crown,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useState } from "react";
import { getCurrentUser } from "aws-amplify/auth";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";
import "@/lib/amplifyclient";
import Link from "next/link";
import { BUYER_TIERS, getTier, formatTierLimit } from "@/lib/tiers";
import { fetchAuthSession } from "aws-amplify/auth";
import { useSearchParams } from "next/navigation";

const client = generateClient<Schema>();

const TIER_ICONS = [BadgeCheck, BadgeCheck, LockKeyhole, LockKeyhole, Crown];

export default function VerifyPage() {
  const [buyerProfile, setBuyerProfile] = useState<any>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  const searchParams = useSearchParams();
  const identityComplete = searchParams.get("identity") === "complete";

  const [requestedTier, setRequestedTier] = useState("VERIFIED");
  const [verificationNotes, setVerificationNotes] = useState("");
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [startingIdentity, setStartingIdentity] = useState(false);

  async function loadBuyerProfile() {
    try {
      const user = await getCurrentUser();
      const userId = user.userId || user.username || "";

      if (!userId) return;

      const result = await client.models.BuyerProfile.get({ userId }, {
        authMode: "userPool",
      } as any);

      setBuyerProfile(result.data || null);
    } catch {
      setBuyerProfile(null);
    } finally {
      setLoadingProfile(false);
    }
  }

  useEffect(() => {
    loadBuyerProfile();

    window.addEventListener("focus", loadBuyerProfile);
    window.addEventListener("pageshow", loadBuyerProfile);

    return () => {
      window.removeEventListener("focus", loadBuyerProfile);
      window.removeEventListener("pageshow", loadBuyerProfile);
    };
  }, []);

  const currentTierCode = buyerProfile?.verificationTier || "BASIC";
  const currentTier = getTier(currentTierCode);

  async function startIdentityVerification() {
    if (startingIdentity) return;

    try {
      setStartingIdentity(true);

      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();

      if (!token) {
        alert("Please sign in to verify your identity.");
        return;
      }

      const res = await fetch("/api/identity/start", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || "Could not start identity verification.");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to start identity verification.");
    } finally {
      setStartingIdentity(false);
    }
  }

  async function submitVerificationRequest() {
    if (submittingRequest) return;

    try {
      setSubmittingRequest(true);

      const user = await getCurrentUser();
      const userId = user.userId || user.username || "";
      const email = user.signInDetails?.loginId || user.username || "";

      if (!userId || !email) {
        alert("Please sign in before requesting verification.");
        return;
      }

      const existing = await client.models.BuyerProfile.get({ userId }, {
        authMode: "userPool",
      } as any);

      const requestedLimitValue = getTier(requestedTier).limit;

      if (existing.data) {
        await client.models.BuyerProfile.update(
          {
            userId,
            email,
            requestedTier,
            requestedLimit: requestedLimitValue,
            verificationNotes,
            status: "PENDING_REVIEW",
          },
          { authMode: "userPool" } as any,
        );
      } else {
        await client.models.BuyerProfile.create(
          {
            userId,
            email,
            displayName: email,
            requestedTier,
            requestedLimit: requestedLimitValue,
            verificationNotes,
            status: "PENDING_REVIEW",
          },
          { authMode: "userPool" } as any,
        );
      }

      const refreshed = await client.models.BuyerProfile.get({ userId }, {
        authMode: "userPool",
      } as any);

      setBuyerProfile(refreshed.data || null);
      alert("Verification request submitted.");
    } catch (err) {
      console.error(err);
      alert("Failed to submit verification request.");
    } finally {
      setSubmittingRequest(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#050607] text-white">
      <main className="mx-auto max-w-7xl px-6 py-16">
        {identityComplete && (
          <div className="mb-10 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-center text-emerald-200">
            <div className="font-semibold">Identity submitted — thank you!</div>
            <p className="mt-1 text-sm text-emerald-300/80">
              Stripe is processing your verification. Your bid limit will update automatically once complete, usually within a few minutes.
            </p>
          </div>
        )}

        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#c0c0c0]/30 bg-[#c0c0c0]/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-[#c0c0c0]">
            <ShieldCheck size={16} />
            Buyer Verification
          </div>

          <h1 className="font-serif text-5xl md:text-6xl">
            Unlock Higher Bidding Limits
          </h1>

          <p className="mt-6 text-lg leading-8 text-gray-400">
            Revolution Auction House verifies high-value buyers before approving
            premium and trophy-level bids.
          </p>
        </div>

        <div className="mx-auto mt-8 max-w-md rounded-2xl border border-[#d6aa55]/30 bg-[#1a1408]/70 p-5 shadow-[0_0_50px_rgba(214,170,85,0.08)]">
          <div className="text-xs uppercase tracking-[0.25em] text-[#b89b61]">
            Your Current Limit
          </div>

          <div className="mt-4">
            <Link
              href="/bidder-agreement"
              className="text-sm font-semibold text-[#e7c77f] underline hover:text-white"
            >
              View Buyer & Bidder Agreement
            </Link>
          </div>

          <div className="mt-3 font-serif text-4xl text-[#f0d28c]">
            {loadingProfile ? "Loading..." : formatTierLimit(currentTierCode)}
          </div>

          <div className="mt-2 text-sm uppercase tracking-[0.2em] text-gray-400">
            {currentTier.name} Buyer
          </div>

          {currentTierCode === "BASIC" && (
            <div className="mt-5 border-t border-white/10 pt-5">
              <p className="text-sm text-gray-400">
                Verify your government ID instantly with Stripe to unlock a{" "}
                <span className="font-semibold text-[#e7c77f]">$10,000</span> bid
                limit — no manual review needed.
              </p>
              <button
                type="button"
                disabled={startingIdentity}
                onClick={startIdentityVerification}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-[#c0c0c0] px-5 py-3 font-semibold text-black transition hover:bg-white disabled:opacity-50"
              >
                {startingIdentity ? "Starting…" : "Verify Identity Now →"}
              </button>
            </div>
          )}
        </div>

        <section className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-5">
          {BUYER_TIERS.map((tier, index) => {
            const Icon = TIER_ICONS[index];
            const isCurrent = tier.code === currentTierCode;

            return (
              <div
                key={tier.code}
                className={`rounded-xl border p-5 transition ${
                  isCurrent
                    ? "border-[#d6aa55]/60 bg-[#1a1408]/80 shadow-[0_0_50px_rgba(214,170,85,0.12)]"
                    : "border-white/10 bg-white/[0.035] hover:border-[#c0c0c0]/40"
                }`}
              >
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full border border-[#c0c0c0]/30 bg-[#c0c0c0]/10">
                  <Icon className="text-[#c0c0c0]" />
                </div>

                <h2 className="font-serif text-2xl">{tier.name}</h2>

                {isCurrent && (
                  <div className="mt-2 inline-flex rounded-full border border-[#d6aa55]/40 bg-[#d6aa55]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#e7c77f]">
                    Current Tier
                  </div>
                )}

                <div className="mt-2 font-semibold text-[#c0c0c0]">
                  {formatTierLimit(tier.code)} limit
                </div>

                <p className="mt-1 text-xs text-gray-500">{tier.description}</p>

                <ul className="mt-5 space-y-3 text-sm text-gray-400">
                  {tier.requirements.map((req) => (
                    <li key={req} className="flex gap-2">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#c0c0c0]" />
                      {req}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </section>

        <section className="mt-16 rounded-xl border border-[#c0c0c0]/25 bg-[#c0c0c0]/10 p-8">
          <div>
            <h2 className="font-serif text-3xl">Request Verification Review</h2>

            <p className="mt-3 max-w-3xl text-gray-400">
              Request a higher bidding limit. Premium and trophy-level approvals
              may require identity review, proof of funds, and private approval.
            </p>
          </div>

          {buyerProfile?.status === "PENDING_REVIEW" && (
            <div className="mt-6 rounded-xl border border-yellow-400/30 bg-yellow-400/10 p-4 text-sm text-yellow-200">
              Your verification request is pending review.
            </div>
          )}

          {buyerProfile?.status === "DECLINED" && (
            <div className="mt-6 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">
              Your last request was declined. You may submit a new request with additional information.
            </div>
          )}

          <div className="mt-8">
            <label className="mb-2 block text-xs uppercase tracking-[0.2em] text-gray-500">
              Requested Tier
            </label>

            <select
              value={requestedTier}
              onChange={(e) => setRequestedTier(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-white outline-none focus:border-[#d6aa55]/50 md:max-w-sm"
            >
              {BUYER_TIERS.filter((t) => t.code !== "BASIC").map((tier) => (
                <option key={tier.code} value={tier.code}>
                  {tier.name} — {formatTierLimit(tier.code)} limit
                </option>
              ))}
            </select>
          </div>

          <div className="mt-5">
            <label className="mb-2 block text-xs uppercase tracking-[0.2em] text-gray-500">
              Notes
            </label>

            <textarea
              value={verificationNotes}
              onChange={(e) => setVerificationNotes(e.target.value)}
              placeholder="Tell us what auctions or bidding range you are interested in."
              className="min-h-32 w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-white outline-none placeholder:text-gray-600 focus:border-[#d6aa55]/50"
            />
          </div>

          <button
            type="button"
            disabled={submittingRequest}
            onClick={submitVerificationRequest}
            className="mt-6 flex items-center justify-center gap-2 rounded-md bg-[#c0c0c0] px-6 py-3 font-semibold text-black hover:bg-white disabled:opacity-50"
          >
            {submittingRequest
              ? "Submitting..."
              : "Submit Verification Request"}
            <ArrowRight size={16} />
          </button>
        </section>
      </main>
    </div>
  );
}
