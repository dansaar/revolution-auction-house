"use client";

import "@/lib/amplifyclient";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";

const client = generateClient<Schema>();

export default function CheckoutSuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams?.get("session_id");

  const [status, setStatus] = useState("Verifying payment...");

  useEffect(() => {
    async function verifyPayment() {
      if (!sessionId) {
        setStatus("Missing payment session.");
        return;
      }

      try {
        const result = await client.mutations.verifyPayment(
          { sessionId },
          { authMode: "userPool" } as any,
        );

        if (result.data?.paid) {
          setStatus("Payment verified. Your invoice has been created.");
        } else {
          setStatus(
            result.data?.error ||
              "Payment could not be verified. Please contact support.",
          );
        }
      } catch (err: any) {
        console.error("VERIFY PAYMENT ERROR", err);
        setStatus("Payment verification failed. Please contact support.");
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
