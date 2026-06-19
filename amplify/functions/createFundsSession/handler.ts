import type { Schema } from "../../data/resource";

import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import { getAmplifyDataClientConfig } from "@aws-amplify/backend/function/runtime";
import { env } from "$amplify/env/createFundsSession";
import Stripe from "stripe";

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);

const client = generateClient<Schema>();

// Creates a Stripe Financial Connections session (balances + ownership) so the
// buyer can link their bank for proof-of-funds. Returns the client_secret the
// browser uses to open the bank-linking modal.
export const handler: Schema["createFundsSession"]["functionHandler"] = async (event) => {
  const identity = event.identity as any;
  const userId = identity?.sub || identity?.claims?.sub || "";
  const email = (identity?.claims?.email || "").toLowerCase();
  if (!userId) return { clientSecret: null, error: "Not authenticated" };

  const stripeKey = (env as any).STRIPE_SECRET_KEY;
  if (!stripeKey) return { clientSecret: null, error: "Stripe not configured" };
  const stripe = new Stripe(stripeKey);

  try {
    // Reuse a Stripe customer per buyer (Financial Connections account_holder
    // requires one); store the id on the profile.
    const profileRes = await client.models.BuyerProfile.get({ userId }, { authMode: "iam" } as any);
    let customerId = (profileRes.data as any)?.stripeCustomerId || "";

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: email || undefined,
        metadata: { buyerUserId: userId },
      });
      customerId = customer.id;
      if (profileRes.data) {
        await client.models.BuyerProfile.update({ userId, stripeCustomerId: customerId } as any, { authMode: "iam" } as any);
      } else {
        await client.models.BuyerProfile.create({ userId, email, stripeCustomerId: customerId } as any, { authMode: "iam" } as any);
      }
    }

    const session = await stripe.financialConnections.sessions.create({
      account_holder: { type: "customer", customer: customerId },
      permissions: ["balances", "ownership"],
      filters: { countries: ["US"] },
    });

    return { clientSecret: session.client_secret, error: null };
  } catch (err: any) {
    console.error("CREATE_FUNDS_SESSION_ERROR", err?.message || err);
    return { clientSecret: null, error: err?.message || "Could not start bank verification" };
  }
};
