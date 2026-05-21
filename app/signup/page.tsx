"use client";

import { useState } from "react";
import Link from "next/link";
import "@/lib/amplifyclient";
import { signUp } from "aws-amplify/auth";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();

    setError("");
    setMessage("");

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

          {error && <div className="text-sm text-red-400">{error}</div>}

          {message && <div className="text-sm text-green-400">{message}</div>}

          <button
            type="submit"
            className="rounded bg-[#c0c0c0] py-3 font-semibold text-black"
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
