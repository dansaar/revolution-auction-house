"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import "@/lib/amplifyclient";
import { signIn, confirmSignIn } from "aws-amplify/auth";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [newPassword, setNewPassword] = useState("");
  const [needsNewPassword, setNeedsNewPassword] = useState(false);

  const [error, setError] = useState("");

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    try {
      const result = await signIn({
        username: email.trim().toLowerCase(),
        password,
      });

      if (!result.isSignedIn) {
        if (result.nextStep.signInStep === "CONFIRM_SIGN_UP") {
          router.push(`/confirm-signup?email=${encodeURIComponent(email)}`);
          return;
        }

        if (
          result.nextStep.signInStep ===
          "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED"
        ) {
          setNeedsNewPassword(true);
          return;
        }

        setError(`Sign in not complete: ${result.nextStep.signInStep}`);
        return;
      }

      router.push("/dashboard");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Sign in failed");
    }
  }

  async function handleNewPassword(e: React.FormEvent) {
    e.preventDefault();

    setError("");

    try {
      const result = await confirmSignIn({
        challengeResponse: newPassword,
      });

      if (result.isSignedIn) {
        router.push("/dashboard");
      }
    } catch (err: any) {
      setError(err.message || "Could not set new password");
    }
  }

  return (
    <main className="min-h-screen bg-[#050607] flex items-center justify-center px-6 text-white">
      <div className="w-full max-w-md rounded-xl border border-white/10 bg-white/[0.03] p-8">
        <h1 className="mb-6 text-3xl font-serif">Sign In</h1>

        <form onSubmit={handleSignIn} className="flex flex-col gap-4">
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

          {error && <div className="text-sm text-red-400">{error}</div>}

          <button
            type="submit"
            className="rounded bg-[#c0c0c0] py-3 font-semibold text-black"
          >
            Sign In
          </button>

          <Link
            href="/forgot-password"
            className="mt-2 text-center text-sm text-gray-400 underline"
          >
            Forgot password?
          </Link>
        </form>

        {needsNewPassword && (
          <form
            onSubmit={handleNewPassword}
            className="mt-6 flex flex-col gap-4"
          >
            <input
              type="password"
              placeholder="Create new password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="rounded border border-white/10 bg-black px-4 py-3"
              required
            />

            <button
              type="submit"
              className="rounded bg-[#c0c0c0] py-3 font-semibold text-black"
            >
              Set New Password
            </button>
          </form>
        )}

        <div className="mt-6 text-sm text-gray-400">
          Don’t have an account?{" "}
          <Link href="/signup" className="text-white underline">
            Create Account
          </Link>
        </div>
      </div>
    </main>
  );
}
