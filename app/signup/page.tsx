"use client";

import { useState } from "react";
import Link from "next/link";
import "@/lib/amplifyclient";
import { signUp } from "aws-amplify/auth";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [acceptedBidderAgreement, setAcceptedBidderAgreement] = useState(false);

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

      setMessage(
        "Account created. Check your email for the verification code.",
      );

      setTimeout(() => {
        window.location.href = `/confirm-signup?email=${encodeURIComponent(email)}`;
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
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded border border-white/10 bg-black px-4 py-3"
            required
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded border border-white/10 bg-black px-4 py-3"
            required
          />

          <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={acceptedBidderAgreement}
              onChange={(e) => setAcceptedBidderAgreement(e.target.checked)}
              className="mt-1 h-4 w-4 accent-[#d6aa55]"
            />

            <span>
              I agree to the{" "}
              <Link
                href="/bidder-agreement"
                target="_blank"
                className="font-semibold text-[#e7c77f] hover:text-white"
              >
                Revolution Auction House Bidder Agreement
              </Link>
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
    </main>
  );
}
