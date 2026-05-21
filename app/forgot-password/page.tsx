"use client";

import { useState } from "react";
import { resetPassword, confirmResetPassword } from "aws-amplify/auth";
import { useRouter } from "next/navigation";

export default function ForgotPasswordPage() {
  const router = useRouter();

  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");

    try {
      await resetPassword({ username: email });
      setMessage("Verification code sent. Check your email.");
      setStep("code");
    } catch (err: any) {
      setError(err.message || "Could not send reset code.");
    }
  }

  async function resetUserPassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");

    try {
      await confirmResetPassword({
        username: email,
        confirmationCode: code,
        newPassword,
      });

      setMessage("Password changed successfully.");
      setTimeout(() => router.push("/signin"), 1000);
    } catch (err: any) {
      setError(err.message || "Could not reset password.");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#050607] px-6 text-white">
      <div className="w-full max-w-md rounded-xl border border-white/10 bg-white/[0.03] p-8">
        <h1 className="mb-6 font-serif text-3xl">Reset Password</h1>

        {step === "email" ? (
          <form onSubmit={sendCode} className="flex flex-col gap-4">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded border border-white/10 bg-black px-4 py-3"
              required
            />

            <button
              type="submit"
              className="rounded bg-[#c0c0c0] py-3 font-semibold text-black"
            >
              Send Reset Code
            </button>
          </form>
        ) : (
          <form onSubmit={resetUserPassword} className="flex flex-col gap-4">
            <input
              type="text"
              placeholder="Verification code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="rounded border border-white/10 bg-black px-4 py-3"
              required
            />

            <input
              type="password"
              placeholder="New password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="rounded border border-white/10 bg-black px-4 py-3"
              required
            />

            <button
              type="submit"
              className="rounded bg-[#c0c0c0] py-3 font-semibold text-black"
            >
              Change Password
            </button>
          </form>
        )}

        {message && <p className="mt-4 text-sm text-green-400">{message}</p>}
        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

        <button
          type="button"
          onClick={() => router.push("/signin")}
          className="mt-6 text-sm text-gray-400 underline"
        >
          Back to sign in
        </button>
      </div>
    </main>
  );
}
