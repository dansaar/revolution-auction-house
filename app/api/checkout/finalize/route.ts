// app/api/checkout/finalize/route.ts

import { NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getStripe() {
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not set.");
  }

  return new Stripe(secretKey);
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));

    const sessionId = body.sessionId ?? body.session_id;

    if (!sessionId || typeof sessionId !== "string") {
      return NextResponse.json(
        { error: "Missing checkout session id." },
        { status: 400 },
      );
    }

    const stripe = getStripe();

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["line_items", "payment_intent", "customer"],
    });

    if (session.payment_status !== "paid") {
      return NextResponse.json(
        {
          error: "Checkout session has not been paid.",
          paymentStatus: session.payment_status,
        },
        { status: 400 },
      );
    }

    // TODO: Add your database/order logic here.
    // Example:
    // await markOrderPaid({
    //   checkoutSessionId: session.id,
    //   paymentIntentId:
    //     typeof session.payment_intent === "string"
    //       ? session.payment_intent
    //       : session.payment_intent?.id,
    //   customerEmail: session.customer_details?.email,
    // });

    return NextResponse.json({
      ok: true,
      finalized: true,
      sessionId: session.id,
      paymentStatus: session.payment_status,
      customerEmail: session.customer_details?.email ?? null,
    });
  } catch (error) {
    console.error("Checkout finalize error:", error);

    return NextResponse.json(
      { error: "Failed to finalize checkout." },
      { status: 500 },
    );
  }
}
