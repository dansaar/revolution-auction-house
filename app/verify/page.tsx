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

const client = generateClient<Schema>();

const tiers = [
  {
    code: "BASIC",
    name: "Basic Buyer",
    limit: "Up to $1,000",
    requirements: [
      "Email verification",
      "Phone verification",
      "Payment method on file",
    ],
  },
  {
    code: "VERIFIED",
    name: "Verified Buyer",
    limit: "Up to $10,000",
    requirements: [
      "Government ID verification",
      "Verified billing address",
      "Fraud screening",
      "Payment method on file",
    ],
  },
  {
    code: "PREMIUM",
    name: "Premium Buyer",
    limit: "Up to $50,000",
    requirements: [
      "ID verification",
      "Bank/payment verification",
      "Manual account review",
      "Payment method on file",
    ],
  },
  {
    code: "PRIVATE",
    name: "Private Client",
    limit: "$50,000+",
    requirements: [
      "Proof of funds",
      "Private client approval",
      "Concierge contact",
      "Payment method on file",
    ],
  },
  {
    code: "TROPHY",
    name: "Trophy Bidder",
    limit: "$250,000+",
    requirements: [
      "Proof of funds",
      "Signed bidder agreement",
      "Direct approval",
    ],
  },
];

export default function VerifyPage() {
  const [buyerProfile, setBuyerProfile] = useState<any>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  const [requestedTier, setRequestedTier] = useState("VERIFIED");
  const [requestedLimit, setRequestedLimit] = useState("10000");
  const [verificationNotes, setVerificationNotes] = useState("");
  const [submittingRequest, setSubmittingRequest] = useState(false);

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

  const currentTier = buyerProfile?.verificationTier || "BASIC";
  const currentLimit = Number(buyerProfile?.bidLimit || 1000);

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

      if (existing.data) {
        await client.models.BuyerProfile.update(
          {
            userId,
            email,
            requestedTier,
            requestedLimit: Number(requestedLimit),
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
            requestedLimit: Number(requestedLimit),
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
            {loadingProfile
              ? "Loading..."
              : `$${currentLimit.toLocaleString()}`}
          </div>

          <div className="mt-2 text-sm uppercase tracking-[0.2em] text-gray-400">
            {currentTier} Buyer
          </div>
        </div>

        <section className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-5">
          {tiers.map((tier, index) => (
            <div
              key={tier.name}
              className={`rounded-xl border p-5 transition ${
                tier.code === currentTier
                  ? "border-[#d6aa55]/60 bg-[#1a1408]/80 shadow-[0_0_50px_rgba(214,170,85,0.12)]"
                  : "border-white/10 bg-white/[0.035] hover:border-[#c0c0c0]/40"
              }`}
            >
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full border border-[#c0c0c0]/30 bg-[#c0c0c0]/10">
                {index < 2 ? (
                  <BadgeCheck className="text-[#c0c0c0]" />
                ) : index < 4 ? (
                  <LockKeyhole className="text-[#c0c0c0]" />
                ) : (
                  <Crown className="text-[#c0c0c0]" />
                )}
              </div>

              <h2 className="font-serif text-2xl">{tier.name}</h2>
              {tier.code === currentTier && (
                <div className="mt-2 inline-flex rounded-full border border-[#d6aa55]/40 bg-[#d6aa55]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#e7c77f]">
                  Current Tier
                </div>
              )}
              <div className="mt-2 text-[#c0c0c0]">{tier.limit}</div>

              <ul className="mt-5 space-y-3 text-sm text-gray-400">
                {tier.requirements.map((req) => (
                  <li key={req} className="flex gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[#c0c0c0]" />
                    {req}
                  </li>
                ))}
              </ul>
            </div>
          ))}
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

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-xs uppercase tracking-[0.2em] text-gray-500">
                Requested Tier
              </label>

              <select
                value={requestedTier}
                onChange={(e) => {
                  const tier = e.target.value;
                  setRequestedTier(tier);

                  if (tier === "VERIFIED") setRequestedLimit("10000");
                  if (tier === "PREMIUM") setRequestedLimit("50000");
                  if (tier === "PRIVATE") setRequestedLimit("250000");
                  if (tier === "TROPHY") setRequestedLimit("5000000");
                }}
                className="w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-white outline-none focus:border-[#d6aa55]/50"
              >
                <option value="VERIFIED">Verified Buyer — $10,000</option>
                <option value="PREMIUM">Premium Buyer — $50,000</option>
                <option value="PRIVATE">Private Client — $250,000</option>
                <option value="TROPHY">Trophy Bidder — $5,000,000</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-xs uppercase tracking-[0.2em] text-gray-500">
                Requested Limit
              </label>

              <input
                value={requestedLimit}
                onChange={(e) => setRequestedLimit(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-white outline-none focus:border-[#d6aa55]/50"
              />
            </div>
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
