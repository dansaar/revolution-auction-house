import { NextResponse } from "next/server";
import Stripe from "stripe";
import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";
import outputs from "@/amplify_outputs.json";

Amplify.configure(outputs);

const client = generateClient<Schema>();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  const { sessionId } = await req.json();

  if (!sessionId) {
    return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
  }

  const session = await stripe.checkout.sessions.retrieve(sessionId);

  if (session.payment_status !== "paid") {
    return NextResponse.json({ paid: false });
  }

  const auctionId = session.metadata?.auctionId;

  if (!auctionId) {
    return NextResponse.json({ error: "Missing auctionId" }, { status: 400 });
  }

  await client.models.Auction.update(
    {
      id: auctionId,
      paid: true,
      paidAt: new Date().toISOString(),
      stripeSessionId: sessionId,
      status: "PAID",
    },
    {
      authMode: "apiKey",
    } as any,
  );

  return NextResponse.json({ paid: true, auctionId });
}
