import type { Schema } from "../../data/resource";

import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import { getAmplifyDataClientConfig } from "@aws-amplify/backend/function/runtime";
import { env } from "$amplify/env/recordFunds";
import Stripe from "stripe";

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);

const client = generateClient<Schema>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// After the buyer links a bank account, refresh its balance and store a
// proof-of-funds summary on their profile (for tier-approval review).
export const handler: Schema["recordFunds"]["functionHandler"] = async (event) => {
  const identity = event.identity as any;
  const userId = identity?.sub || identity?.claims?.sub || "";
  if (!userId) return { success: false, amount: 0, bank: null, status: null, message: "Not authenticated" };

  const accountId = event.arguments.accountId || "";
  if (!accountId) return { success: false, amount: 0, bank: null, status: null, message: "Missing account" };

  const stripeKey = (env as any).STRIPE_SECRET_KEY;
  if (!stripeKey) return { success: false, amount: 0, bank: null, status: null, message: "Stripe not configured" };
  const stripe = new Stripe(stripeKey);

  try {
    // Kick off an async balance refresh, then poll until it lands.
    await stripe.financialConnections.accounts.refresh(accountId, { features: ["balance"] });

    let account: any = null;
    for (let i = 0; i < 8; i++) {
      account = await stripe.financialConnections.accounts.retrieve(accountId);
      if (account?.balance?.current) break;
      await sleep(1500);
    }

    const bankLabel = [account?.institution_name, account?.last4 ? `••${account.last4}` : ""]
      .filter(Boolean)
      .join(" ");

    if (!account?.balance?.current) {
      // Linked but balance not yet available — store pending so it's visible.
      await client.models.BuyerProfile.update(
        { userId, proofOfFundsBank: bankLabel || "Bank linked", proofOfFundsStatus: "PENDING", proofOfFundsAt: new Date().toISOString() } as any,
        { authMode: "iam" } as any,
      );
      return { success: true, amount: 0, bank: bankLabel, status: "PENDING", message: "Bank linked — balance is still refreshing. Check back shortly." };
    }

    // balance.current is a map like { usd: <cents> }; take the USD figure.
    const current = account.balance.current as Record<string, number>;
    const cents = Number(current.usd ?? Object.values(current)[0] ?? 0);

    await client.models.BuyerProfile.update(
      {
        userId,
        proofOfFundsAmount: cents,
        proofOfFundsCurrency: "usd",
        proofOfFundsBank: bankLabel || "Bank linked",
        proofOfFundsStatus: "VERIFIED",
        proofOfFundsAt: new Date().toISOString(),
      } as any,
      { authMode: "iam" } as any,
    );

    return { success: true, amount: cents, bank: bankLabel, status: "VERIFIED", message: "Funds verified." };
  } catch (err: any) {
    console.error("RECORD_FUNDS_ERROR", err?.message || err);
    return { success: false, amount: 0, bank: null, status: null, message: err?.message || "Could not read balance" };
  }
};
