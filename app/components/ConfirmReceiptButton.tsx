"use client";

import "@/lib/amplifyclient"; // ensure Amplify is configured (apiKey + Cognito cookie storage)
import { useState } from "react";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";
import { toast } from "sonner";

const client = generateClient<Schema>();

// Buyer confirms they received an order. Self-contained: calls confirmReceipt,
// then shows a confirmed badge. Render only after the order has shipped.
export default function ConfirmReceiptButton({
  itemId,
  itemType,
  buyerReceivedAt,
}: {
  itemId: string;
  itemType: "AUCTION" | "LISTING";
  buyerReceivedAt?: string | null;
}) {
  const [confirmedAt, setConfirmedAt] = useState<string | null>(buyerReceivedAt || null);
  const [busy, setBusy] = useState(false);

  if (confirmedAt) {
    return (
      <div className="mt-3 text-xs text-emerald-400">
        ✓ You confirmed receipt on{" "}
        {new Date(confirmedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
      </div>
    );
  }

  async function confirm() {
    setBusy(true);
    try {
      const res = await client.mutations.confirmReceipt(
        { itemId, itemType },
        { authMode: "userPool" } as any,
      );
      if (!res.data?.success) {
        toast.error(res.data?.message || "Could not confirm receipt.");
        return;
      }
      setConfirmedAt(new Date().toISOString());
      toast.success("Receipt confirmed.");
    } catch {
      toast.error("Could not confirm receipt.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={confirm}
      className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
    >
      {busy ? "Confirming…" : "Confirm Receipt"}
    </button>
  );
}
