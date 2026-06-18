"use client";

import "@/lib/amplifyclient";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";

const client = generateClient<Schema>();

type Outcome = "verifying" | "success" | "refunded" | "error";

const VIEW: Record<Outcome, { icon: string; title: string; fallback: string }> = {
  verifying: { icon: "⏳", title: "Verifying Payment", fallback: "Verifying payment…" },
  success: { icon: "✅", title: "Payment Successful", fallback: "Payment verified. Your invoice has been created." },
  refunded: { icon: "↩️", title: "Item No Longer Available", fallback: "This item sold to another buyer first — your payment has been refunded." },
  error: { icon: "⚠️", title: "Payment Issue", fallback: "Payment could not be verified. Please contact support." },
};

export default function CheckoutSuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams?.get("session_id");

  const [outcome, setOutcome] = useState<Outcome>("verifying");
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function verifyPayment() {
      if (!sessionId) {
        setOutcome("error");
        setMessage("Missing payment session.");
        return;
      }

      try {
        const result = await client.mutations.verifyPayment(
          { sessionId },
          { authMode: "userPool" } as any,
        );

        const error = result.data?.error || "";
        if (result.data?.paid) {
          setOutcome("success");
        } else if (/refund/i.test(error)) {
          setOutcome("refunded");
          setMessage(error);
        } else {
          setOutcome("error");
          setMessage(error);
        }
      } catch (err: any) {
        console.error("VERIFY PAYMENT ERROR", err);
        setOutcome("error");
        setMessage("Payment verification failed. Please contact support.");
      }
    }

    verifyPayment();
  }, [sessionId]);

  const view = VIEW[outcome];

  return (
    <main className="min-h-screen bg-[#050607] px-6 py-20 text-white">
      <div className="mx-auto max-w-2xl rounded-xl border border-white/10 bg-white/[0.03] p-8 text-center">
        <div className="text-5xl">{view.icon}</div>

        <h1 className="mt-6 font-serif text-4xl">{view.title}</h1>

        <p className="mt-4 text-gray-400">{message || view.fallback}</p>

        {outcome === "refunded" && (
          <p className="mt-2 text-sm text-gray-500">
            Refunds typically take 5–10 business days to appear on your statement.
          </p>
        )}

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {outcome === "refunded" ? (
            <>
              <Link href="/marketplace">
                <button className="rounded bg-[#c0c0c0] px-6 py-3 font-semibold text-black hover:bg-white">
                  Browse Marketplace
                </button>
              </Link>
              <Link href="/dashboard">
                <button className="rounded border border-white/15 px-6 py-3 font-semibold text-white hover:bg-white/[0.06]">
                  Go to Dashboard
                </button>
              </Link>
            </>
          ) : (
            <Link href="/dashboard">
              <button className="rounded bg-[#c0c0c0] px-6 py-3 font-semibold text-black hover:bg-white">
                Go to Dashboard
              </button>
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
