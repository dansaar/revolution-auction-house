"use client";

import { Suspense } from "react";
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
import { BUYER_TIERS, getTier, formatTierLimit, privateBandLabel, PRIVATE_MIN, PRIVATE_MAX, TROPHY_MIN, TROPHY_MAX } from "@/lib/tiers";
import { fetchAuthSession } from "aws-amplify/auth";
import { useSearchParams } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";

const STRIPE_PK = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "";

const client = generateClient<Schema>();

const TIER_ICONS = [BadgeCheck, BadgeCheck, LockKeyhole, LockKeyhole, Crown];

export default function VerifyPage() {
  return (
    <Suspense>
      <VerifyPageInner />
    </Suspense>
  );
}

function VerifyPageInner() {
  const [buyerProfile, setBuyerProfile] = useState<any>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  const searchParams = useSearchParams();
  const identityComplete = searchParams?.get("identity") === "complete";

  const [requestedLimitInput, setRequestedLimitInput] = useState("");
  const [wantsTrophy, setWantsTrophy] = useState(false);
  const [trophyLimitInput, setTrophyLimitInput] = useState("");
  const [verificationNotes, setVerificationNotes] = useState("");
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [startingIdentity, setStartingIdentity] = useState(false);

  // Proof of funds (Stripe Financial Connections)
  const [verifyingFunds, setVerifyingFunds] = useState(false);
  const [fundsMsg, setFundsMsg] = useState("");

  function formatUsd(cents?: number | null) {
    if (!cents) return "$0";
    return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  }

  async function verifyFunds() {
    if (verifyingFunds) return;
    setFundsMsg("");
    if (!STRIPE_PK) {
      setFundsMsg("Bank verification isn't configured yet. Please try again later.");
      return;
    }
    setVerifyingFunds(true);
    try {
      const sessionRes = await client.mutations.createFundsSession({} as any, { authMode: "userPool" } as any);
      const clientSecret = sessionRes.data?.clientSecret;
      if (!clientSecret) {
        setFundsMsg(sessionRes.data?.error || "Could not start bank verification.");
        return;
      }

      const stripe = await loadStripe(STRIPE_PK);
      if (!stripe) {
        setFundsMsg("Could not load Stripe.");
        return;
      }

      const result = await (stripe as any).collectFinancialConnectionsAccounts({ clientSecret });
      if (result.error) {
        setFundsMsg(result.error.message || "Bank linking was cancelled.");
        return;
      }
      const accounts = result.financialConnectionsSession?.accounts || [];
      if (accounts.length === 0) {
        setFundsMsg("No account was linked.");
        return;
      }

      setFundsMsg("Reading your balance…");
      const rec = await client.mutations.recordFunds(
        { accountId: accounts[0].id },
        { authMode: "userPool" } as any,
      );
      if (rec.data?.success) {
        setFundsMsg(
          rec.data.status === "VERIFIED"
            ? `Funds verified: ${formatUsd(rec.data.amount)} at ${rec.data.bank || "your bank"}.`
            : rec.data.message || "Bank linked — balance still refreshing.",
        );
        await loadBuyerProfile();
      } else {
        setFundsMsg(rec.data?.message || "Could not read your balance.");
      }
    } catch (err: any) {
      console.error("VERIFY_FUNDS_ERROR", err);
      setFundsMsg("Bank verification failed. Please try again.");
    } finally {
      setVerifyingFunds(false);
    }
  }

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

  // Poll every 8 seconds after returning from Stripe until the tier upgrades
  useEffect(() => {
    if (!identityComplete) return;
    const interval = setInterval(async () => {
      await loadBuyerProfile();
      setBuyerProfile((prev: any) => {
        if (prev?.verificationTier && prev.verificationTier !== "BASIC") {
          clearInterval(interval);
        }
        return prev;
      });
    }, 8000);
    return () => clearInterval(interval);
  }, [identityComplete]);

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

      let requestedTier = "PRIVATE";
      let requestedLimit: number | undefined;
      if (wantsTrophy) {
        requestedTier = "TROPHY";
        requestedLimit = Number(trophyLimitInput);
        if (!requestedLimit || requestedLimit <= TROPHY_MIN || requestedLimit > TROPHY_MAX) {
          alert("Enter a desired Trophy bid limit above $1,000,000 (subject to approval).");
          return;
        }
      } else {
        requestedLimit = Number(requestedLimitInput);
        if (!requestedLimit || requestedLimit < PRIVATE_MIN || requestedLimit > PRIVATE_MAX) {
          alert("Enter a desired bid limit between $10,000 and $1,000,000.");
          return;
        }
      }

      const result = await client.mutations.submitVerificationRequest(
        {
          requestedTier,
          ...(requestedLimit ? { requestedLimit } : {}),
          verificationNotes,
        },
        { authMode: "userPool" } as any,
      );

      if (!result.data?.success) {
        alert(result.data?.message || "Failed to submit verification request.");
        return;
      }

      await loadBuyerProfile();
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
            {loadingProfile
              ? "Loading..."
              : (currentTierCode === "PRIVATE" || currentTierCode === "TROPHY") && buyerProfile?.bidLimit
                ? `$${Number(buyerProfile.bidLimit).toLocaleString()}`
                : formatTierLimit(currentTierCode)}
          </div>

          <div className="mt-2 text-sm uppercase tracking-[0.2em] text-gray-400">
            {currentTier.name} Buyer
            {currentTierCode === "PRIVATE" && buyerProfile?.bidLimit
              ? ` · ${privateBandLabel(Number(buyerProfile.bidLimit))}`
              : currentTierCode === "TROPHY" && buyerProfile?.bidLimit
                ? ` · wire/escrow`
                : ""}
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
              Choose the bid limit you'd like — up to $1,000,000. Higher limits may
              require identity review, proof of funds, and private approval. For
              bidding above $1M, request Trophy access (settled by wire/escrow).
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
              Desired Bid Limit
            </label>

            <input
              type="number"
              min={10000}
              max={1000000}
              step={1000}
              disabled={wantsTrophy}
              value={requestedLimitInput}
              onChange={(e) => setRequestedLimitInput(e.target.value)}
              placeholder="e.g. 100000 (up to $1,000,000)"
              className="w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-white outline-none focus:border-[#d6aa55]/50 disabled:opacity-40 md:max-w-sm"
            />
            {!wantsTrophy && requestedLimitInput && Number(requestedLimitInput) >= 10000 && (
              <p className="mt-2 text-xs text-[#e7c77f]">
                Private Client · {privateBandLabel(Number(requestedLimitInput))} band
              </p>
            )}

            <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={wantsTrophy}
                onChange={(e) => setWantsTrophy(e.target.checked)}
                className="h-4 w-4 accent-[#d6aa55]"
              />
              I need to bid above $1M (Trophy — settled by wire/escrow)
            </label>

            {wantsTrophy && (
              <div className="mt-4 rounded-xl border border-[#d6aa55]/20 bg-[#1a1408]/40 p-4">
                <label className="mb-2 block text-xs uppercase tracking-[0.2em] text-gray-500">
                  Desired Max Bid (subject to approval)
                </label>
                <input
                  type="number"
                  min={TROPHY_MIN}
                  step={100000}
                  value={trophyLimitInput}
                  onChange={(e) => setTrophyLimitInput(e.target.value)}
                  placeholder="e.g. 2500000 (above $1,000,000)"
                  className="w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-white outline-none focus:border-[#d6aa55]/50 md:max-w-sm"
                />
                {trophyLimitInput && Number(trophyLimitInput) > TROPHY_MIN && (
                  <p className="mt-2 text-xs text-[#e7c77f]">
                    Trophy Bidder · up to ${Number(trophyLimitInput).toLocaleString()} — final ceiling set on approval
                  </p>
                )}
                <p className="mt-2 text-[11px] text-gray-500">
                  Your requested ceiling is reviewed; the seller/admin sets the approved max.
                </p>
              </div>
            )}
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

          {/* Proof of funds — optional, strengthens high-tier requests */}
          <div className="mt-8 rounded-xl border border-[#d6aa55]/20 bg-[#d6aa55]/[0.04] p-5">
            <div className="flex items-center gap-2 font-semibold text-[#e7c77f]">
              <ShieldCheck size={18} /> Proof of Funds (optional)
            </div>
            <p className="mt-1 text-sm text-gray-400">
              Securely link a bank account via Stripe to verify available funds.
              Recommended for Private Client and Trophy tiers — it speeds up approval.
              We only see your balance and bank name, never your login.
            </p>

            {buyerProfile?.proofOfFundsStatus === "VERIFIED" ? (
              <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">
                ✓ Funds verified: {formatUsd(buyerProfile.proofOfFundsAmount)}
                {buyerProfile.proofOfFundsBank ? ` at ${buyerProfile.proofOfFundsBank}` : ""}
                {buyerProfile.proofOfFundsAt ? ` · ${new Date(buyerProfile.proofOfFundsAt).toLocaleDateString()}` : ""}
                <button
                  type="button"
                  onClick={verifyFunds}
                  disabled={verifyingFunds}
                  className="ml-3 text-xs underline hover:text-white disabled:opacity-50"
                >
                  Refresh
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={verifyFunds}
                disabled={verifyingFunds}
                className="mt-3 rounded-md border border-[#d6aa55]/40 bg-[#1a1408] px-5 py-2.5 text-sm font-semibold text-[#e7c77f] hover:bg-[#221909] disabled:opacity-50"
              >
                {verifyingFunds ? "Connecting…" : "Verify funds with your bank"}
              </button>
            )}

            {fundsMsg && <p className="mt-2 text-xs text-gray-400">{fundsMsg}</p>}
          </div>
        </section>
      </main>
    </div>
  );
}
