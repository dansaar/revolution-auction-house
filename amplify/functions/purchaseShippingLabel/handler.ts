import type { Schema } from "../../data/resource";

import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import { getAmplifyDataClientConfig } from "@aws-amplify/backend/function/runtime";
import { env } from "$amplify/env/purchaseShippingLabel";
import EasyPost from "@easypost/api";

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);

const client = generateClient<Schema>();
const EASYPOST_API_KEY = (env as any).EASYPOST_API_KEY || "";

// EasyPost puts the actionable detail in err.errors[] (field-level messages),
// not just err.message. Flatten it so the real reason reaches the UI.
function easypostError(err: any): string {
  const parts: string[] = [];
  if (err?.message) parts.push(String(err.message));
  const sub = err?.errors || err?.error?.errors;
  if (Array.isArray(sub)) {
    for (const e of sub) {
      const f = e?.field ? `${e.field}: ` : "";
      if (e?.message || e?.field) parts.push(`${f}${e?.message || ""}`);
    }
  }
  return [...new Set(parts.filter(Boolean))].join(" — ") || "Failed to purchase label";
}

export const handler: Schema["purchaseShippingLabel"]["functionHandler"] = async (event) => {
  const { itemId, itemType, shipmentId, rateId } = event.arguments;

  const identity = event.identity as any;
  const callerSub = String(identity?.sub || identity?.claims?.sub || "");
  const callerGroups: string[] = identity?.claims?.["cognito:groups"] ?? [];
  const isAdmin = callerGroups.includes("Admin");

  try {
    if (!EASYPOST_API_KEY) {
      return { success: false, trackingNumber: null, carrier: null, labelUrl: null, error: "EasyPost not configured" };
    }

    // Verify the caller owns the item
    if (itemType === "AUCTION") {
      const result = await client.models.Auction.get({ id: itemId }, { authMode: "iam" } as any);
      const item = result.data as any;
      if (!item) return { success: false, trackingNumber: null, carrier: null, labelUrl: null, error: "Auction not found" };
      if (!isAdmin && item.sellerUserId !== callerSub) {
        return { success: false, trackingNumber: null, carrier: null, labelUrl: null, error: "Not authorized" };
      }
    } else {
      const result = await client.models.MarketplaceListing.get({ id: itemId }, { authMode: "iam" } as any);
      const item = result.data as any;
      if (!item) return { success: false, trackingNumber: null, carrier: null, labelUrl: null, error: "Listing not found" };
      if (!isAdmin && item.sellerUserId !== callerSub) {
        return { success: false, trackingNumber: null, carrier: null, labelUrl: null, error: "Not authorized" };
      }
    }

    const ep = new EasyPost(EASYPOST_API_KEY);

    // Buy the selected rate
    const purchased = await (ep.Shipment as any).buy(shipmentId, { id: rateId });

    const trackingNumber = (purchased as any).tracking_code || "";
    const carrier = (purchased as any).selected_rate?.carrier || "";
    const labelUrl = (purchased as any).postage_label?.label_url || "";
    const easypostShipmentId = (purchased as any).id || shipmentId;
    // EasyPost's universal public tracking page — fallback link when we don't
    // have a carrier-specific tracking URL.
    const trackingUrl = (purchased as any).tracker?.public_url || "";

    const now = new Date().toISOString();

    if (itemType === "AUCTION") {
      await client.models.Auction.update(
        {
          id: itemId,
          shippingStatus: "SHIPPED",
          carrier,
          trackingNumber,
          trackingUrl,
          shippedAt: now,
          easypostShipmentId,
          shippingLabelUrl: labelUrl,
        },
        { authMode: "iam" } as any,
      );
    } else {
      await client.models.MarketplaceListing.update(
        {
          id: itemId,
          shippingStatus: "SHIPPED",
          carrier,
          trackingNumber,
          trackingUrl,
          shippedAt: now,
          easypostShipmentId,
          shippingLabelUrl: labelUrl,
        },
        { authMode: "iam" } as any,
      );
    }

    return { success: true, trackingNumber, carrier, labelUrl, error: null };
  } catch (err: any) {
    console.error("PURCHASE_SHIPPING_LABEL_ERROR", JSON.stringify(err?.errors || err?.message || err));
    return { success: false, trackingNumber: null, carrier: null, labelUrl: null, error: easypostError(err) };
  }
};
