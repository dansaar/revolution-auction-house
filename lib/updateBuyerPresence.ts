import { getCurrentUser } from "aws-amplify/auth";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";

const client = generateClient<Schema>();

export async function updateBuyerPresence(lastSeenPage: string) {
  try {
    const user = await getCurrentUser();

    const userId = user.userId || user.username || "";
    const email = user.signInDetails?.loginId || user.username || "";

    if (!userId || !email) return;

    const existing = await client.models.BuyerProfile.get({ userId }, {
      authMode: "userPool",
    } as any);

    if (existing.data) {
      await client.models.BuyerProfile.update(
        {
          userId,
          email,
          lastSeenAt: new Date().toISOString(),
          lastSeenPage,
        },
        { authMode: "userPool" } as any,
      );
    } else {
      await client.models.BuyerProfile.create(
        {
          userId,
          email,
          displayName: email,
          lastSeenAt: new Date().toISOString(),
          lastSeenPage,
        },
        { authMode: "userPool" } as any,
      );
    }
  } catch {
    // Do not block page loading for presence updates.
  }
}
