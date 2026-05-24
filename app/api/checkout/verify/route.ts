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
  const listingId = session.metadata?.listingId;
  const buyerEmail =
    session.customer_details?.email || session.customer_email || "";

  if (listingId) {
    await client.models.MarketplaceListing.update(
      {
        id: listingId,
        sold: true,
        paid: true,
        paidAt: new Date().toISOString(),
        stripeSessionId: sessionId,
        buyerEmail,
        status: "SOLD",
      },
      {
        authMode: "apiKey",
      } as any,
    );

    return NextResponse.json({ paid: true, listingId });
  }

  if (auctionId) {
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

  return NextResponse.json(
    { error: "Missing auctionId or listingId" },
    { status: 400 },
  );
}
