"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { confirmSignUp, resendSignUpCode } from "aws-amplify/auth";

export default function ConfirmSignupPage() {
  const params = useSearchParams();

  const email = params?.get("email") || "";

  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();

    setError("");

    try {
      await confirmSignUp({
        username: email,
        confirmationCode: code,
      });

      window.location.assign("/signin");
    } catch (err: any) {
      console.error(err);

      setError(err.message || "Verification failed");
    }
  }

  async function handleResendCode() {
    setError("");
    setMessage("");

    try {
      await resendSignUpCode({
        username: email,
      });

      setMessage("Verification email resent. Check your inbox.");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Could not resend verification email");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#050607] px-6 text-white">
      <div className="w-full max-w-md rounded-xl border border-white/10 bg-white/[0.03] p-8">
        <h1 className="mb-6 text-3xl font-serif">Verify Account</h1>

        <p className="mb-4 text-sm text-gray-400">
          Enter the verification code sent to:
          <br />
          <span className="text-white">{email}</span>
        </p>

        <form onSubmit={handleConfirm} className="flex flex-col gap-4">
          <input
            type="text"
            placeholder="Verification Code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="rounded border border-white/10 bg-black px-4 py-3"
            required
          />

          {error && <div className="text-sm text-red-400">{error}</div>}
          {message && <div className="text-sm text-green-400">{message}</div>}

          <button
            type="submit"
            className="rounded bg-[#c0c0c0] py-3 font-semibold text-black"
          >
            Verify Account
          </button>
          <button
            type="button"
            onClick={handleResendCode}
            className="text-sm text-gray-400 underline hover:text-white"
          >
            Resend verification email
          </button>
        </form>
      </div>
    </main>
  );
}
