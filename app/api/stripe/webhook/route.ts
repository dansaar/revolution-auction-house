import Stripe from "stripe";
import { headers } from "next/headers";

import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";

import outputs from "@/amplify_outputs.json";
import type { Schema } from "@/amplify/data/resource";

Amplify.configure(outputs);

const client = generateClient<Schema>();

const stripeSecretKey =
  process.env.STRIPE_SECRET_KEY || process.env.AMPLIFY_STRIPE_SECRET_KEY;

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;

if (!endpointSecret) {
  throw new Error("Missing STRIPE_WEBHOOK_SECRET");
}

if (!stripeSecretKey || !endpointSecret) {
  throw new Error("Missing Stripe webhook env vars");
}

const stripe = new Stripe(stripeSecretKey);

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

    const auctionId = session.metadata?.auctionId || "";
    const listingId = session.metadata?.listingId || "";
    const buyerEmail =
      session.metadata?.buyerEmail ||
      session.customer_details?.email ||
      session.customer_email ||
      "";

    const amount = session.amount_total
      ? `$${(session.amount_total / 100).toFixed(2)}`
      : "$0.00";

    const existingInvoices = await client.models.Invoice.list({
      filter: {
        stripeSessionId: {
          eq: session.id,
        },
      },
      authMode: "apiKey",
    } as any);

    const invoiceAlreadyExists = (existingInvoices.data || []).length > 0;

    if (listingId) {
      try {
        const listingResult = await client.models.MarketplaceListing.get(
          { id: listingId },
          { authMode: "apiKey" } as any,
        );

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
          { authMode: "apiKey" } as any,
        );

        if (!invoiceAlreadyExists) {
          await client.models.Invoice.create(
            {
              type: "MARKETPLACE",
              listingId,
              title: listingResult.data?.title || "Marketplace Listing",
              buyerEmail,
              sellerEmail: listingResult.data?.sellerEmail || "",
              amount,
              status: "PAID",
              stripeSessionId: session.id,
              paidAt: new Date().toISOString(),
            },
            { authMode: "apiKey" } as any,
          );
        }

        console.log("Marketplace listing marked paid", listingId);
      } catch (err) {
        console.error("Failed to process marketplace webhook", err);
      }
    }

    if (auctionId) {
      try {
        const auctionResult = await client.models.Auction.get(
          { id: auctionId },
          { authMode: "apiKey" } as any,
        );

        await client.models.Auction.update(
          {
            id: auctionId,
            paid: true,
            paidAt: new Date().toISOString(),
            stripeSessionId: session.id,
            status: "PAID",
          },
          { authMode: "apiKey" } as any,
        );

        if (!invoiceAlreadyExists) {
          await client.models.Invoice.create(
            {
              type: "AUCTION",
              auctionId,
              title: auctionResult.data?.title || "Auction",
              buyerEmail,
              sellerEmail: auctionResult.data?.sellerEmail || "",
              amount,
              status: "PAID",
              stripeSessionId: session.id,
              paidAt: new Date().toISOString(),
            },
            { authMode: "apiKey" } as any,
          );
        }

        console.log("Auction marked paid", auctionId);
      } catch (err) {
        console.error("Failed to process auction webhook", err);
      }
    }
  }

  return new Response("OK", { status: 200 });
}
