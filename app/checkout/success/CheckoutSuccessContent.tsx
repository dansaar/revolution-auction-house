"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function CheckoutSuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");

  const [status, setStatus] = useState("Verifying payment...");

  useEffect(() => {
    async function verifyPayment() {
      if (!sessionId) {
        setStatus("Missing payment session.");
        return;
      }

      const res = await fetch("/api/checkout/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId,
        }),
      });

      const data = await res.json();

      if (data.paid) {
        setStatus("Payment verified. Auction marked as paid.");
      } else {
        setStatus("Payment could not be verified.");
      }
    }

    verifyPayment();
  }, [sessionId]);

  return (
    <main className="min-h-screen bg-[#050607] px-6 py-20 text-white">
      <div className="mx-auto max-w-2xl rounded-xl border border-white/10 bg-white/[0.03] p-8 text-center">
        <div className="text-5xl">✅</div>

        <h1 className="mt-6 font-serif text-4xl">Payment Successful</h1>

        <p className="mt-4 text-gray-400">{status}</p>

        <Link href="/dashboard">
          <button className="mt-8 rounded bg-[#c0c0c0] px-6 py-3 font-semibold text-black hover:bg-white">
            Go to Dashboard
          </button>
        </Link>
      </div>
    </main>
  );
}
