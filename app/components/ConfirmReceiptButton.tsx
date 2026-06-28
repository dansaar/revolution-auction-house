"use client";

import { useState } from "react";
import { authedGraphql } from "@/lib/authedGraphql";
import { toast } from "sonner";

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
      const data = await authedGraphql<{
        confirmReceipt: { success: boolean; message: string };
      }>(
        "mutation CR($itemId:String!,$itemType:String!){confirmReceipt(itemId:$itemId,itemType:$itemType){success message}}",
        { itemId, itemType },
      );
      if (!data.confirmReceipt?.success) {
        toast.error(data.confirmReceipt?.message || "Could not confirm receipt.");
        return;
      }
      setConfirmedAt(new Date().toISOString());
      toast.success("Receipt confirmed.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not confirm receipt.");
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
