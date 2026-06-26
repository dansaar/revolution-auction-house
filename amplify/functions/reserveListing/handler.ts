import type { Schema } from "../../data/resource";

import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import { getAmplifyDataClientConfig } from "@aws-amplify/backend/function/runtime";
import { env } from "$amplify/env/reserveListing";

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);

const client = generateClient<Schema>();

// Shared secret: the /api/checkout route + Stripe webhook pass this so a public
// apiKey caller can't reserve/release listings. Reuses the EasyPost webhook
// secret (set as AMPLIFY_EASYPOST_WEBHOOK_SECRET / EASYPOST_WEBHOOK_SECRET).
const WEBHOOK_SECRET = (env as any).WEBHOOK_SECRET || "";

// RESERVE only flips a listing that's genuinely available; RELEASE only undoes a
// reservation we created — never a paid/sold item.
export const handler: Schema["reserveListing"]["functionHandler"] = async (event) => {
  const { listingIds, action, buyerSub, secret } = event.arguments;

  if (!WEBHOOK_SECRET || secret !== WEBHOOK_SECRET) {
    return { updated: 0, message: "unauthorized" };
  }
  if (!Array.isArray(listingIds) || listingIds.length === 0 || !action) {
    return { updated: 0, message: "missing listingIds or action" };
  }

  let updated = 0;

  for (const rawId of listingIds) {
    const id = String(rawId || "");
    if (!id) continue;
    try {
      const cur = (await client.models.MarketplaceListing.get(
        { id },
        { authMode: "iam" },
      )).data as any;
      if (!cur) continue;

      if (action === "RESERVE") {
        // Don't reserve anything that's already sold/paid or otherwise spoken for.
        if (cur.sold === true || cur.paid === true) continue;
        const blocked = ["SOLD", "OFFER_PENDING", "OFFER_ACCEPTED", "PENDING_PAYMENT"];
        if (blocked.includes(cur.status)) continue;
        await client.models.MarketplaceListing.update(
          { id, status: "PENDING_PAYMENT", pendingBuyerSub: buyerSub || null },
          { authMode: "iam" },
        );
        updated++;
      } else if (action === "RELEASE") {
        // Only undo our own checkout hold — leave sold/active items alone.
        if (cur.status !== "PENDING_PAYMENT") continue;
        await client.models.MarketplaceListing.update(
          { id, status: "ACTIVE", pendingBuyerSub: null },
          { authMode: "iam" },
        );
        updated++;
      }
    } catch {
      /* skip this id, keep going */
    }
  }

  return { updated, message: "ok" };
};
