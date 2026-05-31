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

  useEffect(() => {
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

    loadBuyerProfile();
  }, []);

  const currentTier = buyerProfile?.verificationTier || "BASIC";
  const currentLimit = Number(buyerProfile?.bidLimit || 1000);

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
          <div className="grid items-center gap-8 lg:grid-cols-[1fr_auto]">
            <div>
              <h2 className="font-serif text-3xl">
                Request Verification Review
              </h2>
              <p className="mt-3 max-w-3xl text-gray-400">
                Start with basic verification. Higher limits may require
                identity review, proof of funds, and private approval.
              </p>
            </div>

            <button className="flex items-center justify-center gap-2 rounded-md bg-[#c0c0c0] px-6 py-3 font-semibold text-black hover:bg-white">
              Start Verification <ArrowRight size={16} />
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
