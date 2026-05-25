import Stripe from "stripe";
import { headers } from "next/headers";

import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";

import outputs from "@/amplify_outputs.json";
import type { Schema } from "@/amplify/data/resource";

Amplify.configure(outputs);

const client = generateClient<Schema>();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(req: Request) {
  const body = await req.text();

  const signature = (await headers()).get("stripe-signature");

  if (!signature) {
    return new Response("Missing stripe signature", { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, endpointSecret);
  } catch (err: any) {
    console.error("Webhook signature failed", err.message);

    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    const auctionId = session.metadata?.auctionId;
    const listingId = session.metadata?.listingId;
    const buyerEmail =
      session.metadata?.buyerEmail ||
      session.customer_details?.email ||
      session.customer_email ||
      "";

    if (listingId) {
      try {
        await client.models.MarketplaceListing.update(
          {
            id: listingId,
            sold: true,
            paid: true,
            paidAt: new Date().toISOString(),
            stripeSessionId: session.id,
            buyerEmail,
            status: "SOLD",
          },
          {
            authMode: "apiKey",
          } as any,
        );

        console.log("Marketplace listing marked paid", listingId);
      } catch (err) {
        console.error("Failed to update marketplace listing", err);
      }
    }

    if (auctionId) {
      try {
        await client.models.Auction.update(
          {
            id: auctionId,
            paid: true,
            paidAt: new Date().toISOString(),
            stripeSessionId: session.id,
            status: "PAID",
          },
          {
            authMode: "apiKey",
          } as any,
        );

        console.log("Auction marked paid", auctionId);
      } catch (err) {
        console.error("Failed to update auction", err);
      }
    }
  }

  return new Response("OK", {
    status: 200,
  });
}
