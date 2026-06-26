import { NextResponse } from "next/server";
import Stripe from "stripe";
import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";
import outputs from "@/amplify_outputs.json";
import { serverLogError } from "@/lib/serverLogError";

Amplify.configure(outputs);

const client = generateClient<Schema>();

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESERVE_SECRET =
  process.env.EASYPOST_WEBHOOK_SECRET || process.env.AMPLIFY_EASYPOST_WEBHOOK_SECRET || "";

// Pull the marketplace listing ids out of a session's metadata (single buy or cart).
function listingIdsFromSession(session: Stripe.Checkout.Session): string[] {
  const ids: string[] = [];
  if (session.metadata?.listingId) ids.push(String(session.metadata.listingId));
  if (session.metadata?.cartItems) {
    try {
      for (const m of JSON.parse(session.metadata.cartItems)) {
        if (m?.type === "MARKETPLACE" && m?.id) ids.push(String(m.id));
      }
    } catch {
      /* ignore malformed metadata */
    }
  }
  return ids;
}

// Release any PENDING_PAYMENT hold we placed when the session was created (only
// listings still pending are touched — never a paid/sold item).
async function releaseSessionListings(session: Stripe.Checkout.Session) {
  const ids = listingIdsFromSession(session);
  if (!RESERVE_SECRET || ids.length === 0) return;
  try {
    await client.mutations.reserveListing(
      { listingIds: ids, action: "RELEASE", secret: RESERVE_SECRET },
      { authMode: "apiKey" } as any,
    );
  } catch (err) {
    console.error("webhook: reserveListing RELEASE failed", err);
  }
}

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
        await serverLogError({
          source: "stripe/webhook",
          message: `ACH bank payment failed: ${session.id}`,
          context: session.metadata,
          severity: "WARN",
          url: "/api/stripe/webhook",
        });
        // Nothing was marked sold (we only mark on "paid"), so release the hold
        // we placed at checkout so the listing returns to the marketplace.
        await releaseSessionListings(session);
        break;
      }

      // Buyer abandoned checkout (or it timed out) — release the reservation.
      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log("WEBHOOK checkout.session.expired:", session.id);
        await releaseSessionListings(session);
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
          await serverLogError({
            source: "stripe/webhook",
            message: `identity.verified: autoVerifyBuyer failed for ${buyerEmail}`,
            context: result.data,
            severity: "ERROR",
            url: "/api/stripe/webhook",
          });
        }

        break;
      }

      default:
        console.log(`Unhandled Stripe event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook handler failed:", error);
    await serverLogError({
      source: "stripe/webhook",
      message: error instanceof Error ? error.message : String(error),
      context: error instanceof Error ? error.stack : undefined,
      severity: "ERROR",
      url: "/api/stripe/webhook",
    });

    return NextResponse.json(
      { error: "Webhook handler failed." },
      { status: 500 },
    );
  }
}
