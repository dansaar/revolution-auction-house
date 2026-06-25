"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import "@/lib/amplifyclient";
import { signUp } from "aws-amplify/auth";
import BidderAgreementContent from "../components/BidderAgreementContent";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [smsOptIn, setSmsOptIn] = useState(false);
  const [acceptedBidderAgreement, setAcceptedBidderAgreement] = useState(false);
  const [showAgreement, setShowAgreement] = useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();

    setError("");
    setMessage("");

    if (!acceptedBidderAgreement) {
      setError(
        "You must accept the Bidder Agreement before creating an account.",
      );
      return;
    }

    try {
      await signUp({
        username: email,
        password,
        options: {
          userAttributes: {
            email,
          },
        },
      });

      if (phone) {
        localStorage.setItem("pendingPhone", phone);
        localStorage.setItem("pendingSmsOptIn", smsOptIn ? "true" : "false");
      }

      setMessage(
        "Account created. Check your email for the verification code.",
      );

      setTimeout(() => {
        router.push(`/confirm-signup?email=${encodeURIComponent(email)}`);
      }, 800);
    } catch (err: any) {
      console.error("signup error:", err);
      if (err.name === "UsernameExistsException") {
        setError("An account with this email already exists.");
        return;
      }

      setError(err.message || "Signup failed");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#050607] px-6 text-white">
      <div className="w-full max-w-md rounded-xl border border-white/10 bg-white/[0.03] p-8">
        <h1 className="mb-6 font-serif text-3xl">Create Account</h1>

        <form onSubmit={handleSignup} className="flex flex-col gap-4">
          <input
            id="email"
            name="email"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded border border-white/10 bg-black px-4 py-3"
            required
          />

          <input
            id="password"
            name="new-password"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded border border-white/10 bg-black px-4 py-3"
            required
          />

          <div>
            <input
              id="phone"
              name="phone"
              type="tel"
              placeholder="Mobile phone (optional)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded border border-white/10 bg-black px-4 py-3"
            />
            <p className="mt-1 px-1 text-xs text-gray-600">
              For outbid text alerts — optional
            </p>
          </div>

          {phone && (
            <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={smsOptIn}
                onChange={(e) => setSmsOptIn(e.target.checked)}
                className="mt-1 h-4 w-4 accent-[#d6aa55]"
              />
              <span>
                Text me when I'm outbid.{" "}
                <span className="text-gray-500">
                  Standard message & data rates apply. You can opt out anytime
                  in your notification preferences.
                </span>
              </span>
            </label>
          )}

          <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={acceptedBidderAgreement}
              onChange={(e) => setAcceptedBidderAgreement(e.target.checked)}
              className="mt-1 h-4 w-4 accent-[#d6aa55]"
            />

            <span>
              I agree to the{" "}
              <button
                type="button"
                onClick={() => setShowAgreement(true)}
                className="font-semibold text-[#e7c77f] underline hover:text-white"
              >
                Revolution Auction House Bidder Agreement
              </button>
              , including payment responsibility, bidding rules, buyer limits,
              marketplace purchases, offers, and auction terms.
            </span>
          </label>

          {error && <div className="text-sm text-red-400">{error}</div>}

          {message && <div className="text-sm text-green-400">{message}</div>}

          <button
            type="submit"
            disabled={!acceptedBidderAgreement}
            className="rounded bg-[#c0c0c0] py-3 font-semibold text-black transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Create Account
          </button>
        </form>

        <div className="mt-6 text-sm text-gray-400">
          Already have an account?{" "}
          <Link href="/signin" className="text-white underline">
            Sign In
          </Link>
        </div>
      </div>

      {showAgreement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4">
          <div className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-[#d6aa55]/30 bg-[#0b0c0e] p-6 shadow-[0_30px_100px_rgba(0,0,0,0.75)]">
            <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
              <div>
                <h2 className="font-serif text-3xl text-[#c0c0c0]">
                  Revolution Auction House
                </h2>

                <div className="mt-2 h-px w-64 bg-gradient-to-r from-transparent via-[#d6aa55]/70 to-transparent" />

                <h3 className="mt-4 font-serif text-2xl text-white">
                  Buyer & Bidder Agreement
                </h3>
              </div>

              <button
                type="button"
                onClick={() => setShowAgreement(false)}
                className="rounded border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white hover:bg-white/[0.08]"
              >
                Close
              </button>
            </div>

            <div className="mt-6 max-h-[55vh] overflow-y-auto pr-2">
              <BidderAgreementContent />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
