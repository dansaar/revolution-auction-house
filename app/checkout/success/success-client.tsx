"use client";

import "@/lib/amplifyclient";

import { useEffect, useState } from "react";
import Link from "next/link";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";

export default function CheckoutSuccessClient() {
  const client = generateClient<Schema>();
  const [status, setStatus] = useState("Finalizing your payment...");

  useEffect(() => {
    async function finalize() {
      const params = new URLSearchParams(window.location.search);
      const sessionId = params.get("session_id");
      const type = params.get("type");

      if (!sessionId) {
        setStatus("Missing Stripe session.");
        return;
      }

      const res = await fetch("/api/checkout/finalize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sessionId, type }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus(data.error || "Could not finalize payment.");
        return;
      }

      setStatus("Payment complete. Your invoice has been created.");
    }

    finalize();
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#050607] px-6 text-white">
      <div className="max-w-xl rounded-2xl border border-white/10 bg-white/[0.03] p-10 text-center">
        <div className="text-xs uppercase tracking-[0.3em] text-emerald-400">
          Checkout Success
        </div>

        <h1 className="mt-4 font-serif text-4xl text-[#c0c0c0]">Thank You</h1>

        <p className="mt-4 text-gray-400">{status}</p>

        <Link
          href="/dashboard"
          className="mt-8 inline-block rounded bg-[#c0c0c0] px-6 py-3 font-semibold text-black hover:bg-white"
        >
          Back to Dashboard
        </Link>
      </div>
    </main>
  );
}
