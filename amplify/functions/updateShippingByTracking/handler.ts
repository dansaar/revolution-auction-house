import type { Schema } from "../../data/resource";

import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import { getAmplifyDataClientConfig } from "@aws-amplify/backend/function/runtime";
import { env } from "$amplify/env/updateShippingByTracking";

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);

const client = generateClient<Schema>();

// Shared secret: the EasyPost webhook route passes this so a public apiKey
// caller can't spoof delivery status. Set EASYPOST_WEBHOOK_SECRET in Amplify env.
const WEBHOOK_SECRET = (env as any).WEBHOOK_SECRET || "";

// Forward-only status progression.
const STATUS_ORDER = ["PAID", "SHIPPED", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED"];
function shouldAdvance(current: string | null | undefined, next: string): boolean {
  return STATUS_ORDER.indexOf(next) > STATUS_ORDER.indexOf(current || "PAID");
}

export const handler: Schema["updateShippingByTracking"]["functionHandler"] = async (event) => {
  const { trackingCode, status, secret } = event.arguments;

  // Reject unless the caller knows the shared secret (and one is configured).
  if (!WEBHOOK_SECRET || secret !== WEBHOOK_SECRET) {
    return { updated: 0, message: "unauthorized" };
  }
  if (!trackingCode || !status) {
    return { updated: 0, message: "missing trackingCode or status" };
  }

  const now = new Date().toISOString();
  let updated = 0;

  async function advanceModel(model: any, label: string) {
    try {
      const res = await model.list({
        filter: { trackingNumber: { eq: trackingCode } },
        authMode: "iam",
        limit: 50,
      });
      for (const item of res.data || []) {
        if (!shouldAdvance(item.shippingStatus, status)) continue;
        await model.update(
          {
            id: item.id,
            shippingStatus: status,
            ...(status === "DELIVERED" ? { deliveredAt: now } : {}),
          },
          { authMode: "iam" },
        );
        updated++;
      }
    } catch (err) {
      console.error(`UPDATE_SHIPPING_${label}_ERROR`, err);
    }
  }

  await advanceModel(client.models.Auction, "AUCTION");
  await advanceModel(client.models.MarketplaceListing, "LISTING");

  return { updated, message: "ok" };
};
