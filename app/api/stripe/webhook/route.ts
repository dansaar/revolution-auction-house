import { NextResponse } from "next/server";
import Stripe from "stripe";
import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";
import outputs from "@/amplify_outputs.json";

Amplify.configure(outputs);

const client = generateClient<Schema>();

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeSecretKey) {
    console.error("Missing STRIPE_SECRET_KEY");
    return NextResponse.json(
      { error: "Server is missing STRIPE_SECRET_KEY." },
      { status: 500 },
    );
  }

  if (!webhookSecret) {
    console.error("Missing STRIPE_WEBHOOK_SECRET");
    return NextResponse.json(
      { error: "Server is missing STRIPE_WEBHOOK_SECRET." },
      { status: 500 },
    );
  }

  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing Stripe signature." },
      { status: 400 },
    );
  }

  const stripe = new Stripe(stripeSecretKey);

  let event: Stripe.Event;

  try {
    const rawBody = await request.text();

    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    console.error("Stripe webhook signature verification failed:", error);

    return NextResponse.json(
      { error: "Invalid webhook signature." },
      { status: 400 },
    );
  }

  try {
    switch (event.type) {
      // checkout.session.completed fires immediately (card = paid; ACH = still
      // processing). async_payment_succeeded fires later when an ACH/bank debit
      // actually clears. Both run verifyPayment, which only marks items sold once
      // payment_status === "paid" — so ACH items finalize on async success.
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;

        console.log(`WEBHOOK ${event.type}:`, session.id, "payment_status:", session.payment_status);

        const result = await client.mutations.verifyPayment(
          { sessionId: session.id },
          { authMode: "apiKey" } as any,
        );

        if (result.data?.paid) {
          console.log("WEBHOOK payment verified:", session.id, result.data);
        } else {
          // For ACH this is expected on the initial "completed" event (still
          // processing); it finalizes on async_payment_succeeded.
          console.log("WEBHOOK payment not yet finalized:", session.id, result.data?.error);
        }

        break;
      }

      case "checkout.session.async_payment_failed": {
        const session = event.data.object as Stripe.Checkout.Session;
        console.error("WEBHOOK bank payment failed (ACH):", session.id, session.metadata);
        // Nothing was marked sold (we only mark on "paid"), so no rollback
        // needed. The buyer is notified by Stripe; surfaced here for monitoring.
        break;
      }

      case "identity.verification_session.verified": {
        const session = event.data.object as any;
        const buyerEmail = session.metadata?.buyerEmail;

        if (!buyerEmail) {
          console.warn("WEBHOOK identity.verified: missing buyerEmail in metadata", session.id);
          break;
        }

        const result = await client.mutations.autoVerifyBuyer(
          { email: buyerEmail, stripeSessionId: session.id, webhookToken: "unused" },
          { authMode: "apiKey" } as any,
        );

        if (result.data?.success) {
          console.log("WEBHOOK identity.verified: buyer upgraded to VERIFIED", buyerEmail);
        } else {
          console.error("WEBHOOK identity.verified: autoVerifyBuyer failed", buyerEmail);
        }

        break;
      }

      default:
        console.log(`Unhandled Stripe event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook handler failed:", error);

    return NextResponse.json(
      { error: "Webhook handler failed." },
      { status: 500 },
    );
  }
}
